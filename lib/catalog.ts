export const HTTP_METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE"] as const;

export type HttpMethod = (typeof HTTP_METHODS)[number];

export type FieldPair = {
  name: string;
  value: string;
};

export type AcceptedParam = {
  name: string;
  required: boolean;
};

export type AuthType = "none" | "bearer" | "basic" | "api_key";

export type ApiFormValues = {
  id: number;
  name: string;
  description: string;
  baseUrl: string;
  endpointPath: string;
  method: HttpMethod;
  requestContentType: string;
  responseContentType: string;
  authType: AuthType;
  hasCredential: boolean;
  credentialHeader: string;
  headers: FieldPair[];
  query: FieldPair[];
  pathParams: FieldPair[];
  bodyTemplate: string;
  timeoutMs: number;
  active: boolean;
};

export type BarricadeFormValues = {
  id: number;
  apiId: number;
  name: string;
  description: string;
  slug: string;
  method: HttpMethod;
  tokenPrefix: string;
  origins: string[];
  dailyLimit: number;
  minuteLimit: number;
  params: AcceptedParam[];
  allowedHeaders: string[];
  responseTemplate: string;
  active: boolean;
  fallbackId: number | null;
  fallbackOn: string[];
  idempotent: boolean;
};

export function isHttpMethod(value: string): value is HttpMethod {
  return HTTP_METHODS.includes(value as HttpMethod);
}

export function isAuthType(value: string): value is AuthType {
  return value === "none" || value === "bearer" || value === "basic" || value === "api_key";
}

export function pairsFromForm(formData: FormData, prefix: string): FieldPair[] {
  const names = formData.getAll(`${prefix}_key`).map(String);
  const values = formData.getAll(`${prefix}_value`).map(String);
  return names
    .map((name, index) => ({ name: name.trim(), value: (values[index] ?? "").trim() }))
    .filter((pair) => pair.name.length > 0)
    .slice(0, 40);
}

export function paramsFromForm(formData: FormData): AcceptedParam[] {
  const names = formData.getAll("param_key").map(String);
  const required = formData.getAll("param_required").map(String);
  return names
    .map((name, index) => ({ name: name.trim(), required: required[index] === "1" }))
    .filter((param) => param.name.length > 0)
    .slice(0, 40);
}

export function dayKey(date = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

export type CatalogState = {
  error?: string;
  success?: string;
  token?: string;
  createdId?: number;
  preview?: {
    url: string;
    method: string;
    requestHeaders: Record<string, string>;
    requestBody: string;
    status: number | null;
    responseHeaders: Record<string, string>;
    responseBody: string;
    fields?: { path: string; sample: string }[];
    durationMs: number;
    failure: string;
    transformed: string;
  };
};

export function formatWhen(value: Date | string | null) {
  if (!value) return "—";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "America/Sao_Paulo",
  }).format(date);
}
