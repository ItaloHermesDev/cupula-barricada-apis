export type ErrorCallRecord = {
  nome: string;
  papel: "principal" | "reserva" | "api";
  codigo: string;
  http: number | null;
  corpo: unknown;
};

export type ErrorLogRecord = {
  codigo: string;
  chamadas: ErrorCallRecord[];
};

const SENSITIVE = /authorization|api[-_]?key|token|secret|password|cookie/i;
const LIMIT = 20_000;

export function packErrorLog(chamadas: ErrorCallRecord[]) {
  if (!chamadas.length) return null;
  const record: ErrorLogRecord = {
    codigo: chamadas.length > 1 ? "as_duas" : chamadas[0].codigo,
    chamadas,
  };
  return JSON.stringify(record);
}

export function parseErrorLog(raw: string | null | undefined): ErrorLogRecord | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as ErrorLogRecord;
    if (!parsed || !Array.isArray(parsed.chamadas)) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function maskedErrorBody(body: unknown, secrets: string[]) {
  const redacted = redactValue(body);
  let raw = typeof redacted === "string" ? redacted : JSON.stringify(redacted);
  for (const secret of secrets) {
    if (secret.length >= 4 && raw.includes(secret)) raw = raw.split(secret).join("••••");
  }
  if (raw.length > LIMIT) {
    return { aviso: "O JSON passou de 20 mil caracteres e foi cortado.", texto: raw.slice(0, LIMIT) };
  }
  if (typeof redacted !== "string") {
    try {
      return JSON.parse(raw) as unknown;
    } catch {
      return redacted;
    }
  }
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return raw;
  }
}

function redactValue(value: unknown, depth = 0): unknown {
  if (depth > 8) return "…";
  if (Array.isArray(value)) return value.slice(0, 40).map((item) => redactValue(item, depth + 1));
  if (!value || typeof value !== "object") return value;
  const output: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value)) {
    output[key] = SENSITIVE.test(key) ? "••••" : redactValue(item, depth + 1);
  }
  return output;
}
