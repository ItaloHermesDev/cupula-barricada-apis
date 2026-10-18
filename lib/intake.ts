import "server-only";
import { isIP } from "net";

const WINDOW_MS = 60_000;
const BODY_LIMIT = 262_144;
const CONTROL = /[\u0000-\u001F\u007F]/;
const HOP = new Set([
  "host",
  "connection",
  "content-length",
  "transfer-encoding",
  "upgrade",
  "te",
  "trailer",
  "keep-alive",
  "proxy-connection",
  "proxy-authorization",
]);

type Bucket = { count: number; reset: number };
const buckets = new Map<string, Bucket>();

export function admit(key: string, limit: number) {
  const now = Date.now();
  if (buckets.size > 4_000) {
    for (const [name, bucket] of buckets) {
      if (now >= bucket.reset) buckets.delete(name);
    }
  }
  const current = buckets.get(key);
  if (!current || now >= current.reset) {
    buckets.set(key, { count: 1, reset: now + WINDOW_MS });
    return true;
  }
  current.count += 1;
  return current.count <= limit;
}

export function clientAddress(request: Request) {
  const real = request.headers.get("x-real-ip")?.trim() ?? "";
  if (isAddress(real)) return real;
  const forwarded = request.headers.get("x-forwarded-for") ?? "";
  const hops = forwarded
    .split(",")
    .map((part) => part.trim())
    .filter(isAddress);
  return hops.at(-1) ?? "direto";
}

export function isHopHeader(name: string) {
  return HOP.has(name.toLowerCase());
}

export function hasControlCharacter(value: string) {
  return CONTROL.test(value);
}

export function collectQuery(searchParams: URLSearchParams, allowedNames: string[]) {
  const allowed = new Set(allowedNames);
  const query: Record<string, string> = {};
  let count = 0;
  for (const [key, value] of searchParams) {
    count += 1;
    if (count > 40 || key.length > 80 || hasControlCharacter(key) || hasControlCharacter(value)) {
      return { error: "parametro_invalido" as const };
    }
    if (allowed.size > 0 && !allowed.has(key)) return { error: "parametro_desconhecido" as const };
    query[key] = value.slice(0, 500);
  }
  return { query };
}

export async function readRequestText(request: Request) {
  const declared = request.headers.get("content-length");
  if (declared !== null) {
    const size = Number(declared);
    if (!Number.isInteger(size) || size < 0 || size > BODY_LIMIT) return { error: "payload_grande" as const };
  }
  const reader = request.body?.getReader();
  if (!reader) return { text: "" };
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > BODY_LIMIT) {
      await reader.cancel();
      return { error: "payload_grande" as const };
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return { text: new TextDecoder().decode(bytes) };
}

function isAddress(value: string) {
  return Boolean(value) && isIP(value) !== 0;
}
