import "server-only";
import type { RowDataPacket } from "mysql2/promise";
import { dayKey } from "@/lib/catalog";
import { query } from "@/lib/db";
import { lookupInstagramProfile, readInstagramHandle, recordInstagramLookup } from "@/lib/instagram-page";

const PAGE_SIZE = 20;

type FailureRow = RowDataPacket & {
  id: number;
  alvo: string;
  failure_reason: string | null;
  created_at: Date | string;
};

export type ProfileFailureKind = "inexistente" | "invalido" | "falhou";

export type ProfileFailure = {
  id: number;
  alvo: string;
  kind: ProfileFailureKind;
  reason: string;
  createdAt: Date | string;
};

export type ProfileFailureReport = {
  from: string;
  to: string;
  total: number;
  missing: number;
  invalidName: number;
  failed: number;
  missingPercent: string;
  invalidPercent: string;
  failedPercent: string;
  profiles: number;
  rows: ProfileFailure[];
  page: number;
  pages: number;
  pageSize: number;
};

function isDay(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function includesAny(text: string, phrases: string[]) {
  return phrases.some((phrase) => text.includes(phrase));
}

const NOT_FOUND = [
  "does not exist",
  "data not found",
  "couldn't find",
  "could not find",
  "user not found",
  "username is not valid",
  "user id is not valid",
  "invalid or missing username",
  "não é um usuário",
];

const OUTAGE = [
  "rate limit",
  "too many",
  "429",
  "509",
  "http_5",
  "tempo esgotado",
  "tempo_esgotado",
  "timeout",
  "timed out",
  "conexao",
  "conexão",
  "sem conexão",
  "indisponivel",
  "indisponível",
  "cota",
  "exceeded",
];

export function classifyProfileFailure(reason: string | null | undefined): { kind: ProfileFailureKind; reason: string } {
  const text = (reason ?? "").toLowerCase();
  if (includesAny(text, ["should not contain spaces", "invalid characters"])) {
    return { kind: "invalido", reason: "O nome não é um usuário válido." };
  }
  if (includesAny(text, NOT_FOUND)) {
    return { kind: "inexistente", reason: "O usuário não existe." };
  }
  const idMissing = text.includes("id numérico") || text.includes("id numerico") || text.includes("id_instagram");
  if (idMissing && !includesAny(text, OUTAGE)) {
    return { kind: "inexistente", reason: "Nenhuma barricada achou esse usuário." };
  }
  if (includesAny(text, ["429", "rate limit", "too many", "exceeded"])) {
    return { kind: "falhou", reason: "Limite de requisições." };
  }
  if (text.includes("509") || text.includes("cota")) {
    return { kind: "falhou", reason: "A cota da API estourou." };
  }
  if (includesAny(text, ["tempo esgotado", "tempo_esgotado", "timeout", "timed out"])) {
    return { kind: "falhou", reason: "O tempo da API esgotou." };
  }
  if (includesAny(text, ["conexao", "conexão", "sem conexão"])) {
    return { kind: "falhou", reason: "Sem conexão com a API." };
  }
  return { kind: "falhou", reason: "Todas as barricadas falharam." };
}

async function confirmMissing(rows: ProfileFailure[]) {
  const handles = [...new Set(rows.flatMap((row) => {
    if (row.kind === "invalido") return [];
    const handle = readInstagramHandle(row.alvo);
    return handle ? [handle] : [];
  }))];
  const known = await latestLookups(handles);
  const pending = handles.filter((handle) => known.get(handle) !== true);
  await mapLimit(pending, 4, async (handle) => {
    const result = await lookupInstagramProfile(handle);
    if (!result.ok) return;
    known.set(result.usuario, result.existe);
    await recordInstagramLookup(result.usuario, result.existe);
  });

  for (const row of rows) {
    if (row.kind === "invalido") continue;
    const handle = readInstagramHandle(row.alvo);
    const existe = handle ? known.get(handle) : undefined;
    if (existe === false) {
      row.kind = "inexistente";
      row.reason = "O perfil não existe.";
      continue;
    }
    if (row.kind !== "inexistente") continue;
    row.kind = "falhou";
    row.reason = existe === true ? "O perfil existe, mas a busca falhou." : "Não foi possível confirmar se o perfil existe.";
  }
}

async function latestLookups(handles: string[]) {
  const known = new Map<string, boolean>();
  if (handles.length === 0) return known;
  const marks = handles.map(() => "?").join(", ");
  const saved = await query<Array<RowDataPacket & { usuario: string; existe: number }>>(
    `SELECT c.usuario, c.existe
     FROM instagram_consultas c
     INNER JOIN (
       SELECT usuario, MAX(id) AS id
       FROM instagram_consultas
       WHERE usuario IN (${marks})
       GROUP BY usuario
     ) ultima ON ultima.id = c.id`,
    handles,
  );
  for (const row of saved) known.set(row.usuario, Number(row.existe) === 1);
  return known;
}

async function mapLimit<T>(items: T[], limit: number, worker: (item: T) => Promise<void>) {
  if (items.length === 0) return;
  let next = 0;
  async function run() {
    while (next < items.length) {
      const index = next;
      next += 1;
      await worker(items[index]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => run()));
}

function percent(part: number, total: number) {
  if (total <= 0) return "0%";
  return `${new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 }).format((part / total) * 100)}%`;
}

export async function profileFailureReport(input: { from?: string; to?: string; page?: number }): Promise<ProfileFailureReport> {
  const today = dayKey();
  const from = input.from && isDay(input.from) ? input.from : today;
  const to = input.to && isDay(input.to) ? input.to : from;
  const start = from <= to ? from : to;
  const end = from <= to ? to : from;
  const rows = await query<FailureRow[]>(
    `SELECT l.id, l.alvo, l.failure_reason, l.created_at
     FROM call_logs l
     INNER JOIN barricades b ON b.id = l.barricade_id
     INNER JOIN (
       SELECT MAX(l2.id) AS id
       FROM call_logs l2
       INNER JOIN barricades b2 ON b2.id = l2.barricade_id
       WHERE l2.log_scope = 'geral'
         AND l2.alvo LIKE '@%'
         AND b2.slug = 'instagram-stable/perfil'
         AND l2.day_key BETWEEN ? AND ?
       GROUP BY LOWER(l2.alvo)
     ) ultima ON ultima.id = l.id
     WHERE l.outcome = 'falha'
     ORDER BY l.id DESC`,
    [start, end],
  );
  const classified = rows.map((row) => {
    const result = classifyProfileFailure(row.failure_reason);
    return {
      id: Number(row.id),
      alvo: row.alvo,
      kind: result.kind,
      reason: result.reason,
      createdAt: row.created_at,
    };
  });
  await confirmMissing(classified);
  const missing = classified.filter((row) => row.kind === "inexistente").length;
  const invalidName = classified.filter((row) => row.kind === "invalido").length;
  const failed = classified.length - missing - invalidName;
  const page = Number.isInteger(input.page) && (input.page ?? 0) > 0 ? input.page ?? 1 : 1;
  const pages = Math.max(1, Math.ceil(classified.length / PAGE_SIZE));
  const current = Math.min(page, pages);
  return {
    from: start,
    to: end,
    total: classified.length,
    missing,
    invalidName,
    failed,
    missingPercent: percent(missing, classified.length),
    invalidPercent: percent(invalidName, classified.length),
    failedPercent: percent(failed, classified.length),
    profiles: new Set(classified.map((row) => row.alvo.toLowerCase())).size,
    rows: classified.slice((current - 1) * PAGE_SIZE, current * PAGE_SIZE),
    page: current,
    pages,
    pageSize: PAGE_SIZE,
  };
}
