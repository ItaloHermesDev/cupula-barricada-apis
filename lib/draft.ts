export type BodyMode = "none" | "json" | "form";

export type OpenField = {
  name: string;
  value: string;
  open: boolean;
  path?: boolean;
  index?: number;
};

export type Leaf = {
  path: string;
  sample: string;
};

export function splitApiUrl(raw: string) {
  const url = new URL(raw.trim());
  return { baseUrl: url.origin, endpointPath: `${url.pathname}${url.search}` };
}

export function joinApiUrl(baseUrl: string, endpointPath: string) {
  const base = baseUrl.replace(/\/$/, "");
  const path = endpointPath.trim();
  if (!path) return base;
  return `${base}${path.startsWith("/") ? path : `/${path}`}`;
}

export function bodyModeOf(contentType: string, template: string): BodyMode {
  if (!template.trim()) return "none";
  if (contentType.includes("multipart") || contentType.includes("form-urlencoded")) return "form";
  return "json";
}

export type InstructionField = {
  name: string;
  jsonName: string;
  value: string;
};

const QUERY_FIELD = /^\{\{\s*consumer\.query\.([A-Za-z0-9_-]+)\s*(?:\|\s*([^}]*))?\s*\}\}$/;
const ENCODED_TEMPLATE = /%7B%7B([\s\S]*?)%7D%7D/gi;

export function restoreTemplates(value: string) {
  ENCODED_TEMPLATE.lastIndex = 0;
  return value.replace(ENCODED_TEMPLATE, (_match, inner: string) => {
    try {
      return `{{${decodeURIComponent(inner)}}}`;
    } catch {
      return `{{${inner}}}`;
    }
  });
}
const QUERY_PLACEHOLDER = /\{\{\s*consumer\.query\.([A-Za-z0-9_-]+)\s*(?:\|\s*([^}]*))?\s*\}\}/g;
const SECRET_QUERY = /authorization|api[-_]?key|token|secret|password|cookie/i;

export type CallParameter = {
  name: string;
  value: string;
  required: boolean;
};

export function callParameters(input: {
  endpointPath: string;
  query: { name: string; value: string }[];
  pathParams: { name: string; value: string }[];
  bodyTemplate: string;
  params: { name: string; required: boolean }[];
}) {
  const found = new Map<string, CallParameter>();

  function add(param: CallParameter) {
    const name = param.name.trim();
    if (!name || SECRET_QUERY.test(name)) return;
    const current = found.get(name);
    if (!current) {
      found.set(name, { ...param, name });
      return;
    }
    current.required = current.required || param.required;
    if (!current.value && param.value) current.value = param.value;
  }

  function scan(text: string) {
    QUERY_PLACEHOLDER.lastIndex = 0;
    for (const match of text.matchAll(QUERY_PLACEHOLDER)) {
      add({ name: match[1], value: (match[2] ?? "").trim(), required: true });
    }
  }

  const endpointPath = restoreTemplates(input.endpointPath);
  scan(endpointPath.split("?")[0] ?? "");
  for (const pair of endpointQuery(endpointPath)) scan(pair.value);
  for (const pair of input.query) scan(pair.value);
  for (const pair of input.pathParams) scan(pair.value);
  scan(input.bodyTemplate);

  if (input.params.length > 0) {
    const allowed = new Set(input.params.map((param) => param.name));
    for (const name of found.keys()) {
      if (!allowed.has(name)) found.delete(name);
    }
    for (const param of input.params) {
      const current = found.get(param.name);
      if (current) current.required = true;
      else add({ name: param.name, value: "", required: true });
    }
  }

  return [...found.values()];
}

export function queryChoices(rawUrl: string, previous: OpenField[] = []) {
  let url: URL;
  try {
    url = new URL(rawUrl.trim());
  } catch {
    return [];
  }
  const openByName = new Map(previous.map((item) => [item.name, item.open]));
  return [...url.searchParams].flatMap(([name, value]): OpenField[] => {
    if (!name || SECRET_QUERY.test(name)) return [];
    return [{ name, value, open: openByName.get(name) ?? false }];
  });
}

export function pathChoices(rawUrl: string, previous: OpenField[] = []) {
  try {
    return pathFieldsFrom(new URL(rawUrl.trim()).pathname, previous);
  } catch {
    return previous.filter((item) => item.path);
  }
}

function pathFieldsFrom(pathname: string, previous: OpenField[] = []) {
  const previousPath = previous.filter((item) => item.path);
  return pathname.split("/").flatMap((segment, index): OpenField[] => {
    const text = restoreTemplates(safeDecode(segment));
    if (!text) return [];
    const saved = text.match(QUERY_FIELD);
    if (saved) return [{ name: saved[1], value: (saved[2] ?? "").trim(), open: true, path: true, index }];
    const prior = previousPath.find((item) => item.index === index && item.value === text)
      ?? previousPath.find((item) => item.value === text && item.open);
    return [{ name: prior?.name ?? "", value: text, open: prior?.open ?? false, path: true, index }];
  });
}

export function presentApiTarget(baseUrl: string, endpointPath: string) {
  const restored = restoreTemplates(endpointPath);
  const rawPath = restored.split("?")[0] ?? "";
  const pathFields = pathFieldsFrom(rawPath);
  const path = rawPath.split("/").map((segment, index) => pathFields.find((item) => item.index === index)?.value ?? segment).join("/");
  const queryFields = endpointQuery(restored).flatMap((pair): OpenField[] => {
    if (SECRET_QUERY.test(pair.name)) return [];
    const saved = pair.value.match(QUERY_FIELD);
    if (saved) return [{ name: pair.name, value: (saved[2] ?? "").trim(), open: true }];
    return [{ name: pair.name, value: pair.value, open: false }];
  });
  const search = new URLSearchParams();
  for (const pair of endpointQuery(restored)) {
    const field = queryFields.find((item) => item.name === pair.name);
    search.append(pair.name, field ? field.value : pair.value);
  }
  const query = search.toString();
  const base = baseUrl.replace(/\/$/, "");
  return { apiUrl: `${base}${path}${query ? `?${query}` : ""}`, queryFields: [...pathFields, ...queryFields] };
}

export function splitApiUrlWithOpen(raw: string, openNames: string[], pathSlots: { index: number; name: string; value: string }[] = []) {
  const url = new URL(raw.trim());
  const open = new Set(openNames);
  const segments = url.pathname.split("/").map((segment) => restoreTemplates(safeDecode(segment)));
  for (const slot of pathSlots) {
    const name = slot.name.trim();
    if (!name) throw new Error("Dê um nome ao pedaço do caminho que quem chama informa. Exemplo: ip.");
    if (SECRET_QUERY.test(name)) throw new Error("Esse nome fica só no servidor. Escolha outro, como ip.");
    if (!/^[A-Za-z0-9_-]+$/.test(name)) throw new Error("O nome do parâmetro usa letras, números, _ ou -.");
    if (/[{}|]/.test(slot.value)) throw new Error("O valor padrão do parâmetro não pode conter {, } ou |.");
    const template = `{{consumer.query.${name}|${slot.value}}}`;
    let index = slot.index;
    const current = segments[index];
    if (current !== slot.value && current !== template) {
      index = segments.findIndex((segment) => segment === slot.value || segment === template);
    }
    if (index < 0) continue;
    segments[index] = template;
  }
  const parts: string[] = [];
  for (const [name, value] of url.searchParams) {
    if (open.has(name) && !SECRET_QUERY.test(name)) {
      if (!/^[A-Za-z0-9_-]+$/.test(name)) throw new Error("O nome do parâmetro usa letras, números, _ ou -.");
      if (/[{}|]/.test(value)) throw new Error("O valor padrão do parâmetro não pode conter {, } ou |.");
      parts.push(`${encodeURIComponent(name)}={{consumer.query.${name}|${value}}}`);
      continue;
    }
    parts.push(`${encodeURIComponent(name)}=${encodeURIComponent(value)}`);
  }
  return { baseUrl: url.origin, endpointPath: `${segments.join("/")}${parts.length ? `?${parts.join("&")}` : ""}` };
}

function safeDecode(value: string) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function endpointQuery(endpointPath: string) {
  const query = endpointPath.split("?")[1]?.split("#")[0] ?? "";
  if (!query) return [];
  return [...new URLSearchParams(query)].map(([name, value]) => ({ name, value }));
}

export function instructionFields(template: string): InstructionField[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(template);
  } catch {
    return [];
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return [];
  const entries = Object.entries(parsed);
  const open = entries.flatMap(([jsonName, raw]): InstructionField[] => {
    if (typeof raw !== "string") return [];
    const match = raw.match(QUERY_FIELD);
    if (!match) return [];
    return [{ name: match[1], jsonName, value: match[2] ?? "" }];
  });
  if (open.length > 0) return open;
  return entries.flatMap(([jsonName, raw]): InstructionField[] => {
    if (typeof raw !== "string" || raw.includes("{{")) return [];
    return [{ name: jsonName, jsonName, value: raw }];
  });
}

export function fieldsFromTemplate(template: string): OpenField[] {
  try {
    const parsed = JSON.parse(template) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return [];
    return Object.entries(parsed).flatMap(([name, raw]): OpenField[] => {
      const text = raw == null ? "" : typeof raw === "string" ? raw : JSON.stringify(raw);
      const match = text.match(/^\{\{\s*consumer\.query\.([A-Za-z0-9_-]+)\s*(?:\|\s*([^}]*))?\s*\}\}$/);
      if (match) return [{ name, value: match[2] ?? "", open: true }];
      return [{ name, value: text, open: false }];
    });
  } catch {
    return [];
  }
}

export function templateFromFields(fields: OpenField[]) {
  const body: Record<string, string> = {};
  for (const field of fields) {
    const name = field.name.trim();
    if (!name) continue;
    if (!/^[A-Za-z0-9_-]+$/.test(name)) continue;
    body[name] = field.open ? `{{consumer.query.${name}|${field.value}}}` : field.value;
  }
  return JSON.stringify(body);
}

const FIELD_LIST_LIMIT = 400;

export function flattenJson(value: unknown) {
  const leaves: Leaf[] = [];
  const queue: { value: unknown; path: string }[] = [{ value, path: "" }];
  let index = 0;
  while (index < queue.length && leaves.length < FIELD_LIST_LIMIT) {
    const current = queue[index++];
    if (Array.isArray(current.value)) {
      current.value.slice(0, 3).forEach((item, itemIndex) => {
        queue.push({ value: item, path: current.path ? `${current.path}.${itemIndex}` : String(itemIndex) });
      });
      continue;
    }
    if (current.value && typeof current.value === "object") {
      for (const [key, item] of Object.entries(current.value)) {
        queue.push({ value: item, path: current.path ? `${current.path}.${key}` : key });
      }
      continue;
    }
    if (!current.path) continue;
    const sample = current.value == null ? "" : typeof current.value === "string" ? current.value : JSON.stringify(current.value);
    leaves.push({ path: current.path, sample: sample.slice(0, 80) });
  }
  return leaves;
}

export function leavesFromText(body: string) {
  const trimmed = body.trim().replace(/^\uFEFF/, "");
  if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) return [];
  try {
    return flattenJson(JSON.parse(trimmed) as unknown);
  } catch {
    return [];
  }
}

export function selectionFromTemplate(template: string) {
  try {
    const parsed = JSON.parse(template) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return [];
    return Object.entries(parsed).flatMap(([name, raw]) => {
      if (typeof raw !== "string") return [];
      const match = raw.match(/^\{\{\s*([^|}]+?)\s*\}\}$/);
      if (!match) return [];
      return [{ path: match[1].trim(), name }];
    });
  } catch {
    return [];
  }
}

