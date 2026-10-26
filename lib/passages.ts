import "server-only";
import type { RowDataPacket } from "mysql2/promise";
import { dayKey } from "@/lib/catalog";
import { query } from "@/lib/db";

const PAGE_SIZE = 20;

type LatestRow = RowDataPacket & {
  alvo: string;
  outcome: string;
  failure_reason: string | null;
  created_at: Date | string;
  id: number;
};

type GroupRow = RowDataPacket & {
  alvo: string;
  barricade_id: number | null;
  slug: string | null;
  barricade_name: string | null;
  calls: number;
  ran: number;
  first_id: number;
  outcome: string;
  failure_reason: string | null;
  processed_name: string | null;
};

const ROUTE_LABEL: Record<string, string> = {
  perfil: "Perfil",
  posts: "Posts",
  seguidores: "Seguidores",
  seguindo: "Seguindo",
  similares: "Similares",
  marcacoes: "Marcações",
  id: "Id",
  lookup: "Consulta",
};

export type PassageRoute = {
  key: string;
  label: string;
  outcome: string;
  failure: string | null;
  ran: boolean;
};

export type PassageColumn = {
  key: string;
  label: string;
};

export type Passage = {
  alvo: string;
  routes: Record<string, PassageRoute[]>;
  activated: number;
  finalOutcome: string;
  finalFailure: string | null;
  lastAt: Date | string;
  calls: number;
};

function isDay(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function isIp(value: string) {
  if (/^(?:\d{1,3}\.){3}\d{1,3}$/.test(value)) {
    return value.split(".").every((part) => Number(part) <= 255);
  }
  return value.includes(":") && /^[0-9a-fA-F:.]+$/.test(value);
}

function kindOf(alvo: string) {
  const value = alvo.trim();
  if (value.startsWith("@")) return "instagram" as const;
  if (isIp(value)) return "ip" as const;
  if (/\d/.test(value)) return "telefone" as const;
  return null;
}

function routeFromSuffix(suffix: string) {
  const key = suffix.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
  return ROUTE_LABEL[key] ?? `${suffix.charAt(0).toUpperCase()}${suffix.slice(1)}`;
}

function describeReserve(name: string) {
  const cleanName = name.trim();
  const marker = cleanName.lastIndexOf(" · ");
  if (marker > 0) {
    const suffix = cleanName.slice(marker + 3);
    const familyLabel = cleanName.slice(0, marker);
    return { familyKey: familyLabel.toLowerCase(), familyLabel, routeKey: suffix, routeLabel: routeFromSuffix(suffix) };
  }
  return { familyKey: cleanName.toLowerCase(), familyLabel: cleanName, routeKey: "perfil", routeLabel: "Perfil" };
}

function describeBarricade(name: string, slug: string) {
  const cleanName = name.trim() || "Barricada";
  const cleanSlug = slug.trim().toLowerCase();
  const slash = cleanSlug.indexOf("/");
  const familyKey = slash >= 0 ? cleanSlug.slice(0, slash) : cleanSlug || cleanName.toLowerCase();
  const routeKey = slash >= 0 ? cleanSlug.slice(slash + 1) : "";
  const marker = cleanName.lastIndexOf(" · ");
  const familyLabel = marker > 0 ? cleanName.slice(0, marker) : cleanName;
  const routeLabel = routeKey
    ? ROUTE_LABEL[routeKey] ?? (marker > 0 ? cleanName.slice(marker + 3) : routeKey)
    : "";
  return { familyKey, familyLabel, routeKey: routeKey || familyKey, routeLabel };
}

export async function listPassages(input: { from?: string; to?: string; q?: string }) {
  const today = dayKey();
  const from = input.from && isDay(input.from) ? input.from : today;
  const to = input.to && isDay(input.to) ? input.to : from;
  const start = from <= to ? from : to;
  const end = from <= to ? to : from;
  const term = (input.q ?? "").trim().slice(0, 80);
  const where = [
    "log_scope = 'geral'",
    "alvo IS NOT NULL",
    "alvo <> ''",
    "outcome <> 'verificacao'",
    "day_key BETWEEN ? AND ?",
  ];
  const params: string[] = [start, end];
  if (term) {
    where.push("alvo LIKE ?");
    params.push(`%${term.replace(/[\\%_]/g, (char) => `\\${char}`)}%`);
  }
  const filter = where.join(" AND ");
  const [latestRows, groupRows] = await Promise.all([
    query<LatestRow[]>(
      `SELECT l.alvo, l.outcome, l.failure_reason, l.created_at, l.id
       FROM call_logs l
       INNER JOIN (
         SELECT alvo, MAX(id) AS id
         FROM call_logs
         WHERE ${filter}
         GROUP BY alvo
       ) latest ON latest.id = l.id`,
      params,
    ),
    query<GroupRow[]>(
      `SELECT g.alvo, g.barricade_id, b.slug, COALESCE(b.name, l.barricade_name) AS barricade_name,
         g.calls, g.ran, g.first_id, l.outcome, l.failure_reason, l.processed_name
       FROM (
         SELECT alvo, barricade_id, COUNT(*) AS calls,
           SUM(CASE WHEN outcome <> 'rejeitada' THEN 1 ELSE 0 END) AS ran,
           MIN(id) AS first_id, MAX(id) AS last_id
         FROM call_logs
         WHERE ${filter}
         GROUP BY alvo, barricade_id
       ) g
       INNER JOIN call_logs l ON l.id = g.last_id
       LEFT JOIN barricades b ON b.id = g.barricade_id`,
      params,
    ),
  ]);

  const latest = new Map(latestRows.map((row) => [row.alvo, row]));
  type Draft = Passage & {
    kind: "instagram" | "telefone" | "ip";
    lastId: number;
    hits: Array<PassageRoute & { familyKey: string; familyLabel: string; firstId: number }>;
  };
  const grouped = new Map<string, Draft>();
  for (const row of groupRows) {
    const kind = kindOf(row.alvo);
    const final = latest.get(row.alvo);
    if (!kind || !final) continue;
    const calledName = row.barricade_name ?? "";
    const described = describeBarricade(calledName, row.slug ?? "");
    const reserveName = (row.processed_name ?? "").trim();
    const reserveUsed = reserveName.length > 0 && reserveName !== calledName.trim();
    const current = grouped.get(row.alvo) ?? {
      alvo: row.alvo,
      kind,
      routes: {},
      hits: [],
      finalOutcome: final.outcome,
      finalFailure: final.failure_reason,
      lastAt: final.created_at,
      lastId: Number(final.id),
      calls: 0,
      activated: 0,
    };
    current.calls += Number(row.calls);
    const ran = Number(row.ran) > 0;
    current.hits.push({
      familyKey: described.familyKey,
      familyLabel: described.familyLabel,
      key: described.routeKey,
      label: described.routeLabel,
      outcome: reserveUsed && row.outcome !== "rejeitada" && row.outcome !== "sucesso" ? "falha" : row.outcome,
      failure: reserveUsed ? null : row.failure_reason,
      ran,
      firstId: Number(row.first_id),
    });
    if (reserveUsed && row.outcome !== "rejeitada") {
      const reserve = describeReserve(reserveName);
      current.hits.push({
        familyKey: reserve.familyKey,
        familyLabel: reserve.familyLabel,
        key: reserve.routeKey,
        label: reserve.routeLabel,
        outcome: row.outcome === "fallback" ? "sucesso" : row.outcome,
        failure: row.outcome === "fallback" ? null : row.failure_reason,
        ran: true,
        firstId: Number(row.first_id) + 0.5,
      });
    }
    grouped.set(row.alvo, current);
  }

  const instagram: Passage[] = [];
  const telefone: Passage[] = [];
  const ip: Passage[] = [];
  const columns = {
    instagram: new Map<string, { label: string; firstId: number }>(),
    telefone: new Map<string, { label: string; firstId: number }>(),
    ip: new Map<string, { label: string; firstId: number }>(),
  };
  const sorted = [...grouped.values()].sort((a, b) => b.lastId - a.lastId);
  for (const item of sorted) {
    const routes: Record<string, PassageRoute[]> = {};
    const labels = new Map<string, { routeKey: string; label: string }[]>();
    for (const hit of [...item.hits].sort((a, b) => b.firstId - a.firstId)) {
      const list = routes[hit.familyKey] ?? [];
      if (!list.some((route) => route.key === hit.key)) {
        list.push({ key: hit.key, label: hit.label, outcome: hit.outcome, failure: hit.failure, ran: hit.ran });
      }
      routes[hit.familyKey] = list;
      const known = labels.get(hit.familyKey) ?? [];
      known.push({ routeKey: hit.key, label: hit.familyLabel });
      labels.set(hit.familyKey, known);
      const column = columns[item.kind].get(hit.familyKey);
      if (!column || hit.firstId < column.firstId) {
        columns[item.kind].set(hit.familyKey, { label: hit.familyLabel, firstId: hit.firstId });
      }
    }
    for (const [key, options] of labels) {
      const perfil = options.find((option) => option.routeKey === "perfil");
      const label = perfil?.label ?? options.reduce((best, option) => option.label.length < best.length ? option.label : best, options[0]?.label ?? "Barricada");
      const column = columns[item.kind].get(key);
      if (column) column.label = label;
    }
    for (const key of Object.keys(routes)) routes[key].reverse();
    const passage: Passage = {
      alvo: item.alvo,
      routes,
      activated: Object.values(routes).filter((items) => items.some((route) => route.ran)).length,
      finalOutcome: item.finalOutcome,
      finalFailure: item.finalFailure,
      lastAt: item.lastAt,
      calls: item.calls,
    };
    if (item.kind === "instagram") instagram.push(passage);
    else if (item.kind === "telefone") telefone.push(passage);
    else ip.push(passage);
  }

  const ordered = (kind: "instagram" | "telefone" | "ip"): PassageColumn[] =>
    [...columns[kind].entries()]
      .sort((a, b) => a[1].firstId - b[1].firstId)
      .map(([key, column]) => ({ key, label: column.label }));

  return {
    from: start,
    to: end,
    instagram,
    telefone,
    ip,
    columns: {
      instagram: ordered("instagram"),
      telefone: ordered("telefone"),
      ip: ordered("ip"),
    },
    pageSize: PAGE_SIZE,
  };
}
