import "server-only";
import { randomBytes } from "crypto";
import { isIP } from "net";
import { getApi, getApiSecret, joinUrl, type ApiRecord } from "@/lib/apis";
import { getBarricadeBySlug, verifyBarricadeToken, type BarricadeRecord } from "@/lib/barricades";
import { dayKey } from "@/lib/catalog";
import { execute } from "@/lib/db";
import { isSensitiveHeader, maskHeaders, maskText } from "@/lib/secrets";
import { assertPublicHttpUrl, DestinationError } from "@/lib/ssrf";
import { splitApiUrl } from "@/lib/draft";
import { applyTemplate, fillString, renderBody, type ConsumerContext } from "@/lib/transform";

const MESSAGES: Record<string, string> = {
  nao_encontrada: "Barricada não encontrada.",
  nao_autorizado: "Token ausente ou inválido.",
  origem_negada: "Origem ausente ou não autorizada.",
  inativa: "Esta barricada está desativada.",
  metodo_invalido: "Método não permitido nesta barricada.",
  limite_diario: "O limite diário desta barricada foi atingido.",
  limite_minuto: "O limite de requisições por minuto foi atingido.",
  parametro_obrigatorio: "Faltam parâmetros obrigatórios.",
  payload_invalido: "O corpo da requisição não é um JSON válido.",
  payload_grande: "O corpo da requisição excede o tamanho permitido.",
  destino_bloqueado: "O destino configurado não pode ser chamado.",
  indisponivel: "O serviço externo não respondeu.",
  tempo_esgotado: "O serviço externo excedeu o tempo limite.",
  provedor: "A chamada foi recusada pelo serviço externo.",
};

export async function serveBarricade(request: Request, slug: string) {
  const barricade = await getBarricadeBySlug(slug);
  if (!barricade) return errorResponse(request, null, 404, "nao_encontrada");

  const cors = corsHeaders(request, barricade);
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: cors });
  }

  const day = dayKey();
  const requestId = randomBytes(12).toString("hex");
  await bump(barricade.id, day, "received");

  if (request.method !== barricade.method) {
    await reject(barricade, request, requestId, day, 405, "metodo_invalido");
    return errorResponse(request, barricade, 405, "metodo_invalido", requestId);
  }

  const token = bearer(request);
  if (!token || !(await verifyBarricadeToken(token, barricade.tokenHash))) {
    await reject(barricade, request, requestId, day, 401, "nao_autorizado");
    return errorResponse(request, barricade, 401, "nao_autorizado", requestId);
  }

  if (!originAllowed(request, barricade)) {
    await reject(barricade, request, requestId, day, 403, "origem_negada");
    return errorResponse(request, barricade, 403, "origem_negada", requestId);
  }

  if (!barricade.active) {
    await reject(barricade, request, requestId, day, 403, "inativa");
    return errorResponse(request, barricade, 403, "inativa", requestId);
  }

  const incoming = await readIncoming(request, barricade);
  if ("error" in incoming) {
    const code = incoming.error ?? "payload_invalido";
    await reject(barricade, request, requestId, day, 400, code);
    return errorResponse(request, barricade, 400, code, requestId);
  }

  const started = Date.now();
  const primary = await executeProtected(barricade, incoming.consumer);
  if (primary.blocked) {
    await reject(barricade, request, requestId, day, 429, primary.blocked);
    return errorResponse(request, barricade, 429, primary.blocked, requestId);
  }

  let final = primary;
  let usedFallback = false;
  let fallbackReason: string | null = null;
  if (!primary.result.ok && canFallback(barricade, primary.result.failure)) {
    const alternative = barricade.fallbackId ? await loadAlternative(barricade.fallbackId) : null;
    const safe = barricade.method === "GET" || barricade.idempotent;
    if (alternative && safe) {
      const second = await executeProtected(alternative, incoming.consumer);
      usedFallback = true;
      fallbackReason = primary.result.failure ?? "indisponivel";
      await bump(barricade.id, day, "fallback_used");
      final = second.blocked
        ? primary
        : { ...second, result: second.result };
      if (!second.blocked && second.result.ok) final = second;
    }
  }

  const duration = Date.now() - started;
  const success = Boolean(final.result?.ok);
  const processed = success && usedFallback && barricade.fallbackId ? await loadAlternative(barricade.fallbackId) : barricade;
  const upstream = final.result;
  await writeLog({
    requestId,
    barricade,
    processed: processed ?? barricade,
    day,
    providerStatus: upstream?.status ?? null,
    consumerStatus: success ? upstream?.status ?? 200 : failureStatus(upstream?.failure),
    duration,
    outcome: success ? (usedFallback ? "fallback" : "sucesso") : "falha",
    attempts: usedFallback ? 2 : 1,
    usedFallback,
    fallbackReason,
    failureReason: success ? null : upstream?.failure ?? final.blocked ?? "indisponivel",
    counted: Boolean(upstream),
    consumerKey: consumerKey(request, barricade.tokenPrefix),
  });
  await execute("UPDATE barricades SET last_used_at = CURRENT_TIMESTAMP WHERE id = ?", [barricade.id]);

  if (!success || !upstream) {
    const mapped = consumerError(upstream?.failure);
    return errorResponse(request, barricade, mapped.status, mapped.code, requestId);
  }

  const source = processed ?? barricade;
  let payload: unknown = upstream.body;
  if (source.responseTemplate) {
    try {
      payload = applyTemplate(JSON.parse(source.responseTemplate) as unknown, upstream.body, incoming.consumer);
    } catch {
      return errorResponse(request, barricade, 500, "indisponivel", requestId);
    }
  }
  const status = upstream.status && upstream.status >= 200 && upstream.status < 300 ? upstream.status : 200;
  return Response.json(payload, {
    status,
    headers: { ...cors, "x-request-id": requestId, "cache-control": "no-store" },
  });
}

export async function inspectApi(apiId: number, sampleRaw: string) {
  const api = await getApi(apiId);
  if (!api) return { error: "API não encontrada." };
  const secret = await getApiSecret(apiId);
  const consumer = sampleConsumer(sampleRaw);
  const result = await callUpstream(api, consumer, secret);
  const day = dayKey();
  await writeLog({
    requestId: randomBytes(12).toString("hex"),
    barricade: null,
    processed: null,
    api,
    day,
    providerStatus: result.status,
    consumerStatus: result.ok ? result.status ?? 200 : 502,
    duration: result.durationMs,
    outcome: result.ok ? "sucesso" : "falha",
    attempts: 1,
    usedFallback: false,
    fallbackReason: null,
    failureReason: result.failure ?? null,
    counted: false,
    consumerKey: "painel",
  });
  return { preview: maskPreview(result, secret) };
}

export async function previewTemplate(apiId: number, template: string, sampleRaw: string) {
  const inspected = await inspectApi(apiId, sampleRaw);
  if ("error" in inspected && inspected.error) return inspected;
  if (!("preview" in inspected) || !inspected.preview) return { error: "Não foi possível testar a API." };
  let transformed = "";
  try {
    const upstream = JSON.parse(inspected.preview.responseBody) as unknown;
    const rendered = template.trim()
      ? applyTemplate(JSON.parse(template) as unknown, upstream, sampleConsumer(sampleRaw))
      : upstream;
    transformed = JSON.stringify(rendered, null, 2);
  } catch {
    transformed = "A prévia não pôde ser montada. Confira o JSON da resposta personalizada.";
  }
  return { preview: { ...inspected.preview, transformed } };
}

async function executeProtected(barricade: BarricadeRecord, consumer: ConsumerContext) {
  const day = dayKey();
  const dailyOk = await reserve(barricade.id, barricade.dailyLimit, day, "executed");
  if (!dailyOk) return { blocked: "limite_diario" as const, result: emptyResult() };
  if (barricade.minuteLimit > 0) {
    const minuteOk = await reserveMinute(barricade.id, barricade.minuteLimit);
    if (!minuteOk) {
      await execute(
        "UPDATE usage_daily SET executed = GREATEST(executed - 1, 0) WHERE barricade_id = ? AND day_key = ?",
        [barricade.id, day],
      );
      return { blocked: "limite_minuto" as const, result: emptyResult() };
    }
  }
  const api = await getApi(barricade.apiId);
  if (!api || !api.active) {
    return { blocked: null, result: { ...emptyResult(), failure: "destino_bloqueado" as const } };
  }
  const secret = await getApiSecret(api.id);
  const result = await callUpstream(api, consumer, secret);
  return { blocked: null, result };
}

async function callUpstream(api: ApiRecord, consumer: ConsumerContext, secret: string) {
  const started = Date.now();
  const requestBody = renderBody(api.bodyTemplate, consumer) ?? "";
  let url = "";
  const requestHeaders: Record<string, string> = {};
  try {
    const target = new URL(joinUrl(api.baseUrl, fillString(api.endpointPath, consumer)));
    for (const pair of api.query) {
      const value = fillString(pair.value, consumer);
      if (value) target.searchParams.set(pair.name, value);
    }
    url = target.toString();
    await assertPublicHttpUrl(url);
    for (const pair of api.headers) {
      const value = fillString(pair.value, consumer);
      if (value) requestHeaders[pair.name] = value;
    }
    if (api.authType === "bearer" && secret) requestHeaders.Authorization = `Bearer ${secret}`;
    if (api.authType === "basic" && secret) requestHeaders.Authorization = `Basic ${Buffer.from(secret).toString("base64")}`;
    if (api.authType === "api_key" && secret) requestHeaders[api.credentialHeader || "X-Api-Key"] = secret;
    const outgoing = buildOutgoingBody(api, requestBody, requestHeaders);

    const response = await fetch(url, {
      method: api.method,
      headers: requestHeaders,
      body: outgoing,
      redirect: "manual",
      signal: AbortSignal.timeout(api.timeoutMs),
    });
    if (response.status >= 300 && response.status < 400) {
      return resultShell(url, api.method, requestHeaders, requestBody, started, false, response.status, {}, "", "redirecionamento");
    }
    const bytes = await readLimited(response, 1_000_000);
    const text = new TextDecoder().decode(bytes);
    const responseHeaders = Object.fromEntries(response.headers.entries());
    const contentType = response.headers.get("content-type") ?? "";
    const body = contentType.includes("json") ? safeJson(text) : text;
    const failure = response.status >= 500 ? "http_5xx" : response.status >= 400 ? "http_4xx" : undefined;
    return resultShell(url, api.method, requestHeaders, requestBody, started, !failure, response.status, responseHeaders, text, failure, body);
  } catch (error) {
    const failure = error instanceof DestinationError ? "destino_bloqueado" : isTimeout(error) ? "tempo_esgotado" : error instanceof Error && error.message === "grande" ? "resposta_grande" : "conexao";
    return resultShell(url, api.method, requestHeaders, requestBody, started, false, null, {}, "", failure);
  }
}

function resultShell(
  url: string,
  method: string,
  requestHeaders: Record<string, string>,
  requestBody: string,
  started: number,
  ok: boolean,
  status: number | null,
  headers: Record<string, string>,
  text: string,
  failure?: string,
  body: unknown = null,
) {
  return {
    ok,
    url,
    method,
    requestHeaders,
    requestBody,
    status,
    headers,
    text,
    body,
    durationMs: Date.now() - started,
    failure,
  };
}

function emptyResult() {
  return resultShell("", "", {}, "", Date.now(), false, null, {}, "");
}

async function reserve(id: number, limit: number, day: string, column: "executed") {
  if (limit <= 0) {
    await execute(
      `INSERT INTO usage_daily (barricade_id, day_key, ${column}) VALUES (?, ?, 1)
       ON DUPLICATE KEY UPDATE ${column} = ${column} + 1`,
      [id, day],
    );
    return true;
  }
  const updated = await execute(
    `UPDATE usage_daily SET ${column} = LAST_INSERT_ID(${column} + 1) WHERE barricade_id = ? AND day_key = ? AND ${column} < ?`,
    [id, day, limit],
  );
  if (updated.affectedRows > 0) return true;
  const inserted = await execute(
    `INSERT IGNORE INTO usage_daily (barricade_id, day_key, ${column}) VALUES (?, ?, 1)`,
    [id, day],
  );
  if (inserted.affectedRows > 0) return true;
  const retry = await execute(
    `UPDATE usage_daily SET ${column} = LAST_INSERT_ID(${column} + 1) WHERE barricade_id = ? AND day_key = ? AND ${column} < ?`,
    [id, day, limit],
  );
  return retry.affectedRows > 0;
}

async function reserveMinute(id: number, limit: number) {
  const bucket = Math.floor(Date.now() / 60_000);
  const updated = await execute(
    "UPDATE usage_minute SET hits = LAST_INSERT_ID(hits + 1) WHERE barricade_id = ? AND bucket = ? AND hits < ?",
    [id, bucket, limit],
  );
  if (updated.affectedRows > 0) return true;
  const inserted = await execute(
    "INSERT IGNORE INTO usage_minute (barricade_id, bucket, hits) VALUES (?, ?, 1)",
    [id, bucket],
  );
  if (inserted.affectedRows > 0) return true;
  const retry = await execute(
    "UPDATE usage_minute SET hits = LAST_INSERT_ID(hits + 1) WHERE barricade_id = ? AND bucket = ? AND hits < ?",
    [id, bucket, limit],
  );
  return retry.affectedRows > 0;
}

async function bump(id: number, day: string, column: "received" | "rejected" | "fallback_used") {
  await execute(
    `INSERT INTO usage_daily (barricade_id, day_key, ${column}) VALUES (?, ?, 1)
     ON DUPLICATE KEY UPDATE ${column} = ${column} + 1`,
    [id, day],
  );
}

async function reject(
  barricade: BarricadeRecord,
  request: Request,
  requestId: string,
  day: string,
  status: number,
  reason: string,
) {
  await bump(barricade.id, day, "rejected");
  await writeLog({
    requestId,
    barricade,
    processed: barricade,
    day,
    providerStatus: null,
    consumerStatus: status,
    duration: 0,
    outcome: "rejeitada",
    attempts: 0,
    usedFallback: false,
    fallbackReason: null,
    failureReason: reason,
    counted: false,
    consumerKey: consumerKey(request, barricade.tokenPrefix),
  });
}

async function writeLog(entry: {
  requestId: string;
  barricade: BarricadeRecord | null;
  processed: BarricadeRecord | null;
  api?: ApiRecord;
  day: string;
  providerStatus: number | null;
  consumerStatus: number;
  duration: number;
  outcome: string;
  attempts: number;
  usedFallback: boolean;
  fallbackReason: string | null;
  failureReason: string | null;
  counted: boolean;
  consumerKey: string;
}) {
  const apiName = entry.api?.name ?? entry.barricade?.apiName ?? "API";
  await execute(
    `INSERT INTO call_logs (
      request_id, barricade_id, processed_barricade_id, api_id, barricade_name, processed_name, api_name,
      day_key, method, provider_status, consumer_status, duration_ms, outcome, attempts, used_fallback,
      fallback_reason, failure_reason, counted, consumer_key
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      entry.requestId,
      entry.barricade?.id ?? null,
      entry.processed?.id ?? entry.barricade?.id ?? null,
      entry.api?.id ?? entry.processed?.apiId ?? entry.barricade?.apiId ?? null,
      entry.barricade?.name ?? "Verificação",
      entry.processed?.name ?? entry.barricade?.name ?? "Verificação",
      apiName,
      entry.day,
      entry.barricade?.method ?? entry.api?.method ?? "GET",
      entry.providerStatus,
      entry.consumerStatus,
      entry.duration,
      entry.outcome,
      entry.attempts,
      entry.usedFallback ? 1 : 0,
      entry.fallbackReason,
      entry.failureReason,
      entry.counted ? 1 : 0,
      entry.consumerKey,
    ],
  );
}

function canFallback(barricade: BarricadeRecord, failure?: string) {
  if (!barricade.fallbackId || !failure) return false;
  if (failure === "tempo_esgotado") return barricade.fallbackOn.includes("timeout");
  if (failure === "conexao") return barricade.fallbackOn.includes("conexao");
  if (failure === "http_5xx") return barricade.fallbackOn.includes("http_5xx");
  return false;
}

async function loadAlternative(id: number) {
  const { getBarricade } = await import("@/lib/barricades");
  const alternative = await getBarricade(id, dayKey());
  if (!alternative?.active || alternative.id === id) return alternative?.active ? alternative : null;
  return alternative;
}

function originAllowed(request: Request, barricade: BarricadeRecord) {
  const urls = barricade.origins.filter((origin) => origin.startsWith("http://") || origin.startsWith("https://"));
  const ips = barricade.origins.filter((origin) => isIP(origin));
  const origin = request.headers.get("origin");
  if (urls.length > 0 && (!origin || !urls.includes(origin))) return false;
  if (ips.length > 0 && !ips.includes(clientIp(request))) return false;
  return true;
}

function corsHeaders(request: Request, barricade: BarricadeRecord): Record<string, string> {
  const origin = request.headers.get("origin");
  if (!origin || !barricade.origins.includes(origin)) return { vary: "Origin" };
  return {
    "access-control-allow-origin": origin,
    "access-control-allow-headers": "Authorization, Content-Type",
    "access-control-allow-methods": barricade.method,
    vary: "Origin",
  };
}

function errorResponse(
  request: Request,
  barricade: BarricadeRecord | null,
  status: number,
  code: string,
  requestId?: string,
) {
  const headers: Record<string, string> = { "cache-control": "no-store" };
  if (barricade) Object.assign(headers, corsHeaders(request, barricade));
  if (requestId) headers["x-request-id"] = requestId;
  return Response.json({ erro: code, mensagem: MESSAGES[code] ?? MESSAGES.indisponivel }, { status, headers });
}

async function readIncoming(request: Request, barricade: BarricadeRecord) {
  const url = new URL(request.url);
  const allowed = new Set(barricade.params.map((param) => param.name));
  const query: Record<string, string> = {};
  for (const [key, value] of url.searchParams) {
    if (allowed.size === 0 || allowed.has(key)) query[key] = value.slice(0, 500);
  }
  if (barricade.params.some((param) => param.required && !query[param.name])) {
    return { error: "parametro_obrigatorio" as const };
  }
  const allowedHeaders = new Set(barricade.allowedHeaders.map((header) => header.toLowerCase()));
  const header: Record<string, string> = {};
  request.headers.forEach((value, key) => {
    if (allowedHeaders.has(key.toLowerCase())) header[key.toLowerCase()] = value.slice(0, 500);
  });
  let body: unknown = {};
  if (request.method !== "GET" && request.method !== "DELETE") {
    const raw = await request.text();
    if (raw.length > 262_144) return { error: "payload_grande" as const };
    if (raw) {
      try {
        body = JSON.parse(raw) as unknown;
      } catch {
        return { error: "payload_invalido" as const };
      }
    }
  }
  const path = Object.fromEntries(Object.entries(query));
  return { consumer: { query, header, body, path } satisfies ConsumerContext };
}

function sampleConsumer(raw: string): ConsumerContext {
  try {
    const parsed = raw.trim() ? (JSON.parse(raw) as Record<string, unknown>) : {};
    return {
      query: stringRecord(parsed.query),
      header: stringRecord(parsed.header),
      body: parsed.body ?? {},
      path: stringRecord(parsed.path),
    };
  } catch {
    return { query: {}, header: {}, body: {}, path: {} };
  }
}

function stringRecord(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, String(item ?? "")])) ;
}

function bearer(request: Request) {
  return request.headers.get("authorization")?.match(/^Bearer\s+(\S+)$/i)?.[1] ?? "";
}

function clientIp(request: Request) {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "";
}

function consumerKey(request: Request, prefix: string) {
  return `${prefix}:${clientIp(request) || "sem-ip"}`.slice(0, 80);
}

function consumerError(failure?: string) {
  if (failure === "tempo_esgotado") return { status: 504, code: "tempo_esgotado" };
  if (failure === "destino_bloqueado") return { status: 422, code: "destino_bloqueado" };
  if (failure === "http_4xx") return { status: 424, code: "provedor" };
  return { status: 502, code: "indisponivel" };
}

function failureStatus(failure?: string) {
  return consumerError(failure).status;
}

function maskPreview(result: ReturnType<typeof resultShell>, secret: string | string[]) {
  const secrets = (Array.isArray(secret) ? secret : [secret]).filter((item) => item.length >= 4);
  return {
    url: result.url,
    method: result.method,
    requestHeaders: maskHeaders(result.requestHeaders),
    requestBody: maskText(result.requestBody, secrets),
    status: result.status,
    responseHeaders: maskHeaders(result.headers),
    responseBody: maskText(result.text, secrets),
    durationMs: result.durationMs,
    failure: result.failure ?? "",
    transformed: "",
  };
}

export async function logVerification(input: {
  barricadeId: number;
  barricadeName: string;
  apiId: number;
  apiName: string;
  method: string;
  providerStatus: number | null;
  durationMs: number;
  ok: boolean;
  detail: string;
}) {
  const day = dayKey();
  await execute(
    `INSERT INTO usage_daily (barricade_id, day_key, internal_count) VALUES (?, ?, 1)
     ON DUPLICATE KEY UPDATE internal_count = internal_count + 1`,
    [input.barricadeId, day],
  );
  await execute(
    `INSERT INTO call_logs (
      request_id, barricade_id, processed_barricade_id, api_id, barricade_name, processed_name, api_name,
      day_key, method, provider_status, consumer_status, duration_ms, outcome, attempts, used_fallback,
      fallback_reason, failure_reason, counted, consumer_key
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'verificacao', 1, 0, NULL, ?, 0, 'verificacao')`,
    [
      randomBytes(12).toString("hex"),
      input.barricadeId,
      input.barricadeId,
      input.apiId,
      input.barricadeName,
      input.barricadeName,
      input.apiName,
      day,
      input.method.slice(0, 10),
      input.providerStatus,
      input.providerStatus ?? 0,
      Math.max(0, input.durationMs),
      input.ok ? null : input.detail.slice(0, 255),
    ],
  );
}

export async function probeUpstream(draft: {
  url: string;
  method: ApiRecord["method"];
  headers: ApiRecord["headers"];
  contentType: string;
  bodyTemplate: string;
}) {
  const parts = splitApiUrl(draft.url);
  const secrets = draft.headers.filter((header) => isSensitiveHeader(header.name)).map((header) => header.value);
  const api: ApiRecord = {
    id: 0,
    name: "Ping",
    description: "",
    baseUrl: parts.baseUrl,
    endpointPath: parts.endpointPath,
    method: draft.method,
    requestContentType: draft.contentType,
    responseContentType: "application/json",
    authType: "none",
    hasCredential: false,
    credentialHeader: "",
    headers: draft.headers,
    query: [],
    pathParams: [],
    bodyTemplate: draft.bodyTemplate,
    timeoutMs: 15000,
    active: true,
    configVersion: 1,
    barricadeCount: 0,
  };
  const result = await callUpstream(api, { query: {}, header: {}, body: {}, path: {} }, secrets[0] ?? "");
  return maskPreview(result, secrets);
}

function buildOutgoingBody(api: ApiRecord, requestBody: string, requestHeaders: Record<string, string>) {
  if (!requestBody || api.method === "GET" || api.method === "DELETE") return undefined;
  const type = api.requestContentType.toLowerCase();
  if (type.includes("multipart/form-data") || type.includes("application/x-www-form-urlencoded")) {
    for (const name of Object.keys(requestHeaders)) {
      if (name.toLowerCase() === "content-type") delete requestHeaders[name];
    }
    const fields = recordFromBody(requestBody);
    if (type.includes("multipart/form-data")) {
      const form = new FormData();
      for (const [name, value] of Object.entries(fields)) form.append(name, textValue(value));
      return form;
    }
    const params = new URLSearchParams();
    for (const [name, value] of Object.entries(fields)) params.append(name, textValue(value));
    requestHeaders["content-type"] = "application/x-www-form-urlencoded";
    return params;
  }
  for (const name of Object.keys(requestHeaders)) {
    if (name.toLowerCase() === "content-type") delete requestHeaders[name];
  }
  requestHeaders["content-type"] = api.requestContentType || "application/json";
  return requestBody;
}

function recordFromBody(raw: string) {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed as Record<string, unknown>;
  } catch {
    return {};
  }
  return {};
}

function textValue(value: unknown) {
  if (value == null) return "";
  return typeof value === "string" ? value : JSON.stringify(value);
}

async function readLimited(response: Response, max: number) {
  const reader = response.body?.getReader();
  if (!reader) return new Uint8Array();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > max) {
      await reader.cancel();
      throw new Error("grande");
    }
    chunks.push(value);
  }
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return out;
}

function safeJson(text: string) {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

function isTimeout(error: unknown) {
  return error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError");
}
