"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { ApiValidationError, createApi, deleteApi, getApi, updateApi } from "@/lib/apis";
import {
  BarricadeValidationError,
  clearBarricadeLogo,
  createBarricade,
  deleteBarricade,
  regenerateToken,
  saveBarricadeLogo,
  updateBarricade,
} from "@/lib/barricades";
import {
  isAuthType,
  isHttpMethod,
  pairsFromForm,
  paramsFromForm,
  type CatalogState,
  type FieldPair,
} from "@/lib/catalog";
import { requireAnyPage, requirePage } from "@/lib/dal";
import { distinctOutputError } from "@/lib/combine";
import { parameterContract, splitApiUrlWithOpen, templateFromFields, type OpenField } from "@/lib/draft";
import { inspectApi, previewTemplate, probeUpstream, sampleBarricade } from "@/lib/gateway";
import { checkBarricade, setRoutine } from "@/lib/health";
import { rulesFromForm } from "@/lib/error-rules";
import { listBarricadeSources, replaceBarricadeSources, saveRouteQuotas } from "@/lib/sources";
import { validateResponseTemplate } from "@/lib/transform";

export async function saveApi(_state: CatalogState, formData: FormData): Promise<CatalogState> {
  await requirePage("apis");
  try {
    const input = readApi(formData);
    const id = numberOrNull(formData.get("id"));
    if (id) {
      const updated = await updateApi(id, input);
      if (!updated) return { error: "API não encontrada." };
      revalidatePath("/apis");
      revalidatePath(`/apis/${id}`);
      return { success: "API atualizada." };
    }
    const createdId = await createApi(input);
    revalidatePath("/apis");
    return { success: "API cadastrada.", createdId };
  } catch (error) {
    if (error instanceof ApiValidationError) return { error: error.message };
    console.error("Falha ao salvar API", error);
    return { error: "Não foi possível salvar a API." };
  }
}

export async function removeApi(formData: FormData) {
  await requirePage("apis");
  const id = numberOrNull(formData.get("id"));
  if (!id) redirect("/apis");
  try {
    await deleteApi(id);
  } catch (error) {
    if (error instanceof ApiValidationError) redirect(`/apis/${id}?erro=vinculo`);
    console.error("Falha ao excluir API", error);
  }
  redirect("/apis");
}

export async function testApi(_state: CatalogState, formData: FormData): Promise<CatalogState> {
  await requirePage("apis");
  const id = numberOrNull(formData.get("id"));
  if (!id) return { error: "Salve a API antes de testar." };
  try {
    const result = await inspectApi(id, String(formData.get("sample") ?? ""));
    if ("error" in result && result.error) return { error: result.error };
    if (!("preview" in result) || !result.preview) return { error: "O teste não retornou dados." };
    return { success: "Teste concluído com a configuração salva.", preview: result.preview };
  } catch (error) {
    console.error("Falha ao testar API", error);
    return { error: "Não foi possível testar a API." };
  }
}

export async function saveBarricade(_state: CatalogState, formData: FormData): Promise<CatalogState> {
  await requirePage("barricadas");
  try {
    const input = readBarricade(formData);
    const id = numberOrNull(formData.get("id"));
    if (id) {
      const updated = await updateBarricade(id, input);
      if (!updated) return { error: "Barricada não encontrada." };
      revalidatePath("/barricadas");
      revalidatePath(`/barricadas/${id}`);
      return { success: "Barricada atualizada." };
    }
    const created = await createBarricade(input);
    revalidatePath("/barricadas");
    return {
      success: "Barricada criada. O token fica salvo em Ver.",
      token: created.token,
      createdId: created.id,
    };
  } catch (error) {
    if (isDuplicate(error)) return { error: "Já existe uma barricada com esse identificador." };
    if (error instanceof BarricadeValidationError) return { error: error.message };
    console.error("Falha ao salvar barricada", error);
    return { error: "Não foi possível salvar a barricada." };
  }
}

export async function renewToken(_state: CatalogState, formData: FormData): Promise<CatalogState> {
  await requirePage("barricadas");
  const id = numberOrNull(formData.get("id"));
  if (!id) return { error: "Barricada não encontrada." };
  const token = await regenerateToken(id);
  if (!token) return { error: "Barricada não encontrada." };
  revalidatePath(`/barricadas/${id}`);
  return { success: "Token novo salvo. O anterior deixou de valer.", token };
}

export type BarricadeSampleState = {
  error?: string;
  total?: string;
  notice?: string;
  apis?: { name: string; status: string; body: string }[];
};

export async function runBarricadeSample(_state: BarricadeSampleState, formData: FormData): Promise<BarricadeSampleState> {
  await requireAnyPage("status", "barricadas");
  const id = numberOrNull(formData.get("id"));
  if (!id) return { error: "Barricada não encontrada." };
  const query: Record<string, string> = {};
  for (const [key, value] of formData.entries()) {
    if (typeof value !== "string" || !key.startsWith("param_")) continue;
    const name = key.slice(6).trim();
    if (!name) continue;
    query[name] = value.trim();
  }
  try {
    return await sampleBarricade(id, query);
  } catch (error) {
    console.error("Falha ao testar a barricada", error instanceof Error ? error.message : "erro");
    return { error: "Não foi possível chamar a barricada." };
  }
}

export async function toggleRoutine(formData: FormData) {
  await requireAnyPage("status", "barricadas");
  const id = numberOrNull(formData.get("id"));
  if (!id) return;
  if (formData.get("now") === "1") {
    await checkBarricade(id, { force: true });
    revalidatePath("/barricadas");
    revalidatePath("/status");
    revalidatePath(`/barricadas/${id}`);
    return;
  }
  const interval = Number(formData.get("interval"));
  await setRoutine(id, formData.get("enabled") === "1", Number.isFinite(interval) ? interval : 10);
  revalidatePath("/barricadas");
  revalidatePath("/status");
  revalidatePath(`/barricadas/${id}`);
}

export async function removeBarricade(formData: FormData) {
  await requirePage("barricadas");
  const id = numberOrNull(formData.get("id"));
  if (!id) redirect("/barricadas");
  await deleteBarricade(id);
  redirect("/barricadas");
}

export async function saveSimpleBarricade(_state: CatalogState, formData: FormData): Promise<CatalogState> {
  await requirePage("barricadas");
  const createdIds: number[] = [];
  try {
    const draft = await readDraft(formData);
    const logo = await readLogo(formData);
    const barricadeId = numberOrNull(formData.get("id"));
    let apiId = numberOrNull(formData.get("api_id"));
    if (apiId) {
      const updated = await updateApi(apiId, draft.api);
      if (!updated) return { error: "Barricada não encontrada." };
    } else {
      apiId = await createApi(draft.api);
      createdIds.push(apiId);
    }
    const sourceIds: number[] = [];
    for (const source of draft.sources) {
      if (source.apiId) {
        const updated = await updateApi(source.apiId, source.api);
        if (!updated) throw new ApiValidationError("Uma API combinada não foi encontrada.");
        sourceIds.push(source.apiId);
      } else {
        const id = await createApi(source.api);
        createdIds.push(id);
        sourceIds.push(id);
      }
    }
    const input = { ...draft.barricade, apiId };
    let savedId = barricadeId;
    let token: string | undefined;
    if (barricadeId) {
      const updated = await updateBarricade(barricadeId, input);
      if (!updated) throw new BarricadeValidationError("Barricada não encontrada.");
    } else {
      const created = await createBarricade(input, draft.token);
      savedId = created.id;
      token = created.token;
    }
    if (!savedId || !apiId) throw new BarricadeValidationError("Barricada não encontrada.");
    const previous = barricadeId ? await listBarricadeSources(barricadeId) : [];
    await replaceBarricadeSources(
      savedId,
      sourceIds.map((id, position) => ({
        apiId: id,
        responseTemplate: draft.sources[position]?.responseTemplate ?? "",
        errorRules: draft.sources[position]?.errorRules ?? [],
      })),
    );
    await saveRouteQuotas(savedId, [
      { apiId, monthlyTokens: draft.monthlyTokens, requestsPerMinute: draft.requestsPerMinute },
      ...sourceIds.map((id, position) => ({
        apiId: id,
        monthlyTokens: draft.sources[position]?.monthlyTokens ?? null,
        requestsPerMinute: draft.sources[position]?.requestsPerMinute ?? null,
      })),
    ]);
    const keep = new Set([apiId, ...sourceIds]);
    for (const old of previous) {
      if (keep.has(old.apiId)) continue;
      try {
        await deleteApi(old.apiId);
      } catch {
        // A API continua ligada a outra barricada.
      }
    }
    await applyLogo(savedId, logo);
    revalidatePath("/barricadas");
    revalidatePath(`/barricadas/${savedId}`);
    revalidatePath(`/barricadas/${savedId}/editar`);
    if (!barricadeId) {
      return {
        success: "Barricada criada. O token fica salvo em Ver.",
        token,
        createdId: savedId,
      };
    }
    return { success: "Barricada atualizada." };
  } catch (error) {
    for (const id of createdIds) {
      try {
        await deleteApi(id);
      } catch {
        // A API já ficou ligada à barricada.
      }
    }
    if (isDuplicate(error)) return { error: "Já existe uma barricada com esse endereço." };
    if (error instanceof ApiValidationError || error instanceof BarricadeValidationError) return { error: error.message };
    console.error("Falha ao salvar barricada", error);
    return { error: "Não foi possível salvar a barricada." };
  }
}

export async function pingSimpleBarricade(_state: CatalogState, formData: FormData): Promise<CatalogState> {
  await requirePage("barricadas");
  try {
    const marker = String(formData.get("ping_source") ?? "");
    if (marker && !/^\d+$/.test(marker)) return { error: "Não foi possível chamar a API." };
    const name = String(formData.get("name") ?? "").trim() || "API";
    const block = await readApiBlock(
      formData,
      marker ? `s${marker}_` : "",
      marker ? combinedName(name, Number(marker)) : name,
      "",
    );
    const preview = await probeUpstream({
      url: block.url,
      method: block.api.method,
      headers: block.api.headers,
      contentType: block.api.requestContentType,
      bodyTemplate: block.api.bodyTemplate,
    });
    if (!preview.responseBody) {
      return { error: "A API não devolveu conteúdo.", preview };
    }
    return { success: `Ping concluído · HTTP ${preview.status ?? "—"} · ${preview.durationMs} ms`, preview };
  } catch (error) {
    if (error instanceof ApiValidationError || error instanceof BarricadeValidationError) return { error: error.message };
    console.error("Falha no ping", error);
    return { error: "Não foi possível chamar a API." };
  }
}

async function readDraft(formData: FormData) {
  const name = String(formData.get("name") ?? "");
  const description = String(formData.get("description") ?? "").trim();
  const primary = await readApiBlock(formData, "", name, description);
  const sources = await readSourceBlocks(formData, name, description);
  if (sources.some((source) => source.apiId && source.apiId === primary.apiId)) {
    throw new BarricadeValidationError("A API combinada precisa ser outra URL.");
  }
  const clash = distinctOutputError([primary.responseTemplate, ...sources.map((source) => source.responseTemplate)]);
  if (clash) throw new BarricadeValidationError(clash);
  return {
    url: primary.url,
    token: String(formData.get("token") ?? ""),
    api: primary.api,
    monthlyTokens: primary.monthlyTokens,
    requestsPerMinute: primary.requestsPerMinute,
    sources,
    barricade: {
      apiId: 0,
      name,
      description,
      slug: String(formData.get("slug") ?? ""),
      method: "GET" as const,
      origins: String(formData.get("origins") ?? "")
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean),
      dailyLimit: Number(formData.get("daily_limit") ?? 1000),
      minuteLimit: 0,
      params: callerParams([
        `${primary.endpointPath}\n${primary.api.bodyTemplate}`,
        ...sources.map((source) => `${source.endpointPath}\n${source.api.bodyTemplate}`),
      ]),
      allowedHeaders: [] as string[],
      responseTemplate: primary.responseTemplate,
      errorRules: primary.errorRules,
      active: formData.get("active") === "1",
      fallbackId: numberOrNull(formData.get("fallback_id")),
      fallbackOn: ["timeout", "conexao", "http_5xx", "cota"],
      idempotent: true,
    },
  };
}

async function readSourceBlocks(formData: FormData, name: string, description: string) {
  const indexes = formData.getAll("source_index").map(String);
  if (indexes.length > 5) throw new BarricadeValidationError("Uma barricada combina no máximo 5 APIs além da primeira.");
  const sources = [];
  for (const [position, index] of indexes.entries()) {
    if (!/^\d+$/.test(index)) throw new BarricadeValidationError("Não foi possível ler as APIs combinadas.");
    sources.push(await readApiBlock(formData, `s${index}_`, combinedName(name, position), description));
  }
  return sources;
}

async function readApiBlock(formData: FormData, prefix: string, apiName: string, description: string) {
  const field = (name: string) => `${prefix}${name}`;
  const url = String(formData.get(field("api_url")) ?? "").trim();
  const method = String(formData.get(field("api_method")) ?? "POST");
  if (!isHttpMethod(method)) throw new ApiValidationError("Método HTTP inválido.");
  const openQuery = formData.getAll(field("query_open_name")).map(String).map((item) => item.trim()).filter(Boolean);
  const pathSlots = formData.getAll(field("path_slot")).map(String).flatMap((item) => {
    const bar = item.indexOf("|");
    if (bar <= 0) return [];
    const index = Number(item.slice(0, bar));
    const rest = item.slice(bar + 1);
    const eq = rest.indexOf("=");
    if (!Number.isInteger(index) || eq < 0) return [];
    return [{ index, name: rest.slice(0, eq).trim(), value: rest.slice(eq + 1).trim() }];
  });
  const queryValues = new Map<string, string>();
  for (const item of formData.getAll(field("query_default")).map(String)) {
    const eq = item.indexOf("=");
    if (eq <= 0) continue;
    queryValues.set(item.slice(0, eq), item.slice(eq + 1));
  }
  let parts: { baseUrl: string; endpointPath: string };
  try {
    parts = splitApiUrlWithOpen(url, openQuery, pathSlots, queryValues);
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message.startsWith("O nome") || message.startsWith("O valor") || message.startsWith("Dê um nome") || message.startsWith("Esse nome")) throw new ApiValidationError(message);
    throw new ApiValidationError("Informe a URL completa da API, começando com https://.");
  }
  if (parts.baseUrl === "https:" || url.length < 12) {
    throw new ApiValidationError("Informe a URL completa da API, começando com https://.");
  }
  const mode = String(formData.get(field("body_mode")) ?? "none");
  const apiId = numberOrNull(formData.get(field("api_id")));
  const existing = await getApi(apiId ?? 0);
  const headers = mergeHeaders(formData, existing?.headers ?? [], prefix);
  const fields = readOpenFields(formData, prefix);
  let bodyTemplate = "";
  let requestContentType = "application/json";
  if (mode === "form") {
    bodyTemplate = templateFromFields(fields);
    requestContentType = "multipart/form-data";
  } else if (mode === "json") {
    bodyTemplate = String(formData.get(field("json_body")) ?? "").trim();
    requestContentType = "application/json";
  }
  const responseTemplate = String(formData.get(field("response_template")) ?? "").trim();
  const templateError = validateResponseTemplate(responseTemplate);
  if (templateError) throw new BarricadeValidationError(templateError);
  const errorRules = rulesFromForm(formData, prefix);
  if ("error" in errorRules) throw new BarricadeValidationError(errorRules.error);
  return {
    apiId,
    monthlyTokens: readQuota(formData, field("monthly_tokens")),
    requestsPerMinute: readQuota(formData, field("requests_per_minute")),
    url,
    endpointPath: parts.endpointPath,
    responseTemplate,
    errorRules: errorRules.rules,
    api: {
      name: apiName,
      description,
      baseUrl: parts.baseUrl,
      endpointPath: parts.endpointPath,
      method,
      requestContentType,
      responseContentType: "application/json",
      authType: "none" as const,
      credential: "",
      clearCredential: false,
      credentialHeader: "X-Api-Key",
      headers,
      query: [] as FieldPair[],
      pathParams: [] as FieldPair[],
      bodyTemplate,
      timeoutMs: 15000,
      active: true,
    },
  };
}

function readQuota(formData: FormData, name: string) {
  const raw = String(formData.get(name) ?? "").trim();
  if (!raw) return null;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 0 || value > 1_000_000_000) {
    throw new BarricadeValidationError("Informe um número a partir de zero, ou deixe o campo em branco.");
  }
  return value;
}

function combinedName(name: string, index: number) {
  const suffix = ` · ${index + 2}`;
  return `${name.trim().slice(0, Math.max(2, 120 - suffix.length))}${suffix}`;
}

const LOGO_LIMIT = 400 * 1024;

async function readLogo(formData: FormData) {
  if (formData.get("remove_logo") === "1") return { kind: "remove" as const };
  const file = formData.get("logo");
  if (file && typeof file !== "string" && file.size > 0) {
    if (file.size > LOGO_LIMIT) throw new BarricadeValidationError("A logo precisa ter no máximo 400 KB.");
    const bytes = Buffer.from(await file.arrayBuffer());
    const mime = imageMime(bytes);
    if (!mime) throw new BarricadeValidationError("Use uma imagem PNG, JPG, WEBP ou GIF.");
    return { kind: "save" as const, mime, bytes };
  }
  return { kind: "keep" as const };
}

async function applyLogo(id: number, logo: Awaited<ReturnType<typeof readLogo>>) {
  if (logo.kind === "keep") return;
  if (logo.kind === "remove") {
    await clearBarricadeLogo(id);
    return;
  }
  await saveBarricadeLogo(id, logo.mime, logo.bytes);
}

function imageMime(bytes: Buffer) {
  if (bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return "image/png";
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (bytes.length >= 6 && (bytes.toString("ascii", 0, 6) === "GIF87a" || bytes.toString("ascii", 0, 6) === "GIF89a")) return "image/gif";
  if (bytes.length >= 12 && bytes.toString("ascii", 0, 4) === "RIFF" && bytes.toString("ascii", 8, 12) === "WEBP") return "image/webp";
  return null;
}

function mergeHeaders(formData: FormData, previous: FieldPair[], prefix = "") {
  const names = formData.getAll(`${prefix}header_key`).map(String);
  const values = formData.getAll(`${prefix}header_value`).map(String);
  const keep = formData.getAll(`${prefix}header_keep`).map(String);
  return names
    .map((name, index) => {
      const trimmed = name.trim();
      if (!trimmed) return null;
      const typed = (values[index] ?? "").trim();
      if (!typed && keep[index] === "1") {
        const saved = previous.find((item) => item.name.toLowerCase() === trimmed.toLowerCase());
        if (saved?.value) return { name: trimmed, value: saved.value };
      }
      if (!typed) return null;
      return { name: trimmed, value: typed };
    })
    .filter((item): item is FieldPair => Boolean(item))
    .slice(0, 40);
}

function callerParams(texts: string[]) {
  const contract = parameterContract(texts);
  return contract.known.map((name) => ({ name, required: contract.asked.includes(name) }));
}

function readOpenFields(formData: FormData, prefix = ""): OpenField[] {
  const names = formData.getAll(`${prefix}field_key`).map(String);
  const values = formData.getAll(`${prefix}field_value`).map(String);
  const open = formData.getAll(`${prefix}field_open`).map(String);
  const fields = names
    .map((name, index) => ({ name: name.trim(), value: (values[index] ?? "").trim(), open: open[index] === "1" }))
    .filter((field) => field.name.length > 0)
    .slice(0, 40);
  if (fields.some((field) => !/^[A-Za-z0-9_-]+$/.test(field.name))) {
    throw new ApiValidationError("O nome do campo usa letras, números, _ ou -.");
  }
  if (fields.some((field) => field.open && /[{}|]/.test(field.value))) {
    throw new ApiValidationError("O valor padrão do campo não pode conter {, } ou |.");
  }
  return fields;
}

export async function previewBarricade(_state: CatalogState, formData: FormData): Promise<CatalogState> {
  await requirePage("barricadas");
  const apiId = numberOrNull(formData.get("api_id"));
  if (!apiId) return { error: "Escolha a API antes de visualizar a resposta." };
  try {
    const result = await previewTemplate(apiId, String(formData.get("response_template") ?? ""), String(formData.get("sample") ?? ""));
    if ("error" in result && result.error) return { error: result.error };
    if (!("preview" in result) || !result.preview) return { error: "A prévia não retornou dados." };
    return { success: "Prévia gerada a partir da API salva.", preview: result.preview };
  } catch (error) {
    console.error("Falha na prévia", error);
    return { error: "Não foi possível montar a prévia." };
  }
}

function readApi(formData: FormData) {
  const method = String(formData.get("method") ?? "GET");
  const authType = String(formData.get("auth_type") ?? "none");
  if (!isHttpMethod(method) || !isAuthType(authType)) {
    throw new ApiValidationError("Método ou autenticação inválidos.");
  }
  return {
    name: String(formData.get("name") ?? ""),
    description: String(formData.get("description") ?? ""),
    baseUrl: String(formData.get("base_url") ?? ""),
    endpointPath: String(formData.get("endpoint_path") ?? ""),
    method,
    requestContentType: String(formData.get("request_content_type") ?? "application/json"),
    responseContentType: String(formData.get("response_content_type") ?? "application/json"),
    authType,
    credential: String(formData.get("credential") ?? ""),
    clearCredential: formData.get("clear_credential") === "1",
    credentialHeader: String(formData.get("credential_header") ?? "X-Api-Key"),
    headers: pairsFromForm(formData, "header"),
    query: pairsFromForm(formData, "query"),
    pathParams: pairsFromForm(formData, "path"),
    bodyTemplate: String(formData.get("body_template") ?? ""),
    timeoutMs: Number(formData.get("timeout_ms") ?? 10000),
    active: formData.get("active") === "1",
  };
}

function readBarricade(formData: FormData) {
  const method = String(formData.get("method") ?? "GET");
  if (!isHttpMethod(method)) throw new BarricadeValidationError("Método HTTP inválido.");
  const apiId = numberOrNull(formData.get("api_id"));
  if (!apiId) throw new BarricadeValidationError("Escolha uma API.");
  return {
    apiId,
    name: String(formData.get("name") ?? ""),
    description: String(formData.get("description") ?? ""),
    slug: String(formData.get("slug") ?? ""),
    method,
    origins: String(formData.get("origins") ?? "")
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean),
    dailyLimit: Number(formData.get("daily_limit") ?? 1000),
    minuteLimit: Number(formData.get("minute_limit") ?? 60),
    params: paramsFromForm(formData),
    allowedHeaders: formData.getAll("allowed_header").map(String).map((item) => item.trim()).filter(Boolean),
    responseTemplate: String(formData.get("response_template") ?? ""),
    errorRules: [],
    active: formData.get("active") === "1",
    fallbackId: numberOrNull(formData.get("fallback_id")),
    fallbackOn: formData.getAll("fallback_on").map(String),
    idempotent: formData.get("idempotent") === "1",
  };
}

function numberOrNull(value: FormDataEntryValue | null) {
  const numeric = Number(value);
  return Number.isInteger(numeric) && numeric > 0 ? numeric : null;
}

function isDuplicate(error: unknown) {
  return typeof error === "object" && error !== null && "code" in error && error.code === "ER_DUP_ENTRY";
}
