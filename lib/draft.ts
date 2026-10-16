export type BodyMode = "none" | "json" | "form";

export type OpenField = {
  name: string;
  value: string;
  open: boolean;
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

export function flattenJson(value: unknown) {
  const leaves: Leaf[] = [];
  walk(value, "", leaves);
  return leaves.slice(0, 80);
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

function walk(value: unknown, path: string, leaves: Leaf[]) {
  if (leaves.length >= 80) return;
  if (Array.isArray(value)) {
    value.slice(0, 5).forEach((item, index) => walk(item, path ? `${path}.${index}` : String(index), leaves));
    return;
  }
  if (value && typeof value === "object") {
    for (const [key, item] of Object.entries(value)) {
      walk(item, path ? `${path}.${key}` : key, leaves);
    }
    return;
  }
  if (!path) return;
  const sample = value == null ? "" : typeof value === "string" ? value : JSON.stringify(value);
  leaves.push({ path, sample: sample.slice(0, 80) });
}
