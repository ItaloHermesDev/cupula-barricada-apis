export const ERROR_KINDS = ["http_4xx", "http_5xx", "field"] as const;
export const ERROR_ACTIONS = ["retry", "fallback", "partial"] as const;
export const ERROR_WAIT_MAX = 60;

export type ErrorKind = (typeof ERROR_KINDS)[number];
export type ErrorAction = (typeof ERROR_ACTIONS)[number];

export type ErrorRule = {
  kind: ErrorKind;
  field: string;
  message: string;
  action: ErrorAction;
  waitSeconds: number;
};

const FIELD_NAME = /^[A-Za-z0-9_-]+(?:\.[A-Za-z0-9_-]+)*$/;

export function parseStoredRules(raw: string | null | undefined) {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    const collected = collectErrorRules(parsed);
    return "error" in collected ? [] : collected.rules;
  } catch {
    return [];
  }
}

export function rulesFromForm(formData: FormData, prefix: string) {
  const field = (name: string) => `${prefix}${name}`;
  const kinds = formData.getAll(field("error_kind"));
  const fields = formData.getAll(field("error_field"));
  const messages = formData.getAll(field("error_message"));
  const actions = formData.getAll(field("error_action"));
  const waits = formData.getAll(field("error_wait"));
  return collectErrorRules(kinds.map((kind, index) => ({
    kind: String(kind),
    field: String(fields[index] ?? ""),
    message: String(messages[index] ?? ""),
    action: String(actions[index] ?? ""),
    waitSeconds: Number(waits[index] ?? 1),
  })));
}

export function collectErrorRules(rows: unknown[]) {
  if (rows.length > 8) return { error: "Cada API aceita no máximo 8 erros configurados." };
  const rules: ErrorRule[] = [];
  for (const row of rows) {
    if (!row || typeof row !== "object") return { error: "Não foi possível ler o erro configurado." };
    const record = row as Record<string, unknown>;
    const kind = String(record.kind ?? "");
    const action = String(record.action ?? "");
    if (!isKind(kind)) return { error: "Escolha o tipo do erro: 4xx, 5xx ou um campo." };
    if (!isAction(action)) return { error: "Escolha o que fazer nesse erro." };
    const field = String(record.field ?? "").trim();
    const message = String(record.message ?? "").trim();
    const waitSeconds = Number(record.waitSeconds ?? 1);
    if (kind === "field") {
      if (!FIELD_NAME.test(field)) return { error: "Informe o nome do campo do erro, como message." };
      if (!message || message.length > 200) return { error: "Informe a mensagem desse erro, com até 200 caracteres." };
    }
    if (action === "retry" && (!Number.isInteger(waitSeconds) || waitSeconds < 1 || waitSeconds > ERROR_WAIT_MAX)) {
      return { error: `O tempo para tentar de novo fica entre 1 e ${ERROR_WAIT_MAX} segundos.` };
    }
    rules.push({
      kind,
      field: kind === "field" ? field : "",
      message: kind === "field" ? message : "",
      action,
      waitSeconds: action === "retry" ? waitSeconds : 1,
    });
  }
  return { rules };
}

const MESSAGE_FIELD = /^(message|mensage|msg|error|detail|description|reason|title)$/i;

export function fieldMessage(body: unknown, path: string) {
  const value = readPath(parseBody(body), path);
  if (typeof value === "string" && value.trim()) return `${path}: ${value.trim().slice(0, 180)}`;
  if (typeof value === "number" || typeof value === "boolean") return `${path}: ${String(value)}`;
  return "";
}

export function describeErrorBody(body: unknown): string {
  const parsed = parseBody(body);
  if (typeof parsed === "string") {
    const trimmed = parsed.trim();
    return trimmed ? `mensagem: ${trimmed.slice(0, 180)}` : "";
  }
  const leaves: { path: string; value: string }[] = [];
  const queue: { value: unknown; path: string }[] = [{ value: parsed, path: "" }];
  let index = 0;
  while (index < queue.length && leaves.length < 40) {
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
    const name = current.path.split(".").pop() ?? "";
    if (typeof current.value === "string" && current.value.trim()) {
      leaves.push({ path: current.path, value: current.value.trim().slice(0, 180) });
      continue;
    }
    if ((typeof current.value === "number" || typeof current.value === "boolean") && MESSAGE_FIELD.test(name)) {
      leaves.push({ path: current.path, value: String(current.value) });
    }
  }
  const preferred = leaves.filter((item) => MESSAGE_FIELD.test(item.path.split(".").pop() ?? ""));
  return (preferred.length > 0 ? preferred : leaves).slice(0, 3).map((item) => `${item.path}: ${item.value}`).join(" · ");
}

function parseBody(body: unknown): unknown {
  if (typeof body !== "string") return body;
  const trimmed = body.trim();
  if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) return body;
  try {
    return JSON.parse(trimmed) as unknown;
  } catch {
    return body;
  }
}

export function matchErrorRule(rules: ErrorRule[], outcome: { status: number | null; body: unknown }) {
  for (const rule of rules) {
    if (rule.kind === "http_4xx" && inRange(outcome.status, 400, 499)) return rule;
    if (rule.kind === "http_5xx" && inRange(outcome.status, 500, 599)) return rule;
    if (rule.kind === "field" && fieldHasMessage(outcome.body, rule.field, rule.message)) return rule;
  }
  return null;
}

function isKind(value: string): value is ErrorKind {
  return ERROR_KINDS.includes(value as ErrorKind);
}

function isAction(value: string): value is ErrorAction {
  return ERROR_ACTIONS.includes(value as ErrorAction);
}

function inRange(status: number | null, min: number, max: number) {
  return status != null && status >= min && status <= max;
}

function fieldHasMessage(body: unknown, path: string, message: string) {
  const value = readPath(body, path);
  if (typeof value === "string") return value.toLocaleLowerCase("pt-BR").includes(message.toLocaleLowerCase("pt-BR"));
  if (typeof value === "number" || typeof value === "boolean") return String(value).toLocaleLowerCase("pt-BR").includes(message.toLocaleLowerCase("pt-BR"));
  return false;
}

function readPath(source: unknown, path: string) {
  let current = source;
  for (const part of path.split(".")) {
    if (!current || typeof current !== "object" || Array.isArray(current) || !(part in current)) return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}
