import "server-only";
import { randomBytes } from "crypto";
import { isIP } from "net";
import { getApi, getApiSecret, joinUrl, type ApiRecord } from "@/lib/apis";
import { getBarricade, getBarricadeBySlug, verifyBarricadeToken, type BarricadeRecord } from "@/lib/barricades";
import { dayKey } from "@/lib/catalog";
import { execute } from "@/lib/db";
import { isSensitiveHeader, maskHeaders, maskText } from "@/lib/secrets";
import { assertPublicHttpUrl, DestinationError } from "@/lib/ssrf";
import { flattenJson, leavesFromText, parameterContract, splitApiUrl } from "@/lib/draft";
import { describeErrorBody, embeddedFailureRule, failureText, fieldMessage, matchErrorRule, type ErrorRule } from "@/lib/error-rules";
import { readableFailure } from "@/lib/log-read";
import { maskedErrorBody, packErrorLog, type ErrorCallRecord } from "@/lib/error-log";
import { admit, clientAddress, collectQuery, hasControlCharacter, isHopHeader, readRequestText } from "@/lib/intake";
import { combinePayloads } from "@/lib/combine";
import { listBarricadeSources, recordRouteCall } from "@/lib/sources";
import { alignInstagramPayload, instagramPayloadEmpty, shapeInstagramPayload } from "@/lib/instagram-contract";
import { applyTemplate, fillString, fillUrlPath, renderBody, type ConsumerContext } from "@/lib/transform";

const MESSAGES: Record<string, string> = {
  nao_encontrada: "Barricada não encontrada.",
  nao_autorizado: "Token ausente ou inválido.",
  origem_negada: "Origem ausente ou não autorizada.",
  inativa: "Esta barricada está desativada.",
  metodo_invalido: "Método não permitido nesta barricada.",
  limite_diario: "O limite diário desta barricada foi atingido.",
  limite_minuto: "O limite de requisições por minuto foi atingido.",
  parametro_obrigatorio: "Faltam parâmetros obrigatórios.",
  parametro_desconhecido: "A requisição enviou um parâmetro que esta barricada não aceita.",
  parametro_invalido: "Um parâmetro da requisição é inválido.",
  payload_invalido: "O corpo da requisição não é um JSON válido.",
  payload_grande: "O corpo da requisição excede o tamanho permitido.",
  limite_entrada: "Muitas requisições em sequência. Aguarde um instante.",
  destino_bloqueado: "O destino configurado não pode ser chamado.",
  indisponivel: "O serviço externo não respondeu.",
  tempo_esgotado: "O serviço externo excedeu o tempo limite.",
  cota: "A cota do provedor foi atingida.",
  id_instagram: "O id numérico do Instagram não foi encontrado.",
  provedor: "A chamada foi recusada pelo serviço externo.",
};

export async function serveBarricade(request: Request, slug: string) {
  const ip = clientAddress(request);
  if (!admit("aberto:global", 12_000) || !admit(`aberto:${slug}`, 3_000) || !admit(`aberto:${ip}:${slug}`, 1_200)) {
    return errorResponse(request, null, 429, "limite_entrada");
  }

  const barricade = await getBarricadeBySlug(slug);
  if (!barricade) return errorResponse(request, null, 404, "nao_encontrada");

  const cors = corsHeaders(request, barricade);
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: cors });
  }

  const day = dayKey();
  const requestId = randomBytes(12).toString("hex");

  if (request.method !== barricade.method) {
    return deny(barricade, request, requestId, day, 405, "metodo_invalido", ip);
  }

  const token = bearer(request);
  if (!token || !(await verifyBarricadeToken(token, barricade.tokenHash))) {
    return deny(barricade, request, requestId, day, 401, "nao_autorizado", ip);
  }

  if (!originAllowed(request, barricade)) {
    return deny(barricade, request, requestId, day, 403, "origem_negada", ip);
  }

  if (!barricade.active) {
    return deny(barricade, request, requestId, day, 403, "inativa", ip);
  }

  const incoming = await readIncoming(request, barricade);
  if ("error" in incoming) {
    const code = incoming.error ?? "payload_invalido";
    return deny(barricade, request, requestId, day, 400, code, ip);
  }

  await bump(barricade.id, day, "received");

  const started = Date.now();
  let delivered: Delivery;
  try {
    delivered = await deliverCall(barricade, incoming.consumer, requestId, true);
  } catch {
    return errorResponse(request, barricade, 500, "indisponivel", requestId);
  }
  if (delivered.blocked) {
    await reject(barricade, request, requestId, day, 429, delivered.blocked);
    return errorResponse(request, barricade, 429, delivered.blocked, requestId);
  }

  const duration = Date.now() - started;
  const { delivery } = delivered;
  const success = delivery.ok;
  const consumerStatus = success
    ? delivery.status && delivery.status >= 200 && delivery.status < 300 ? delivery.status : 200
    : failureStatus(delivered.upstream?.failure);
  const rawFailure = delivered.failureDetail || (success ? "" : delivered.upstream?.failure || delivered.blocked || "indisponivel");
  const alvo = requestTarget(barricade.slug, queryRecord(request));
  await writeLog({
    requestId,
    barricade,
    processed: delivered.processed,
    day,
    providerStatus: delivery.status ?? delivered.upstream?.status ?? null,
    consumerStatus,
    duration,
    outcome: success ? (delivered.usedFallback ? "fallback" : "sucesso") : "falha",
    attempts: (delivered.usedFallback || delivered.triedReserve ? 2 : 1) + delivery.extraCalls + delivery.retries,
    usedFallback: delivered.usedFallback,
    fallbackReason: delivered.fallbackReason,
    failureReason: rawFailure ? rawFailure.slice(0, 500) : null,
    errorJson: packErrorLog(delivered.errorCalls),
    counted: Boolean(delivered.upstream) || delivery.extraCalls > 0,
    consumerKey: consumerKey(request, barricade.tokenPrefix),
    alvo,
  });
  await execute("UPDATE barricades SET last_used_at = CURRENT_TIMESTAMP WHERE id = ?", [barricade.id]);

  if (!success) {
    const mapped = consumerError(delivered.upstream?.failure);
    return errorResponse(request, barricade, mapped.status, mapped.code, requestId);
  }

  return Response.json(presentInstagram(delivery.payload, delivered.processed.slug), {
    status: consumerStatus,
    headers: { ...cors, "x-request-id": requestId, "cache-control": "no-store" },
  });
}

type UpstreamResult = ReturnType<typeof resultShell>;
type Settled = { result: UpstreamResult; action: "keep" | "omit" | "fallback" | "legacy"; retried: boolean; rule: ErrorRule | null };
type Delivery = {
  blocked: "limite_diario" | "limite_minuto" | null;
  usedFallback: boolean;
  triedReserve: boolean;
  fallbackReason: string | null;
  processed: BarricadeRecord;
  upstream: UpstreamResult | undefined;
  failureDetail: string | null;
  failureCore: string;
  errorCalls: ErrorCallRecord[];
  delivery: { ok: boolean; payload: unknown; status: number | null; extraCalls: number; retries: number };
};

async function deliverCall(
  barricade: BarricadeRecord,
  consumer: ConsumerContext,
  requestId: string,
  allowFallback: boolean,
  seen: Set<number> = new Set(),
): Promise<Delivery> {
  if (seen.has(barricade.id)) {
    return {
      blocked: null,
      usedFallback: false,
      triedReserve: false,
      fallbackReason: null,
      processed: barricade,
      upstream: { ...emptyResult(), failure: "destino_bloqueado" },
      failureDetail: "reserva: ciclo",
      failureCore: "ciclo",
      errorCalls: [],
      delivery: emptyDelivery(),
    };
  }
  const trail = new Set(seen);
  trail.add(barricade.id);
  const page = pageDecision(barricade.slug, consumer, seen.size > 0);
  if (page.skip && allowFallback && barricade.fallbackId) {
    const hopped = await hopFallback(barricade, consumer, requestId, "pagina", `${barricade.apiName}, o token desta página pertence à reserva.`, trail);
    if (hopped.ok) return { ...hopped.delivery, errorCalls: [] };
  }
  consumer = page.consumer;
  const primary = await executeProtected(barricade, consumer, requestId);
  if (primary.blocked) {
    return { blocked: primary.blocked, usedFallback: false, triedReserve: false, fallbackReason: null, processed: barricade, upstream: primary.result, failureDetail: primary.blocked, failureCore: primary.blocked, errorCalls: [], delivery: emptyDelivery() };
  }
  const settledPrimary = await settleUpstream(primary.result, barricade.errorRules, () => recallPrimary(barricade, consumer, requestId));
  const primaryReason = settledPrimary.action === "fallback"
    ? "regra"
    : settledPrimary.result.failure ?? "indisponivel";
  const primarySecrets = primary.secret ? [primary.secret] : [];
  const primaryCore = explainUpstream(settledPrimary.result, settledPrimary.rule, primarySecrets);
  const primaryNote = namedFailure(barricade.apiName, primaryCore);
  const primaryCause = `${barricade.apiName}, ${httpPhrase(settledPrimary.result)}. ${readableFailure(primaryCore).replace(/ · /g, ". ")}`;
  const errorCalls: ErrorCallRecord[] = [];
  const primaryFailed = !settledPrimary.result.ok || settledPrimary.action !== "keep";
  const primaryError = primaryFailed
    ? errorCall(barricade.apiName, "principal", settledPrimary.result, leadingCode(settledPrimary.result, settledPrimary.rule), primarySecrets)
    : null;
  if (primaryError) errorCalls.push(primaryError);
  if (settledPrimary.result.ok && settledPrimary.action !== "keep" && primaryError) {
    await markRejectedApiLogs(requestId, barricade.id, barricade.apiId, primaryCore, packErrorLog([primaryError]));
  }
  let reserveNote = "";
  let bothFailedText = "";
  const renderedPrimary = settledPrimary.action === "keep"
    ? renderBarricadePayload(barricade.slug, settledPrimary.result.body, barricade.responseTemplate, consumer)
    : undefined;
  const emptyInstagram = settledPrimary.action === "keep" && !hasPageCursor(consumer) && instagramPayloadEmpty(barricade.slug, renderedPrimary);
  const primaryWantsFallback = allowFallback && (
    emptyInstagram ||
    settledPrimary.action === "fallback" ||
    (settledPrimary.action === "legacy" && canFallback(barricade, settledPrimary.result.failure))
  );
  if (primaryWantsFallback) {
    const hopReason = emptyInstagram ? "vazio" : primaryReason;
    const hopCause = emptyInstagram ? `${barricade.apiName}, a resposta veio sem o perfil ou sem a lista.` : primaryCause;
    const hopped = await hopFallback(barricade, consumer, requestId, hopReason, hopCause, trail);
    if (hopped.ok) return { ...hopped.delivery, errorCalls };
    if (hopped.bothFailed) bothFailedText = hopped.detail;
    else reserveNote = hopped.detail;
    errorCalls.push(...hopped.calls.map((call) => ({ ...call, papel: "reserva" as const })));
  }

  const linked = await listBarricadeSources(barricade.id);
  const extras = await Promise.all(linked.map(async (source) => {
    const api = await getApi(source.apiId);
    if (!api?.active) return null;
    const secret = await getApiSecret(api.id);
    await recordRouteCall(barricade.id, api.id);
    const alvo = requestTarget(barricade.slug, consumer.query);
    const result = await callUpstream(api, consumer, secret);
    await logApiCall(requestId, barricade, api, result, secret, alvo);
    const settled = await settleUpstream(result, source.errorRules, async () => {
      await recordRouteCall(barricade.id, api.id);
      const again = await callUpstream(api, consumer, secret);
      await logApiCall(requestId, barricade, api, again, secret, alvo);
      return again;
    });
    return { name: api.name, secret, settled, template: source.responseTemplate };
  }));
  if (allowFallback && extras.some((extra) => extra?.settled.action === "fallback")) {
    const trigger = extras.find((extra) => extra?.settled.action === "fallback");
    const cause = trigger
      ? namedFailure(trigger.name, explainUpstream(trigger.settled.result, trigger.settled.rule, trigger.secret ? [trigger.secret] : []))
      : primaryNote;
    const hopped = await hopFallback(barricade, consumer, requestId, "regra", cause, trail);
    if (hopped.ok) return hopped.delivery;
    if (hopped.bothFailed && !bothFailedText) bothFailedText = hopped.detail;
    else if (!reserveNote) reserveNote = hopped.detail;
    errorCalls.push(...hopped.calls.map((call) => ({ ...call, papel: "reserva" as const })));
  }

  const parts: unknown[] = [];
  let retries = settledPrimary.retried ? 1 : 0;
  if (settledPrimary.action === "keep") parts.push(renderedPrimary);
  let extraCalls = 0;
  let extraStatus: number | null = null;
  const skipped: string[] = [];
  if (settledPrimary.action !== "keep" && primaryNote) skipped.push(primaryNote);
  for (const extra of extras) {
    if (!extra) continue;
    extraCalls += 1;
    if (extra.settled.retried) retries += 1;
    if (extra.settled.action !== "keep") {
      const secrets = extra.secret ? [extra.secret] : [];
      const note = namedFailure(extra.name, explainUpstream(extra.settled.result, extra.settled.rule, secrets));
      if (note) skipped.push(note);
      errorCalls.push(errorCall(extra.name, "api", extra.settled.result, leadingCode(extra.settled.result, extra.settled.rule), secrets));
      continue;
    }
    if (extraStatus == null) extraStatus = extra.settled.result.status;
    parts.push(renderBarricadePayload(barricade.slug, extra.settled.result.body, extra.template, consumer));
  }
  const delivered = parts.length > 0;
  const skippedText = skipped.join(" · ");
  const failureCore = settledPrimary.action === "keep" ? "" : primaryCore;
  return {
    blocked: null,
    usedFallback: false,
    triedReserve: Boolean(bothFailedText),
    fallbackReason: null,
    processed: barricade,
    upstream: settledPrimary.result,
    failureCore,
    errorCalls,
    failureDetail: delivered
      ? (skippedText ? `Ficou de fora: ${skippedText}`.slice(0, 500) : null)
      : (bothFailedText || joinFailure(skippedText || primaryNote, reserveNote)),
    delivery: {
      ok: delivered,
      payload: combinePayloads(parts),
      status: settledPrimary.action === "keep" ? settledPrimary.result.status : extraStatus,
      extraCalls,
      retries,
    },
  };
}

type HopResult = { ok: true; delivery: Delivery } | { ok: false; bothFailed: boolean; detail: string; calls: ErrorCallRecord[] };

async function hopFallback(
  barricade: BarricadeRecord,
  consumer: ConsumerContext,
  requestId: string,
  reason: string,
  cause: string,
  seen: Set<number>,
): Promise<HopResult> {
  const alternative = barricade.fallbackId ? await loadAlternative(barricade.fallbackId) : null;
  const safe = barricade.method === "GET" || barricade.idempotent;
  if (!alternative) return { ok: false, bothFailed: false, detail: "reserva: nenhuma barricada reserva", calls: [] };
  if (!safe) return { ok: false, bothFailed: false, detail: "reserva: esta chamada não pode ser repetida", calls: [] };
  const second = await deliverCall(alternative, aliasInstagramConsumer(consumer), requestId, true, seen);
  if (second.blocked || !second.delivery.ok) {
    const http = httpPhrase(second.upstream);
    const nested = second.failureDetail && /reserva/i.test(second.failureDetail) ? second.failureDetail : "";
    const why = readableFailure(nested || second.failureCore || second.blocked || "indisponivel").replace(/ · /g, ". ");
    const headline = nested ? "As reservas falharam." : "As duas falharam.";
    const detail = `${headline} Principal: ${cause}. Reserva: ${alternative.name}, ${http}. ${why}.`
      .replace(/\s+/g, " ")
      .slice(0, 500);
    const calls = second.errorCalls.length
      ? second.errorCalls
      : [errorCall(alternative.name, "reserva", second.upstream, second.blocked || second.failureCore || "indisponivel", [])];
    return { ok: false, bothFailed: true, detail, calls };
  }
  await bump(barricade.id, dayKey(), "fallback_used");
  return { ok: true, delivery: { ...second, usedFallback: true, triedReserve: false, fallbackReason: reason.slice(0, 255), failureDetail: cause.slice(0, 500), failureCore: "" } };
}

function httpPhrase(result: { status: number | null } | undefined) {
  return result?.status ? `HTTP ${result.status}` : "sem HTTP";
}

async function markRejectedApiLogs(requestId: string, barricadeId: number, apiId: number, reason: string, errorJson: string | null) {
  await execute(
    `UPDATE call_logs SET outcome = 'falha', failure_reason = ?, error_json = ?
     WHERE request_id = ? AND barricade_id = ? AND api_id = ? AND log_scope = 'api' AND outcome = 'sucesso'`,
    [reason.slice(0, 500), errorJson, requestId, barricadeId, apiId],
  );
}

async function recallPrimary(barricade: BarricadeRecord, consumer: ConsumerContext, requestId: string) {
  const api = await getApi(barricade.apiId);
  if (!api?.active) return { ...emptyResult(), failure: "destino_bloqueado" as const };
  const secret = await getApiSecret(api.id);
  await recordRouteCall(barricade.id, api.id);
  const result = await callUpstream(api, consumer, secret);
  await logApiCall(requestId, barricade, api, result, secret, requestTarget(barricade.slug, consumer.query));
  return result;
}

function ruleFor(result: UpstreamResult, rules: ErrorRule[]) {
  return matchErrorRule(rules, { status: result.status, body: result.body }) ?? embeddedFailureRule(result.body);
}

async function settleUpstream(result: UpstreamResult, rules: ErrorRule[], again: () => Promise<UpstreamResult>): Promise<Settled> {
  const matched = ruleFor(result, rules);
  if (!matched) return { result, action: result.ok ? "keep" : "legacy", retried: false, rule: null };
  if (matched.action === "retry") {
    await delay(matched.waitSeconds * 1000);
    const second = await again();
    const next = ruleFor(second, rules);
    if (!next) return { result: second, action: second.ok ? "keep" : "legacy", retried: true, rule: null };
    if (next.action === "fallback") return { result: second, action: "fallback", retried: true, rule: next };
    return { result: second, action: "omit", retried: true, rule: next };
  }
  if (matched.action === "fallback") return { result, action: "fallback", retried: false, rule: matched };
  return { result, action: "omit", retried: false, rule: matched };
}

function emptyDelivery() {
  return { ok: false, payload: {}, status: null, extraCalls: 0, retries: 0 };
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function sampleBarricade(id: number, query: Record<string, string>) {
  const barricade = await getBarricade(id, dayKey());
  if (!barricade) return { error: "Barricada não encontrada." };
  for (const [key, value] of Object.entries(query)) {
    if (!key || key.length > 80 || value.length > 500 || hasControlCharacter(key) || hasControlCharacter(value)) {
      return { error: "Um parâmetro da chamada é inválido." };
    }
  }
  const contract = await barricadeContract(barricade);
  const allowedNames = widenInstagramNames(contract.known.length > 0 ? contract.known : barricade.params.map((param) => param.name));
  const allowed = new Set(allowedNames);
  if (allowed.size > 0 && Object.keys(query).some((key) => !allowed.has(key))) {
    return { error: "A chamada enviou um parâmetro que esta barricada não aceita." };
  }
  const normalized = alignInstagramQuery(query);
  const asked = contract.known.length > 0 ? contract.asked : barricade.params.filter((param) => param.required).map((param) => param.name);
  const missing = asked.find((name) => !normalized[name]?.trim());
  if (missing) return { error: "Faltam parâmetros obrigatórios." };
  const consumer: ConsumerContext = { query: normalized, header: {}, body: {}, path: { ...normalized } };
  const report = await sampleDelivery(barricade, consumer, true);
  if ("error" in report) return report;
  return {
    total: report.total,
    apis: report.apis,
    notice: report.fallback ? `Chamou a barricada reserva ${report.fallback}.` : "A barricada reserva não foi chamada.",
  };
}

async function barricadeContract(barricade: BarricadeRecord) {
  const primary = await getApi(barricade.apiId);
  const linked = await listBarricadeSources(barricade.id);
  const extras = await Promise.all(linked.map((source) => getApi(source.apiId)));
  return parameterContract([primary, ...extras].filter((source) => source != null).flatMap((source) => [
    source.endpointPath,
    source.bodyTemplate,
    ...source.query.map((pair) => pair.value),
    ...source.pathParams.map((pair) => pair.value),
  ]));
}

type SampleApi = { name: string; status: string; body: string };
type SampleReport = { total: string; apis: SampleApi[]; fallback: string | null; ok: boolean };

async function sampleDelivery(
  barricade: BarricadeRecord,
  consumer: ConsumerContext,
  allowFallback: boolean,
  seen: Set<number> = new Set(),
): Promise<SampleReport | { error: string }> {
  if (seen.has(barricade.id)) return { error: "reserva: ciclo" };
  const trail = new Set(seen);
  trail.add(barricade.id);
  const page = pageDecision(barricade.slug, consumer, seen.size > 0);
  if (page.skip && allowFallback && barricade.fallbackId) {
    const hopped = await sampleHop(barricade, consumer, trail);
    if (hopped?.ok) return { ok: true, total: hopped.total, apis: hopped.apis, fallback: hopped.name };
  }
  consumer = page.consumer;
  const primary = await getApi(barricade.apiId);
  if (!primary) return { error: "API não encontrada." };
  const secret = primary.active ? await getApiSecret(primary.id) : "";
  const first = primary.active
    ? await callUpstream(primary, consumer, secret)
    : { ...emptyResult(), failure: "destino_bloqueado" as const };
  const settledPrimary = await settleUpstream(first, barricade.errorRules, () => callUpstream(primary, consumer, secret));
  const apis = [describeSample(primary.name, settledPrimary, secret)];
  const renderedPrimary = settledPrimary.action === "keep"
    ? renderBarricadePayload(barricade.slug, settledPrimary.result.body, barricade.responseTemplate, consumer)
    : undefined;
  const emptyInstagram = settledPrimary.action === "keep" && !hasPageCursor(consumer) && instagramPayloadEmpty(barricade.slug, renderedPrimary);
  const wantsFallback = (settled: Settled) => allowFallback && (
    emptyInstagram ||
    settled.action === "fallback" ||
    (settled.action === "legacy" && canFallback(barricade, settled.result.failure))
  );
  if (wantsFallback(settledPrimary)) {
    const hopped = await sampleHop(barricade, consumer, trail);
    if (hopped) return { ok: hopped.ok, total: hopped.total, apis: [...apis, ...hopped.apis], fallback: hopped.name };
  }

  const linked = await listBarricadeSources(barricade.id);
  const extras: { settled: Settled; template: string; secret: string; index: number }[] = [];
  for (const source of linked) {
    const api = await getApi(source.apiId);
    if (!api?.active) continue;
    const extraSecret = await getApiSecret(api.id);
    const result = await callUpstream(api, consumer, extraSecret);
    const settled = await settleUpstream(result, source.errorRules, () => callUpstream(api, consumer, extraSecret));
    apis.push(describeSample(api.name, settled, extraSecret));
    extras.push({ settled, template: source.responseTemplate, secret: extraSecret, index: apis.length - 1 });
  }
  if (allowFallback && extras.some((extra) => extra.settled.action === "fallback")) {
    const hopped = await sampleHop(barricade, consumer, trail);
    if (hopped) return { ok: hopped.ok, total: hopped.total, apis: [...apis, ...hopped.apis], fallback: hopped.name };
  }

  const parts: unknown[] = [];
  const secrets = [secret, ...extras.map((extra) => extra.secret)].filter((item) => item.length >= 4);
  if (settledPrimary.action === "keep") pushSamplePart(parts, apis[0], settledPrimary.result.body, barricade.responseTemplate, consumer, barricade.slug);
  for (const extra of extras) {
    if (extra.settled.action !== "keep") continue;
    pushSamplePart(parts, apis[extra.index], extra.settled.result.body, extra.template, consumer, barricade.slug);
  }
  const total = parts.length > 0 ? maskText(JSON.stringify(presentInstagram(combinePayloads(parts), barricade.slug), null, 2), secrets) : "Nenhuma API devolveu conteúdo para a barricada.";
  return { ok: parts.length > 0, total, apis, fallback: null };
}

async function sampleHop(barricade: BarricadeRecord, consumer: ConsumerContext, seen: Set<number>) {
  const alternative = barricade.fallbackId ? await loadAlternative(barricade.fallbackId) : null;
  if (!alternative || !(barricade.method === "GET" || barricade.idempotent)) return null;
  const second = await sampleDelivery(alternative, aliasInstagramConsumer(consumer), true, seen);
  if ("error" in second) return { name: alternative.name, total: second.error, apis: [], ok: false };
  return {
    name: alternative.name,
    total: second.total,
    ok: second.ok,
    apis: second.apis.map((api) => ({ ...api, name: `${alternative.name} · ${api.name}` })),
  };
}

function describeSample(name: string, settled: Settled, secret: string): SampleApi {
  const result = settled.result;
  const secrets = secret.length >= 4 ? [secret] : [];
  const body = readableJson(maskText(result.text || result.failure || "Sem conteúdo.", secrets));
  const detail = maskText(sampleErrorText(result, settled.rule), secrets);
  if (result.ok && settled.action === "keep") {
    return { name, status: `HTTP ${result.status ?? 200} · ${result.durationMs} ms`, body };
  }
  const http = result.status ? `HTTP ${result.status}` : "";
  const notes = [
    result.ok ? http : `Falhou${http ? ` · ${http}` : ""}`,
    detail,
    settled.retried ? "tentou de novo" : "",
    settled.action === "omit" ? "ficou de fora da resposta" : "",
    `${result.durationMs} ms`,
  ].filter(Boolean);
  return { name, status: notes.join(" · "), body };
}

function sampleErrorText(result: UpstreamResult, rule: ErrorRule | null) {
  const body = result.body ?? result.text;
  if (rule?.kind === "field") return fieldMessage(body, rule.field) || `${rule.field}: ${rule.message}`;
  if (result.ok) return "";
  return describeErrorBody(body);
}

function explainUpstream(result: UpstreamResult, rule: ErrorRule | null, secrets: string[] = []) {
  return maskText(failureText({
    failure: result.failure,
    status: result.status,
    body: result.body ?? result.text,
    rule,
  }), secrets).slice(0, 500);
}

function namedFailure(name: string, text: string) {
  const detail = text.trim();
  if (!detail) return "";
  return name ? `${name}: ${detail}` : detail;
}

function joinFailure(primary: string, reserve: string) {
  const extra = reserve.trim();
  if (!extra) return primary.slice(0, 500);
  const reserveBit = extra.slice(0, 320);
  const room = 500 - reserveBit.length - 3;
  const primaryBit = room > 24 ? primary.slice(0, room) : "";
  return [primaryBit, reserveBit].filter(Boolean).join(" · ").slice(0, 500);
}

function pushSamplePart(parts: unknown[], api: SampleApi, body: unknown, template: string, consumer: ConsumerContext, slug: string) {
  try {
    parts.push(renderBarricadePayload(slug, body, template, consumer));
  } catch {
    api.status = `${api.status} · resposta inválida`;
  }
}

function hasPageCursor(consumer: ConsumerContext) {
  return Boolean(String(consumer.query.pagination_token || consumer.query.max_id || consumer.query.next_max_id || "").trim());
}

function renderBarricadePayload(slug: string, body: unknown, template: string, consumer: ConsumerContext) {
  const rendered = renderPayload(body, template, consumer);
  return shapeInstagramPayload(slug, body, rendered);
}

function readableJson(value: string) {
  const trimmed = value.trim();
  if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) return value;
  try {
    return JSON.stringify(JSON.parse(trimmed), null, 2);
  } catch {
    return value;
  }
}

function renderPayload(body: unknown, template: string, consumer: ConsumerContext) {
  if (!template.trim()) return body;
  return applyTemplate(JSON.parse(template) as unknown, body, consumer);
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
    failureReason: result.ok ? null : explainUpstream(result, null, secret ? [secret] : []),
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

async function executeProtected(barricade: BarricadeRecord, consumer: ConsumerContext, requestId: string) {
  const day = dayKey();
  const dailyOk = await reserve(barricade.id, barricade.dailyLimit, day, "executed");
  if (!dailyOk) return { blocked: "limite_diario" as const, result: emptyResult(), secret: "" };
  if (barricade.minuteLimit > 0) {
    const minuteOk = await reserveMinute(barricade.id, barricade.minuteLimit);
    if (!minuteOk) {
      await execute(
        "UPDATE usage_daily SET executed = GREATEST(executed - 1, 0) WHERE barricade_id = ? AND day_key = ?",
        [barricade.id, day],
      );
      return { blocked: "limite_minuto" as const, result: emptyResult(), secret: "" };
    }
  }
  const api = await getApi(barricade.apiId);
  if (!api || !api.active) {
    return { blocked: null, result: { ...emptyResult(), failure: "destino_bloqueado" as const }, secret: "" };
  }
  const secret = await getApiSecret(api.id);
  await recordRouteCall(barricade.id, api.id);
  const result = await callUpstream(api, consumer, secret);
  await logApiCall(requestId, barricade, api, result, secret, requestTarget(barricade.slug, consumer.query));
  return { blocked: null, result, secret };
}

const USER_ID_SLOT = /[?&]user_id=\{\{\s*consumer\.query\.([a-z0-9_]+)\s*\|/i;
const instagramIds = new Map<string, { id: string; at: number }>();

async function withInstagramUserId(api: ApiRecord, consumer: ConsumerContext, _secret: string): Promise<ConsumerContext> {
  const match = api.endpointPath.match(USER_ID_SLOT);
  if (!match) return consumer;
  const slot = match[1];
  const query = { ...consumer.query };
  const current = String(query[slot] || "").trim();
  if (/^\d+$/.test(current)) return consumer;
  const named = String(query.username_or_url || query.username_or_id || query.username || "").trim().replace(/^@+/, "");
  const handle = named || (current.includes("@") ? "" : current.replace(/^@+/, ""));
  const id = /^\d+$/.test(handle) ? handle : await resolveInstagramUserId(handle);
  if (!id) {
    query[slot] = "";
    delete query.user_id;
    return { ...consumer, query, path: { ...consumer.path, ...query, [slot]: "" } };
  }
  query[slot] = id;
  query.user_id = id;
  return { ...consumer, query, path: { ...consumer.path, ...query } };
}

async function resolveInstagramUserId(handle: string) {
  const username = handle.slice(0, 80);
  if (!/^[A-Za-z0-9._]+$/.test(username)) return "";
  const cached = instagramIds.get(username.toLowerCase());
  if (cached && Date.now() - cached.at < 15 * 60 * 1000) return cached.id;
  for (const slug of ["realtime-instagram/perfil", "instagram-stable/perfil", "instagram-best/id"]) {
    const id = await instagramIdFrom(slug, username);
    if (id) {
      instagramIds.set(username.toLowerCase(), { id, at: Date.now() });
      return id;
    }
  }
  return "";
}

async function instagramIdFrom(slug: string, handle: string) {
  const barricade = await getBarricadeBySlug(slug);
  if (!barricade?.active) return "";
  const api = await getApi(barricade.apiId);
  if (!api?.active) return "";
  const secret = await getApiSecret(api.id);
  const query = { username_or_url: handle, username_or_id: handle, username: handle };
  const result = await callUpstream(api, { query, header: {}, body: {}, path: { ...query } }, secret);
  if (!result.ok) return "";
  return readInstagramId(result.body);
}

function readInstagramId(body: unknown) {
  const record = body && typeof body === "object" && !Array.isArray(body) ? body as Record<string, unknown> : null;
  if (!record) return "";
  const data = record.data && typeof record.data === "object" && !Array.isArray(record.data) ? record.data as Record<string, unknown> : {};
  for (const value of [record.UserID, record.user_id, record.pk, record.id, data.pk, data.id, data.user_id, data.UserID]) {
    const digits = String(value ?? "").trim();
    if (/^\d+$/.test(digits)) return digits;
  }
  return "";
}

async function callUpstream(api: ApiRecord, consumer: ConsumerContext, secret: string) {
  const started = Date.now();
  const prepared = await withInstagramUserId(api, consumer, secret);
  const userIdSlot = api.endpointPath.match(USER_ID_SLOT);
  if (userIdSlot && !/^\d+$/.test(String(prepared.query[userIdSlot[1]] || "").trim())) {
    return resultShell("", api.method, {}, "", started, false, null, {}, "O id numérico do Instagram não foi encontrado.", "id_instagram");
  }
  const requestBody = omitBlank(renderBody(api.bodyTemplate, prepared) ?? "", "pagination_token");
  let url = "";
  const requestHeaders: Record<string, string> = {};
  try {
    const endpointPath = fillUrlPath(api.endpointPath, prepared);
    if (endpointPath == null) throw new DestinationError();
    const target = new URL(joinUrl(api.baseUrl, endpointPath));
    for (const pair of api.query) {
      const value = fillString(pair.value, prepared);
      if (value && !hasControlCharacter(value)) target.searchParams.set(pair.name, value);
    }
    for (const key of [...target.searchParams.keys()]) {
      if (!target.searchParams.get(key)) target.searchParams.delete(key);
    }
    url = target.toString();
    assertPinned(api.baseUrl, target);
    await assertPublicHttpUrl(url);
    for (const pair of api.headers) {
      if (isHopHeader(pair.name)) continue;
      const value = fillString(pair.value, prepared);
      if (value && !hasControlCharacter(value)) requestHeaders[pair.name] = value;
    }
    if (api.authType === "bearer" && secret) requestHeaders.Authorization = `Bearer ${secret}`;
    if (api.authType === "basic" && secret) requestHeaders.Authorization = `Basic ${Buffer.from(secret).toString("base64")}`;
    if (api.authType === "api_key" && secret && !isHopHeader(api.credentialHeader || "X-Api-Key")) {
      requestHeaders[api.credentialHeader || "X-Api-Key"] = secret;
    }
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
    const body = safeJson(text);
    const failure = response.status === 429 ? "cota" : response.status >= 500 ? "http_5xx" : response.status >= 400 ? "http_4xx" : undefined;
    return resultShell(url, api.method, requestHeaders, requestBody, started, !failure, response.status, responseHeaders, text, failure, body);
  } catch (error) {
    const failure = error instanceof DestinationError ? "destino_bloqueado" : isTimeout(error) ? "tempo_esgotado" : error instanceof Error && error.message === "grande" ? "resposta_grande" : "conexao";
    return resultShell(url, api.method, requestHeaders, requestBody, started, false, null, {}, "", failure);
  }
}

function omitBlank(body: string, field: string) {
  if (!body.includes(field)) return body;
  try {
    const parsed = JSON.parse(body) as Record<string, unknown>;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return body;
    if (parsed[field] === "" || parsed[field] == null) {
      delete parsed[field];
      return JSON.stringify(parsed);
    }
  } catch {
    return body;
  }
  return body;
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
    alvo: requestTarget(barricade.slug, queryRecord(request)),
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
  errorJson?: string | null;
  counted: boolean;
  consumerKey: string;
  alvo?: string | null;
}) {
  const apiName = entry.api?.name ?? entry.barricade?.apiName ?? "API";
  await execute(
    `INSERT INTO call_logs (
      request_id, barricade_id, processed_barricade_id, api_id, barricade_name, processed_name, api_name,
      day_key, method, provider_status, consumer_status, duration_ms, outcome, attempts, used_fallback,
      fallback_reason, failure_reason, error_json, counted, consumer_key, alvo, log_scope
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'geral')`,
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
      entry.errorJson ?? null,
      entry.counted ? 1 : 0,
      entry.consumerKey,
      storedTarget(entry.alvo),
    ],
  );
}

async function logApiCall(
  requestId: string,
  barricade: BarricadeRecord,
  api: ApiRecord,
  result: UpstreamResult,
  secret = "",
  alvo = "",
) {
  await execute(
    `INSERT INTO call_logs (
      request_id, barricade_id, processed_barricade_id, api_id, barricade_name, processed_name, api_name,
      day_key, method, provider_status, consumer_status, duration_ms, outcome, attempts, used_fallback,
      fallback_reason, failure_reason, error_json, counted, consumer_key, alvo, log_scope
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 0, NULL, ?, ?, 0, 'api', ?, 'api')`,
    [
      requestId,
      barricade.id,
      barricade.id,
      api.id,
      barricade.name,
      barricade.name,
      api.name,
      dayKey(),
      api.method,
      result.status,
      result.status ?? 0,
      Math.max(0, result.durationMs),
      result.ok ? "sucesso" : "falha",
      result.ok ? null : explainUpstream(result, null, secret ? [secret] : []),
      result.ok ? null : packErrorLog([errorCall(api.name, "api", result, leadingCode(result, null), secret ? [secret] : [])]),
      storedTarget(alvo),
    ],
  );
}

function leadingCode(result: UpstreamResult | undefined, rule: { kind: string } | null) {
  if (rule?.kind === "field") return "regra";
  if (result?.failure) return result.failure;
  if (result?.status && result.status >= 500) return "http_5xx";
  if (result?.status && result.status >= 400) return "http_4xx";
  return "indisponivel";
}

function errorCall(
  nome: string,
  papel: ErrorCallRecord["papel"],
  result: UpstreamResult | undefined,
  codigo: string,
  secrets: string[],
): ErrorCallRecord {
  const source = result?.body != null && result.body !== "" ? result.body : result?.text || null;
  return {
    nome,
    papel,
    codigo: codigo || "indisponivel",
    http: result?.status ?? null,
    corpo: maskedErrorBody(source, secrets),
  };
}

function canFallback(barricade: BarricadeRecord, failure?: string) {
  if (!barricade.fallbackId || !failure) return false;
  if (failure === "tempo_esgotado") return barricade.fallbackOn.includes("timeout");
  if (failure === "conexao") return barricade.fallbackOn.includes("conexao");
  if (failure === "http_5xx") return barricade.fallbackOn.includes("http_5xx");
  if (failure === "cota") return barricade.fallbackOn.includes("cota");
  return false;
}

async function loadAlternative(id: number) {
  const { getBarricade } = await import("@/lib/barricades");
  const alternative = await getBarricade(id, dayKey());
  if (!alternative?.active || alternative.id === id) return alternative?.active ? alternative : null;
  return alternative;
}

async function deny(
  barricade: BarricadeRecord,
  request: Request,
  requestId: string,
  day: string,
  status: number,
  code: string,
  ip: string,
) {
  if (!admit(`recusa:${barricade.id}`, 60) || !admit(`recusa:${barricade.id}:${ip}`, 20)) {
    return errorResponse(request, barricade, 429, "limite_entrada", requestId);
  }
  await reject(barricade, request, requestId, day, status, code);
  return errorResponse(request, barricade, status, code, requestId);
}

function assertPinned(baseUrl: string, target: URL) {
  let base: URL;
  try {
    base = new URL(baseUrl);
  } catch {
    throw new DestinationError();
  }
  if (target.protocol !== base.protocol || target.hostname !== base.hostname || target.port !== base.port) {
    throw new DestinationError();
  }
  const root = base.pathname.replace(/\/$/, "");
  if (root && target.pathname !== root && !target.pathname.startsWith(`${root}/`)) throw new DestinationError();
}

function originAllowed(request: Request, barricade: BarricadeRecord) {
  const urls = barricade.origins.filter((origin) => origin.startsWith("http://") || origin.startsWith("https://"));
  const ips = barricade.origins.filter((origin) => isIP(origin));
  const origin = request.headers.get("origin");
  if (urls.length > 0 && (!origin || !urls.includes(origin))) return false;
  if (ips.length > 0 && !ips.includes(clientAddress(request))) return false;
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
  if (code === "limite_entrada") headers["retry-after"] = "60";
  if (barricade) Object.assign(headers, corsHeaders(request, barricade));
  if (requestId) headers["x-request-id"] = requestId;
  return Response.json({ erro: code, mensagem: MESSAGES[code] ?? MESSAGES.indisponivel }, { status, headers });
}

async function readIncoming(request: Request, barricade: BarricadeRecord) {
  const url = new URL(request.url);
  const contract = await barricadeContract(barricade);
  const allowed = widenInstagramNames(contract.known.length > 0 ? contract.known : barricade.params.map((param) => param.name));
  const collected = collectQuery(url.searchParams, allowed);
  if ("error" in collected && collected.error) return { error: collected.error };
  const query = alignInstagramQuery(collected.query ?? {});
  const asked = contract.known.length > 0 ? contract.asked : barricade.params.filter((param) => param.required).map((param) => param.name);
  if (asked.some((name) => !query[name]?.trim())) {
    return { error: "parametro_obrigatorio" as const };
  }
  const allowedHeaders = new Set(barricade.allowedHeaders.map((header) => header.toLowerCase()));
  const header: Record<string, string> = {};
  request.headers.forEach((value, key) => {
    const name = key.toLowerCase();
    if (!allowedHeaders.has(name) || isHopHeader(name) || hasControlCharacter(value)) return;
    header[name] = value.slice(0, 500);
  });
  let body: unknown = {};
  if (request.method !== "GET" && request.method !== "DELETE") {
    const raw = await readRequestText(request);
    if ("error" in raw && raw.error) return { error: raw.error };
    if (raw.text) {
      try {
        body = JSON.parse(raw.text) as unknown;
      } catch {
        return { error: "payload_invalido" as const };
      }
    }
  }
  const path = Object.fromEntries(Object.entries(query));
  return { consumer: { query, header, body, path } satisfies ConsumerContext };
}

const INSTAGRAM_PROFILE = /(?:https?:\/\/)?(?:www\.)?instagram\.com\/([A-Za-z0-9._]+)/i;
const RESERVED_HANDLE = new Set(["p", "reel", "reels", "stories", "explore", "accounts", "direct"]);

const INSTAGRAM_ALIASES = [
  ["username_or_url", "username_or_id", "username"],
  ["pagination_token", "max_id", "next_max_id"],
];

const PAGE_ORDER = { st: 0, rt: 1, bx: 2, fast: 2 } as const;

function pagePrefix(slug: string) {
  if (slug.startsWith("instagram-stable/")) return "st" as const;
  if (slug.startsWith("realtime-instagram/")) return "rt" as const;
  if (slug.startsWith("instagram-best/")) return "bx" as const;
  if (slug.startsWith("instagram-fast/")) return "fast" as const;
  return "";
}

function acceptsPageToken(slug: string) {
  return /\/(posts|seguidores|seguindo)$/.test(slug);
}

function pageDecision(slug: string, consumer: ConsumerContext, isReserve: boolean) {
  const prefix = pagePrefix(slug);
  if (!prefix) return { skip: false, consumer };
  const query = { ...consumer.query };
  const path = { ...consumer.path };
  if (!acceptsPageToken(slug)) {
    delete query.pagination_token;
    delete query.max_id;
    delete query.next_max_id;
    delete path.pagination_token;
    delete path.max_id;
    delete path.next_max_id;
    return { skip: false, consumer: { ...consumer, query, path: { ...path, ...query } } };
  }
  const raw = (query.pagination_token || query.max_id || query.next_max_id || "").trim();
  const marked = raw.match(/^(st|rt|bx|fast):(.*)$/);
  delete query.pagination_token;
  delete query.max_id;
  delete query.next_max_id;
  let token = "";
  let skip = false;
  if (marked) {
    const owner = marked[1] as keyof typeof PAGE_ORDER;
    if (owner === prefix) token = marked[2];
    else if (PAGE_ORDER[owner] > PAGE_ORDER[prefix]) skip = true;
  } else if (raw && !isReserve) {
    token = raw;
  }
  if (token) {
    if (prefix === "st") query.pagination_token = token;
    else if (prefix === "bx") query.next_max_id = token;
    else query.max_id = token;
  }
  delete path.pagination_token;
  delete path.max_id;
  delete path.next_max_id;
  return { skip, consumer: { ...consumer, query, path: { ...path, ...query } } };
}

function presentInstagram(payload: unknown, slug: string) {
  const stamped = stampPageToken(alignInstagramPayload(payload, slug), slug);
  if (acceptsPageToken(slug) || !stamped || typeof stamped !== "object" || Array.isArray(stamped)) return stamped;
  const record = { ...(stamped as Record<string, unknown>) };
  delete record.pagination_token;
  return record;
}

function stampPageToken(payload: unknown, slug: string) {
  const prefix = pagePrefix(slug);
  if (!prefix || !payload || typeof payload !== "object" || Array.isArray(payload)) return payload;
  const record = { ...(payload as Record<string, unknown>) };
  const token = record.pagination_token;
  const text = typeof token === "number" && Number.isFinite(token) ? String(token) : typeof token === "string" ? token.trim() : "";
  if (text && !/^(st|rt|bx|fast):/.test(text)) record.pagination_token = `${prefix}:${text}`;
  return record;
}

function widenInstagramNames(names: string[]) {
  const set = new Set(names);
  for (const group of INSTAGRAM_ALIASES) {
    if (group.some((name) => set.has(name))) group.forEach((name) => set.add(name));
  }
  return [...set];
}

function alignInstagramQuery(query: Record<string, string>) {
  const next = normalizeInstagramQuery(query);
  const handle = bareInstagramHandle(next.username_or_id || next.username_or_url || next.username || "").replace(/^@+/, "").trim();
  if (handle) {
    if (!next.username_or_id?.trim()) next.username_or_id = handle;
    if (!next.username_or_url?.trim()) next.username_or_url = handle;
  }
  return next;
}

function aliasInstagramConsumer(consumer: ConsumerContext): ConsumerContext {
  const query = alignInstagramQuery(consumer.query);
  return { ...consumer, query, path: { ...consumer.path, ...query } };
}

function bareInstagramHandle(value: string) {
  const match = value.trim().replace(/^@+/, "").match(INSTAGRAM_PROFILE);
  const handle = match?.[1]?.replace(/\/+$/, "") ?? "";
  if (!handle || RESERVED_HANDLE.has(handle.toLowerCase())) return value;
  return handle;
}

function queryRecord(request: Request) {
  const query: Record<string, string> = {};
  new URL(request.url).searchParams.forEach((value, key) => {
    if (!query[key]) query[key] = value;
  });
  return query;
}

function storedTarget(value: string | null | undefined) {
  const clean = (value ?? "").replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, 180);
  return clean || null;
}

function requestTarget(slug: string, query: Record<string, string>) {
  const first = (...keys: string[]) => {
    for (const key of keys) {
      const value = String(query[key] ?? "").trim();
      if (value) return value;
    }
    return "";
  };
  if (slug.startsWith("instagram-") || slug.startsWith("realtime-instagram")) {
    const raw = first("username_or_url", "username_or_id", "username");
    if (!raw) return "";
    const handle = bareInstagramHandle(raw).replace(/^@+/, "").trim();
    return `@${handle || raw.replace(/^@+/, "")}`;
  }
  if (slug.startsWith("barricada-wpp")) return first("phoneNumber", "number", "phone");
  if (slug.startsWith("ipinfo") || slug.startsWith("ip-")) return first("ip");
  return "";
}

function normalizeInstagramQuery(query: Record<string, string>) {
  const next = { ...query };
  for (const key of Object.keys(next)) {
    if (!/username/i.test(key) || !next[key]) continue;
    next[key] = bareInstagramHandle(next[key]);
  }
  return next;
}

function sampleConsumer(raw: string): ConsumerContext {
  try {
    const parsed = raw.trim() ? (JSON.parse(raw) as Record<string, unknown>) : {};
    const query = normalizeInstagramQuery(stringRecord(parsed.query));
    return {
      query,
      header: stringRecord(parsed.header),
      body: parsed.body ?? {},
      path: { ...stringRecord(parsed.path), ...query },
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

function consumerKey(request: Request, prefix: string) {
  const ip = clientAddress(request);
  return `${prefix}:${ip === "direto" ? "sem-ip" : ip}`.slice(0, 80);
}

function consumerError(failure?: string) {
  if (failure === "tempo_esgotado") return { status: 504, code: "tempo_esgotado" };
  if (failure === "destino_bloqueado") return { status: 422, code: "destino_bloqueado" };
  if (failure === "cota") return { status: 429, code: "cota" };
  if (failure === "id_instagram") return { status: 424, code: "id_instagram" };
  if (failure === "http_4xx") return { status: 424, code: "provedor" };
  return { status: 502, code: "indisponivel" };
}

function failureStatus(failure?: string) {
  return consumerError(failure).status;
}

function responseFields(body: unknown, text: string) {
  if (body && typeof body === "object") return flattenJson(body);
  return leavesFromText(text);
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
    fields: responseFields(result.body, result.text).map((field) => ({
      path: field.path,
      sample: maskText(field.sample, secrets),
    })),
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
  const requestId = randomBytes(12).toString("hex");
  await execute(
    `INSERT INTO usage_daily (barricade_id, day_key, internal_count) VALUES (?, ?, 1)
     ON DUPLICATE KEY UPDATE internal_count = internal_count + 1`,
    [input.barricadeId, day],
  );
  const values = [
    requestId,
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
    input.ok ? null : input.detail.slice(0, 500),
  ];
  const sql = `INSERT INTO call_logs (
      request_id, barricade_id, processed_barricade_id, api_id, barricade_name, processed_name, api_name,
      day_key, method, provider_status, consumer_status, duration_ms, outcome, attempts, used_fallback,
      fallback_reason, failure_reason, counted, consumer_key, log_scope
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'verificacao', 1, 0, NULL, ?, 0, 'verificacao', ?)`;
  await execute(sql, [...values, "geral"]);
  await execute(sql, [...values, "api"]);
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
