import { restoreTemplates } from "@/lib/draft";

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
    return JSON.stringify(applyTemplate(overlayPlainFields(JSON.parse(trimmed) as unknown, consumer), {}, consumer));
  } catch {
    const rendered = renderString(trimmed, {}, consumer);
    return typeof rendered === "string" ? rendered : JSON.stringify(rendered);
  }
}

function overlayPlainFields(parsed: unknown, consumer: ConsumerContext) {
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return parsed;
  const record = parsed as Record<string, unknown>;
  const hasOpenField = Object.values(record).some(
    (value) => typeof value === "string" && /^\{\{\s*consumer\.query\./.test(value),
  );
  if (hasOpenField) return parsed;
  const next: Record<string, unknown> = { ...record };
  for (const [key, value] of Object.entries(record)) {
    if (typeof value !== "string" || value.includes("{{")) continue;
    const incoming = consumer.query[key];
    if (incoming) next[key] = incoming;
  }
  return next;
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

const CONTROL = /[\u0000-\u001F\u007F]/;

export function fillUrlPath(template: string, consumer: ConsumerContext) {
  let safe = true;
  const path = restoreTemplates(template).replace(/\{\{\s*([^|}]+?)\s*(?:\|\s*([^}]*))?\s*\}\}/g, (_match, key: string, fallback?: string) => {
    const value = resolve(key, fallback, {}, consumer);
    const text = value == null ? "" : typeof value === "string" ? value : JSON.stringify(value);
    if (CONTROL.test(text)) {
      safe = false;
      return "";
    }
    return encodeURIComponent(text);
  });
  return safe ? path : null;
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
