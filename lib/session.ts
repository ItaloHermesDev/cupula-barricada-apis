import "server-only";
import { cookies } from "next/headers";
import { encrypt } from "@/lib/session-token";

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

function cookieOptions(expires: Date) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    expires,
    path: "/",
  };
}

export async function createSession(userId: string) {
  const expires = new Date(Date.now() + WEEK_MS);
  const token = await encrypt(userId);
  const cookieStore = await cookies();
  cookieStore.set("session", token, cookieOptions(expires));
}

export async function deleteSession() {
  const cookieStore = await cookies();
  cookieStore.delete("session");
}
