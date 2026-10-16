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
import { requirePage } from "@/lib/dal";
import { templateFromFields, splitApiUrl, type OpenField } from "@/lib/draft";
import { inspectApi, previewTemplate, probeUpstream } from "@/lib/gateway";
import { setRoutine } from "@/lib/health";

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

export async function toggleRoutine(formData: FormData) {
  await requirePage("barricadas");
  const id = numberOrNull(formData.get("id"));
  if (!id) return;
  const interval = Number(formData.get("interval"));
  await setRoutine(id, formData.get("enabled") === "1", Number.isFinite(interval) ? interval : 10);
  revalidatePath("/barricadas");
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
    }
    const input = { ...draft.barricade, apiId };
    if (barricadeId) {
      const updated = await updateBarricade(barricadeId, input);
      if (!updated) return { error: "Barricada não encontrada." };
      await applyLogo(barricadeId, logo);
      revalidatePath("/barricadas");
      revalidatePath(`/barricadas/${barricadeId}`);
      revalidatePath(`/barricadas/${barricadeId}/editar`);
      return { success: "Barricada atualizada." };
    }
    try {
      const created = await createBarricade(input, draft.token);
      await applyLogo(created.id, logo);
      revalidatePath("/barricadas");
      return {
        success: "Barricada criada. O token fica salvo em Ver.",
        token: created.token,
        createdId: created.id,
      };
    } catch (error) {
      await deleteApi(apiId);
      throw error;
    }
  } catch (error) {
    if (isDuplicate(error)) return { error: "Já existe uma barricada com esse endereço." };
    if (error instanceof ApiValidationError || error instanceof BarricadeValidationError) return { error: error.message };
    console.error("Falha ao salvar barricada", error);
    return { error: "Não foi possível salvar a barricada." };
  }
}

export async function pingSimpleBarricade(_state: CatalogState, formData: FormData): Promise<CatalogState> {
  await requirePage("barricadas");
  try {
    const draft = await readDraft(formData);
    const preview = await probeUpstream({
      url: draft.url,
      method: draft.api.method,
      headers: draft.api.headers,
      contentType: draft.api.requestContentType,
      bodyTemplate: draft.api.bodyTemplate,
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
  const url = String(formData.get("api_url") ?? "").trim();
  const method = String(formData.get("api_method") ?? "POST");
  if (!isHttpMethod(method)) throw new ApiValidationError("Método HTTP inválido.");
  let parts: { baseUrl: string; endpointPath: string };
  try {
    parts = splitApiUrl(url);
  } catch {
    throw new ApiValidationError("Informe a URL completa da API, começando com https://.");
  }
  if (parts.baseUrl === "https:" || url.length < 12) {
    throw new ApiValidationError("Informe a URL completa da API, começando com https://.");
  }
  const mode = String(formData.get("body_mode") ?? "none");
  const existing = await getApi(numberOrNull(formData.get("api_id")) ?? 0);
  const headers = mergeHeaders(formData, existing?.headers ?? []);
  const fields = readOpenFields(formData);
  let bodyTemplate = "";
  let requestContentType = "application/json";
  if (mode === "form") {
    bodyTemplate = templateFromFields(fields);
    requestContentType = "multipart/form-data";
  } else if (mode === "json") {
    bodyTemplate = String(formData.get("json_body") ?? "").trim();
    requestContentType = "application/json";
  }
  return {
    url,
    token: String(formData.get("token") ?? ""),
    api: {
      name,
      description: "",
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
    barricade: {
      apiId: 0,
      name,
      description: "",
      slug: String(formData.get("slug") ?? ""),
      method: "GET" as const,
      origins: String(formData.get("origins") ?? "")
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean),
      dailyLimit: Number(formData.get("daily_limit") ?? 1000),
      minuteLimit: 0,
      params: fields.filter((field) => field.open).map((field) => ({ name: field.name, required: false })),
      allowedHeaders: [] as string[],
      responseTemplate: String(formData.get("response_template") ?? ""),
      active: formData.get("active") === "1",
      fallbackId: numberOrNull(formData.get("fallback_id")),
      fallbackOn: ["timeout", "conexao", "http_5xx", "cota"],
      idempotent: true,
    },
  };
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

function mergeHeaders(formData: FormData, previous: FieldPair[]) {
  const names = formData.getAll("header_key").map(String);
  const values = formData.getAll("header_value").map(String);
  const keep = formData.getAll("header_keep").map(String);
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

function readOpenFields(formData: FormData): OpenField[] {
  const names = formData.getAll("field_key").map(String);
  const values = formData.getAll("field_value").map(String);
  const open = formData.getAll("field_open").map(String);
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
