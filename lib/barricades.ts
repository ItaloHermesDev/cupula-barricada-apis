import "server-only";
import type { RowDataPacket } from "mysql2/promise";
import { isIP } from "net";
import { execute, query } from "@/lib/db";
import { getApi, joinUrl } from "@/lib/apis";
import { decryptSecret, encryptSecret, generateToken, hashToken, tokenMatches } from "@/lib/secrets";
import { validateResponseTemplate } from "@/lib/transform";
import {
  isHttpMethod,
  type AcceptedParam,
  type HttpMethod,
} from "@/lib/catalog";

export type BarricadeRecord = {
  id: number;
  apiId: number;
  apiName: string;
  apiUrl: string;
  apiMethod: HttpMethod;
  name: string;
  description: string;
  slug: string;
  method: HttpMethod;
  tokenPrefix: string;
  tokenHash: string;
  origins: string[];
  dailyLimit: number;
  minuteLimit: number;
  params: AcceptedParam[];
  allowedHeaders: string[];
  responseTemplate: string;
  active: boolean;
  fallbackId: number | null;
  fallbackOn: string[];
  idempotent: boolean;
  configVersion: number;
  createdAt: Date | string;
  lastUsedAt: Date | string | null;
  usedToday: number;
  internalToday: number;
  healthEnabled: boolean;
  healthOk: boolean | null;
  healthCheckedAt: Date | string | null;
  healthLatencyMs: number | null;
  healthDetail: string | null;
  healthImage: string | null;
  healthIntervalMinutes: number;
  logoUpdatedAt: Date | string | null;
};

export type BarricadeInput = {
  apiId: number;
  name: string;
  description: string;
  slug: string;
  method: HttpMethod;
  origins: string[];
  dailyLimit: number;
  minuteLimit: number;
  params: AcceptedParam[];
  allowedHeaders: string[];
  responseTemplate: string;
  active: boolean;
  fallbackId: number | null;
  fallbackOn: string[];
  idempotent: boolean;
};

interface BarricadeRow extends RowDataPacket {
  id: number;
  api_id: number;
  api_name: string;
  api_base_url: string;
  api_endpoint_path: string;
  api_method: string;
  name: string;
  description: string;
  slug: string;
  method: string;
  token_prefix: string;
  token_hash: string;
  origins_json: string;
  daily_limit: number;
  minute_limit: number;
  params_json: string;
  headers_json: string;
  response_template: string | null;
  active: number;
  fallback_id: number | null;
  fallback_on: string;
  idempotent: number;
  config_version: number;
  created_at: Date | string;
  last_used_at: Date | string | null;
  used_today: number;
  internal_today: number;
  health_enabled: number;
  health_ok: number | null;
  health_checked_at: Date | string | null;
  health_latency_ms: number | null;
  health_detail: string | null;
  health_image: string | null;
  health_interval_minutes: number;
  logo_updated_at: Date | string | null;
}

export class BarricadeValidationError extends Error {}

const FALLBACK_KEYS = ["timeout", "conexao", "http_5xx", "cota"] as const;
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*(?:\/[a-z0-9]+(?:-[a-z0-9]+)*)*$/;

export function isBarricadeSlug(slug: string) {
  return SLUG.test(slug);
}

export async function listBarricades(day: string) {
  const rows = await query<BarricadeRow[]>(`${SELECT_BARRICADE}`, [day]);
  return rows.map(mapBarricade);
}

export async function getBarricade(id: number, day: string) {
  const rows = await query<BarricadeRow[]>(`${SELECT_BARRICADE} WHERE b.id = ? LIMIT 1`, [day, id]);
  return rows[0] ? mapBarricade(rows[0]) : null;
}

export async function getBarricadeBySlug(slug: string) {
  const rows = await query<BarricadeRow[]>(
    `${SELECT_BARRICADE} WHERE b.slug = ? LIMIT 1`,
    [dayPlaceholder(), slug],
  );
  return rows[0] ? mapBarricade(rows[0]) : null;
}

export async function createBarricade(input: BarricadeInput, token?: string) {
  const normalized = await normalize(input, null);
  const issued = issueToken(token);
  const result = await execute(
    `INSERT INTO barricades (
      api_id, name, description, slug, method, token_hash, token_prefix, token_cipher, origins_json, daily_limit,
      minute_limit, params_json, headers_json, response_template, active, fallback_id, fallback_on, idempotent
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [...sharedParams(normalized), issued.hash, issued.prefix, issued.cipher, ...tailParams(normalized)],
  );
  return { id: Number(result.insertId), token: issued.token };
}

export async function updateBarricade(id: number, input: BarricadeInput) {
  const normalized = await normalize(input, id);
  const result = await execute(
    `UPDATE barricades SET
      api_id = ?, name = ?, description = ?, slug = ?, method = ?, origins_json = ?, daily_limit = ?,
      minute_limit = ?, params_json = ?, headers_json = ?, response_template = ?, active = ?, fallback_id = ?,
      fallback_on = ?, idempotent = ?, config_version = config_version + 1
     WHERE id = ?`,
    [
      normalized.apiId,
      normalized.name,
      normalized.description,
      normalized.slug,
      normalized.method,
      JSON.stringify(normalized.origins),
      normalized.dailyLimit,
      normalized.minuteLimit,
      JSON.stringify(normalized.params),
      JSON.stringify(normalized.allowedHeaders),
      normalized.responseTemplate || null,
      normalized.active ? 1 : 0,
      normalized.fallbackId,
      normalized.fallbackOn.join(","),
      normalized.idempotent ? 1 : 0,
      id,
    ],
  );
  return result.affectedRows > 0;
}

export async function regenerateToken(id: number) {
  const issued = issueToken();
  const result = await execute(
    "UPDATE barricades SET token_hash = ?, token_prefix = ?, token_cipher = ?, config_version = config_version + 1 WHERE id = ?",
    [issued.hash, issued.prefix, issued.cipher, id],
  );
  if (result.affectedRows === 0) return null;
  return issued.token;
}

export async function revealToken(id: number) {
  const rows = await query<(RowDataPacket & { token_cipher: string | null })[]>(
    "SELECT token_cipher FROM barricades WHERE id = ? LIMIT 1",
    [id],
  );
  const cipher = rows[0]?.token_cipher;
  if (!cipher) return null;
  try {
    return decryptSecret(cipher);
  } catch {
    return null;
  }
}

export async function deleteBarricade(id: number) {
  const rows = await query<(RowDataPacket & { api_id: number })[]>(
    "SELECT api_id FROM barricades WHERE id = ? LIMIT 1",
    [id],
  );
  const linked = await query<(RowDataPacket & { api_id: number })[]>(
    "SELECT api_id FROM barricade_sources WHERE barricade_id = ?",
    [id],
  );
  const apiIds = [...new Set([rows[0]?.api_id, ...linked.map((row) => row.api_id)].filter((apiId): apiId is number => Boolean(apiId)))];
  await execute("UPDATE barricades SET fallback_id = NULL WHERE fallback_id = ?", [id]);
  await execute("DELETE FROM barricade_logos WHERE barricade_id = ?", [id]);
  await execute("DELETE FROM barricades WHERE id = ?", [id]);
  for (const apiId of apiIds) {
    const left = await query<(RowDataPacket & { total: number })[]>(
      `SELECT
         (SELECT COUNT(*) FROM barricades WHERE api_id = ?) +
         (SELECT COUNT(*) FROM barricade_sources WHERE api_id = ?) AS total`,
      [apiId, apiId],
    );
    if (Number(left[0]?.total ?? 0) === 0) {
      await execute("DELETE FROM external_apis WHERE id = ?", [apiId]);
    }
  }
}

function issueToken(token?: string) {
  const trimmed = token?.trim() ?? "";
  if (trimmed && (trimmed.length < 16 || trimmed.length > 200 || /\s/.test(trimmed))) {
    throw new BarricadeValidationError("O token precisa ter entre 16 e 200 caracteres, sem espaços.");
  }
  const issued = trimmed ? { token: trimmed, hash: hashToken(trimmed), prefix: trimmed.slice(0, 12) } : generateToken();
  return { ...issued, cipher: encryptSecret(issued.token) };
}

export async function verifyBarricadeToken(token: string, hash: string) {
  return tokenMatches(token, hash);
}

const SELECT_BARRICADE = `
  SELECT b.*, a.name AS api_name, a.base_url AS api_base_url, a.endpoint_path AS api_endpoint_path,
    a.method AS api_method, COALESCE(u.executed, 0) AS used_today,
    COALESCE(u.internal_count, 0) AS internal_today,
    (SELECT updated_at FROM barricade_logos WHERE barricade_id = b.id) AS logo_updated_at
  FROM barricades b
  JOIN external_apis a ON a.id = b.api_id
  LEFT JOIN usage_daily u ON u.barricade_id = b.id AND u.day_key = ?
`;

function dayPlaceholder() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function mapBarricade(row: BarricadeRow): BarricadeRecord {
  return {
    id: row.id,
    apiId: row.api_id,
    apiName: row.api_name,
    apiUrl: joinUrl(row.api_base_url, row.api_endpoint_path),
    apiMethod: isHttpMethod(row.api_method) ? row.api_method : "GET",
    name: row.name,
    description: row.description,
    slug: row.slug,
    method: isHttpMethod(row.method) ? row.method : "GET",
    tokenPrefix: row.token_prefix,
    tokenHash: row.token_hash,
    origins: readStrings(row.origins_json),
    dailyLimit: row.daily_limit,
    minuteLimit: row.minute_limit,
    params: readParams(row.params_json),
    allowedHeaders: readStrings(row.headers_json),
    responseTemplate: row.response_template ?? "",
    active: row.active === 1,
    fallbackId: row.fallback_id,
    fallbackOn: row.fallback_on.split(",").filter(Boolean),
    idempotent: row.idempotent === 1,
    configVersion: row.config_version,
    createdAt: row.created_at,
    lastUsedAt: row.last_used_at,
    usedToday: Number(row.used_today ?? 0),
    internalToday: Number(row.internal_today ?? 0),
    healthEnabled: row.health_enabled === 1,
    healthOk: row.health_ok == null ? null : row.health_ok === 1,
    healthCheckedAt: row.health_checked_at,
    healthLatencyMs: row.health_latency_ms == null ? null : Number(row.health_latency_ms),
    healthDetail: row.health_detail,
    healthImage: row.health_image || null,
    healthIntervalMinutes: Math.min(1440, Math.max(1, Number(row.health_interval_minutes ?? 10) || 10)),
    logoUpdatedAt: row.logo_updated_at ?? null,
  };
}

export async function getBarricadeLogo(id: number) {
  const rows = await query<(RowDataPacket & { mime: string; image: Buffer })[]>(
    "SELECT mime, image FROM barricade_logos WHERE barricade_id = ? LIMIT 1",
    [id],
  );
  const row = rows[0];
  if (!row?.image) return null;
  return { mime: row.mime, image: row.image };
}

export async function saveBarricadeLogo(id: number, mime: string, image: Buffer) {
  await execute(
    `INSERT INTO barricade_logos (barricade_id, mime, image) VALUES (?, ?, ?)
     ON DUPLICATE KEY UPDATE mime = VALUES(mime), image = VALUES(image)`,
    [id, mime, image],
  );
}

export async function clearBarricadeLogo(id: number) {
  await execute("DELETE FROM barricade_logos WHERE barricade_id = ?", [id]);
}

async function normalize(input: BarricadeInput, id: number | null) {
  const name = input.name.trim();
  const slug = input.slug.trim().toLowerCase();
  if (name.length < 2 || name.length > 120) {
    throw new BarricadeValidationError("Informe um nome de 2 a 120 caracteres.");
  }
  if (!isBarricadeSlug(slug)) {
    throw new BarricadeValidationError("O identificador usa letras minúsculas, números e barras, como instagram/perfil.");
  }
  if (!isHttpMethod(input.method)) throw new BarricadeValidationError("Método HTTP inválido.");
  const api = await getApi(input.apiId);
  if (!api) throw new BarricadeValidationError("Escolha uma API cadastrada.");
  const templateError = validateResponseTemplate(input.responseTemplate);
  if (templateError) throw new BarricadeValidationError(templateError);
  const origins = normalizeOrigins(input.origins);
  const fallbackOn = input.fallbackOn.filter((item) => FALLBACK_KEYS.includes(item as (typeof FALLBACK_KEYS)[number]));
  if (input.fallbackId) {
    if (input.fallbackId === id) throw new BarricadeValidationError("A barricada não pode ser alternativa de si mesma.");
    const rows = await query<(RowDataPacket & { id: number; fallback_id: number | null })[]>(
      "SELECT id, fallback_id FROM barricades",
    );
    if (hasCycle(id, input.fallbackId, rows)) {
      throw new BarricadeValidationError("Essa alternativa criaria um ciclo de fallback.");
    }
  }
  return {
    ...input,
    name,
    description: input.description.trim().slice(0, 500),
    slug,
    origins,
    dailyLimit: clampDaily(input.dailyLimit),
    minuteLimit: Math.max(0, Math.min(10_000, Math.round(input.minuteLimit))),
    fallbackOn,
    responseTemplate: input.responseTemplate.trim(),
  };
}

function clampDaily(value: number) {
  if (!Number.isFinite(value)) return 1000;
  const rounded = Math.round(value);
  if (rounded < 0) return -1;
  return Math.min(1_000_000, rounded);
}

function normalizeOrigins(origins: string[]) {
  return origins
    .map((origin) => origin.trim())
    .filter(Boolean)
    .slice(0, 30)
    .map((origin) => {
      if (isIP(origin)) return origin;
      try {
        const url = new URL(origin);
        if (url.protocol !== "http:" && url.protocol !== "https:") throw new Error("protocolo");
        return url.origin;
      } catch {
        throw new BarricadeValidationError(`Origem inválida: ${origin.slice(0, 80)}`);
      }
    });
}

function hasCycle(
  selfId: number | null,
  fallbackId: number,
  rows: { id: number; fallback_id: number | null }[],
) {
  const links = new Map(rows.map((row) => [row.id, row.fallback_id]));
  if (selfId) links.set(selfId, fallbackId);
  let current: number | null = fallbackId;
  const seen = new Set<number>();
  if (selfId) seen.add(selfId);
  while (current) {
    if (seen.has(current)) return true;
    seen.add(current);
    current = links.get(current) ?? null;
  }
  return false;
}

function sharedParams(input: Awaited<ReturnType<typeof normalize>>) {
  return [input.apiId, input.name, input.description, input.slug, input.method];
}

function tailParams(input: Awaited<ReturnType<typeof normalize>>) {
  return [
    JSON.stringify(input.origins),
    input.dailyLimit,
    input.minuteLimit,
    JSON.stringify(input.params),
    JSON.stringify(input.allowedHeaders),
    input.responseTemplate || null,
    input.active ? 1 : 0,
    input.fallbackId,
    input.fallbackOn.join(","),
    input.idempotent ? 1 : 0,
  ];
}

function readStrings(raw: string) {
  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? parsed.map(String).filter(Boolean) : [];
  } catch {
    return [];
  }
}

function readParams(raw: string): AcceptedParam[] {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.flatMap((item) => {
      if (!item || typeof item !== "object") return [];
      const record = item as Record<string, unknown>;
      const name = String(record.name ?? "").trim();
      if (!name) return [];
      return [{ name, required: record.required === true }];
    });
  } catch {
    return [];
  }
}
