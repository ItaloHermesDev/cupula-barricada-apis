import { SignJWT, jwtVerify } from "jose";

export class SessionConfigError extends Error {
  constructor() {
    super("SESSION_SECRET ausente ou curta demais.");
    this.name = "SessionConfigError";
  }
}

function getKey() {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32) return null;
  return new TextEncoder().encode(secret);
}

export async function encrypt(userId: string) {
  const key = getKey();
  if (!key) throw new SessionConfigError();

  return new SignJWT({ userId })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(key);
}

export async function decrypt(token: string | undefined) {
  const key = getKey();
  if (!key || !token) return null;

  try {
    const { payload } = await jwtVerify(token, key, { algorithms: ["HS256"] });
    if (typeof payload.userId !== "string" || !payload.userId) return null;
    return { userId: payload.userId };
  } catch {
    return null;
  }
}
