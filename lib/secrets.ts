import { createCipheriv, createDecipheriv, createHash, randomBytes, timingSafeEqual } from "crypto";

function key() {
  const secret = process.env.SESSION_SECRET ?? "";
  if (secret.length < 32) {
    throw new Error("Segredo de sessão insuficiente para proteger credenciais.");
  }
  return createHash("sha256").update(secret).digest();
}

export function encryptSecret(plain: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const data = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, data]).toString("base64");
}

export function decryptSecret(payload: string) {
  const buffer = Buffer.from(payload, "base64");
  const iv = buffer.subarray(0, 12);
  const tag = buffer.subarray(12, 28);
  const data = buffer.subarray(28);
  const decipher = createDecipheriv("aes-256-gcm", key(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8");
}

export function generateToken() {
  const token = `brc_${randomBytes(32).toString("base64url")}`;
  return { token, hash: hashToken(token), prefix: token.slice(0, 12) };
}

export function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export function tokenMatches(token: string, expectedHash: string) {
  const actual = Buffer.from(hashToken(token), "hex");
  const expected = Buffer.from(expectedHash, "hex");
  if (actual.length !== expected.length) return false;
  return timingSafeEqual(actual, expected);
}

const SENSITIVE = /authorization|api[-_]?key|token|secret|password|cookie/i;

export function isSensitiveHeader(name: string) {
  return SENSITIVE.test(name);
}

export function maskHeaders(headers: Record<string, string>) {
  return Object.fromEntries(
    Object.entries(headers).map(([name, value]) => [name, SENSITIVE.test(name) ? "••••" : value]),
  );
}

export function maskText(value: string, secrets: string[]) {
  let output = value;
  for (const secret of secrets) {
    if (secret.length >= 4) output = output.split(secret).join("••••");
  }
  return output.slice(0, 20_000);
}
