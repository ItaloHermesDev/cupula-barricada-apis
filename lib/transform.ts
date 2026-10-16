export type ConsumerContext = {
  query: Record<string, string>;
  header: Record<string, string>;
  body: unknown;
  path: Record<string, string>;
};

export function applyTemplate(template: unknown, upstream: unknown, consumer: ConsumerContext): unknown {
  if (typeof template === "string") return renderString(template, upstream, consumer);
  if (Array.isArray(template)) return template.map((item) => applyTemplate(item, upstream, consumer));
  if (template && typeof template === "object") {
    return Object.fromEntries(
      Object.entries(template).map(([key, value]) => [key, applyTemplate(value, upstream, consumer)]),
    );
  }
  return template;
}

export function renderBody(template: string, consumer: ConsumerContext) {
  const trimmed = template.trim();
  if (!trimmed) return undefined;
  try {
    return JSON.stringify(applyTemplate(JSON.parse(trimmed) as unknown, {}, consumer));
  } catch {
    const rendered = renderString(trimmed, {}, consumer);
    return typeof rendered === "string" ? rendered : JSON.stringify(rendered);
  }
}

function renderString(template: string, upstream: unknown, consumer: ConsumerContext): unknown {
  const exact = template.match(/^\{\{\s*([^|}]+?)\s*(?:\|\s*([^}]*))?\s*\}\}$/);
  if (exact) return resolve(exact[1], exact[2], upstream, consumer);

  return template.replace(/\{\{\s*([^|}]+?)\s*(?:\|\s*([^}]*))?\s*\}\}/g, (_match, path: string, fallback?: string) => {
    const value = resolve(path, fallback, upstream, consumer);
    if (value === null || value === undefined) return "";
    return typeof value === "string" ? value : JSON.stringify(value);
  });
}

function resolve(path: string, fallback: string | undefined, upstream: unknown, consumer: ConsumerContext) {
  const value = lookup(path.trim(), upstream, consumer);
  if (value === undefined || value === null) {
    return fallback === undefined ? null : coerce(fallback.trim());
  }
  return value;
}

function lookup(path: string, upstream: unknown, consumer: ConsumerContext) {
  if (path.startsWith("consumer.")) return getPath({ consumer }, path);
  return getPath(upstream, path);
}

function getPath(source: unknown, path: string): unknown {
  let current = source;
  for (const part of path.split(".").filter(Boolean)) {
    if (Array.isArray(current) && /^\d+$/.test(part)) {
      current = current[Number(part)];
      continue;
    }
    if (current && typeof current === "object" && part in current) {
      current = (current as Record<string, unknown>)[part];
      continue;
    }
    return undefined;
  }
  return current;
}

function coerce(value: string) {
  if (value === "true") return true;
  if (value === "false") return false;
  if (value === "null") return null;
  if (value !== "" && !Number.isNaN(Number(value))) return Number(value);
  return value;
}

export function fillString(template: string, consumer: ConsumerContext) {
  const rendered = renderString(template, {}, consumer);
  return typeof rendered === "string" ? rendered : rendered == null ? "" : JSON.stringify(rendered);
}

export function validateResponseTemplate(template: string) {
  const trimmed = template.trim();
  if (!trimmed) return null;
  try {
    const parsed = JSON.parse(trimmed) as unknown;
    if (!parsed || typeof parsed !== "object") return "A resposta personalizada precisa ser um objeto ou uma lista JSON.";
    return null;
  } catch {
    return "A resposta personalizada não é um JSON válido.";
  }
}
