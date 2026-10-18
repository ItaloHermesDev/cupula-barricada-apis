import "server-only";
import type { RowDataPacket } from "mysql2/promise";
import { execute, query } from "@/lib/db";
import { assertPublicHttpUrl, DestinationError } from "@/lib/ssrf";
import { decryptSecret, encryptSecret, isSensitiveHeader } from "@/lib/secrets";
import {
  isAuthType,
  isHttpMethod,
  type AuthType,
  type FieldPair,
  type HttpMethod,
} from "@/lib/catalog";

export type ApiRecord = {
  id: number;
  name: string;
  description: string;
  baseUrl: string;
  endpointPath: string;
  method: HttpMethod;
  requestContentType: string;
  responseContentType: string;
  authType: AuthType;
  hasCredential: boolean;
  credentialHeader: string;
  headers: FieldPair[];
  query: FieldPair[];
  pathParams: FieldPair[];
  bodyTemplate: string;
  timeoutMs: number;
  active: boolean;
  configVersion: number;
  barricadeCount: number;
};

export type ApiInput = Omit<ApiRecord, "id" | "hasCredential" | "configVersion" | "barricadeCount"> & {
  credential?: string;
  clearCredential?: boolean;
};

interface ApiRow extends RowDataPacket {
  id: number;
  name: string;
  description: string;
  base_url: string;
  endpoint_path: string;
  method: string;
  request_content_type: string;
  response_content_type: string;
  auth_type: string;
  credential_cipher: string | null;
  credential_header: string | null;
  headers_json: string;
  query_json: string;
  path_json: string;
  body_template: string | null;
  timeout_ms: number;
  active: number;
  config_version: number;
  barricade_count: number;
}

export class ApiValidationError extends Error {}

export async function listApis() {
  const rows = await query<ApiRow[]>(`${SELECT_API} ORDER BY name ASC`);
  return rows.map(mapApi);
}

export async function getApi(id: number) {
  const rows = await query<ApiRow[]>(`${SELECT_API} WHERE a.id = ? LIMIT 1`, [id]);
  return rows[0] ? mapApi(rows[0]) : null;
}

export async function getApiSecret(id: number) {
  const rows = await query<(RowDataPacket & { credential_cipher: string | null })[]>(
    "SELECT credential_cipher FROM external_apis WHERE id = ? LIMIT 1",
    [id],
  );
  const cipher = rows[0]?.credential_cipher;
  if (!cipher) return "";
  try {
    return decryptSecret(cipher);
  } catch {
    return "";
  }
}

export async function createApi(input: ApiInput) {
  const normalized = await normalize(input);
  const result = await execute(
    `INSERT INTO external_apis (
      name, description, base_url, endpoint_path, method, request_content_type, response_content_type,
      auth_type, credential_cipher, credential_header, headers_json, query_json, path_json, body_template,
      timeout_ms, active
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    insertParams(normalized, input.credential?.trim() ? encryptSecret(input.credential.trim()) : null),
  );
  return Number(result.insertId);
}

export async function updateApi(id: number, input: ApiInput) {
  const current = await getApi(id);
  if (!current) return false;
  const normalized = await normalize(input);
  let cipher: string | null = null;
  const existing = await query<(RowDataPacket & { credential_cipher: string | null })[]>(
    "SELECT credential_cipher FROM external_apis WHERE id = ? LIMIT 1",
    [id],
  );
  cipher = existing[0]?.credential_cipher ?? null;
  if (input.clearCredential || normalized.authType === "none") cipher = null;
  if (input.credential?.trim()) cipher = encryptSecret(input.credential.trim());

  await execute(
    `UPDATE external_apis SET
      name = ?, description = ?, base_url = ?, endpoint_path = ?, method = ?, request_content_type = ?,
      response_content_type = ?, auth_type = ?, credential_cipher = ?, credential_header = ?, headers_json = ?,
      query_json = ?, path_json = ?, body_template = ?, timeout_ms = ?, active = ?, config_version = config_version + 1
     WHERE id = ?`,
    [...insertParams(normalized, cipher), id],
  );
  return true;
}

export async function deleteApi(id: number) {
  if (await linkedApiCount(id) > 0) {
    throw new ApiValidationError("Remova as barricadas desta API antes de excluí-la.");
  }
  await execute("DELETE FROM external_apis WHERE id = ?", [id]);
}

async function linkedApiCount(id: number) {
  const rows = await query<(RowDataPacket & { total: number })[]>(
    `SELECT
       (SELECT COUNT(*) FROM barricades WHERE api_id = ?) +
       (SELECT COUNT(*) FROM barricade_sources WHERE api_id = ?) AS total`,
    [id, id],
  );
  return Number(rows[0]?.total ?? 0);
}

const SELECT_API = `
  SELECT a.*,
    (SELECT COUNT(*) FROM barricades b WHERE b.api_id = a.id) +
    (SELECT COUNT(*) FROM barricade_sources s WHERE s.api_id = a.id) AS barricade_count
  FROM external_apis a
`;

function mapApi(row: ApiRow): ApiRecord {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    baseUrl: row.base_url,
    endpointPath: row.endpoint_path,
    method: isHttpMethod(row.method) ? row.method : "GET",
    requestContentType: row.request_content_type,
    responseContentType: row.response_content_type,
    authType: isAuthType(row.auth_type) ? row.auth_type : "none",
    hasCredential: Boolean(row.credential_cipher),
    credentialHeader: row.credential_header ?? "X-Api-Key",
    headers: openHeaders(readPairs(row.headers_json)),
    query: readPairs(row.query_json),
    pathParams: readPairs(row.path_json),
    bodyTemplate: row.body_template ?? "",
    timeoutMs: row.timeout_ms,
    active: row.active === 1,
    configVersion: row.config_version,
    barricadeCount: Number(row.barricade_count ?? 0),
  };
}

async function normalize(input: ApiInput) {
  const name = input.name.trim();
  const baseUrl = input.baseUrl.trim();
  if (name.length < 2 || name.length > 120) throw new ApiValidationError("Informe um nome de 2 a 120 caracteres.");
  if (!isHttpMethod(input.method)) throw new ApiValidationError("Método HTTP inválido.");
  if (!isAuthType(input.authType)) throw new ApiValidationError("Autenticação inválida.");
  try {
    await assertPublicHttpUrl(joinUrl(baseUrl, input.endpointPath));
  } catch (error) {
    if (error instanceof DestinationError) {
      throw new ApiValidationError("A URL precisa ser HTTP(S) e apontar para um destino público.");
    }
    throw error;
  }
  const timeoutMs = Math.min(30_000, Math.max(1_000, Math.round(input.timeoutMs || 10_000)));
  return {
    ...input,
    headers: input.headers.map(sealHeader),
    name,
    description: input.description.trim().slice(0, 500),
    baseUrl,
    endpointPath: input.endpointPath.trim(),
    requestContentType: input.requestContentType.trim().slice(0, 120) || "application/json",
    responseContentType: input.responseContentType.trim().slice(0, 120) || "application/json",
    credentialHeader: input.credentialHeader.trim().slice(0, 80) || "X-Api-Key",
    timeoutMs,
  };
}

function insertParams(input: Awaited<ReturnType<typeof normalize>>, cipher: string | null) {
  return [
    input.name,
    input.description,
    input.baseUrl,
    input.endpointPath,
    input.method,
    input.requestContentType,
    input.responseContentType,
    input.authType,
    cipher,
    input.authType === "api_key" ? input.credentialHeader : null,
    JSON.stringify(input.headers),
    JSON.stringify(input.query),
    JSON.stringify(input.pathParams),
    input.bodyTemplate.trim() || null,
    input.timeoutMs,
    input.active ? 1 : 0,
  ];
}

export function joinUrl(baseUrl: string, endpointPath: string) {
  const base = baseUrl.replace(/\/$/, "");
  const path = endpointPath.trim();
  if (!path) return base;
  return `${base}${path.startsWith("/") ? path : `/${path}`}`;
}

function sealHeader(pair: FieldPair): FieldPair {
  if (!isSensitiveHeader(pair.name) || !pair.value || pair.value.startsWith("enc:")) return pair;
  return { name: pair.name, value: `enc:${encryptSecret(pair.value)}` };
}

function openHeaders(pairs: FieldPair[]) {
  return pairs.map((pair) => {
    if (!pair.value.startsWith("enc:")) return pair;
    try {
      return { name: pair.name, value: decryptSecret(pair.value.slice(4)) };
    } catch {
      return { name: pair.name, value: "" };
    }
  });
}

function readPairs(raw: string): FieldPair[] {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.flatMap((item) => {
      if (!item || typeof item !== "object") return [];
      const record = item as Record<string, unknown>;
      const name = String(record.name ?? "").trim();
      if (!name) return [];
      return [{ name, value: String(record.value ?? "") }];
    });
  } catch {
    return [];
  }
}
