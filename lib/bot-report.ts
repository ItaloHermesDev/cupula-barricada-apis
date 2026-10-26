import "server-only";
import { createHash, timingSafeEqual } from "crypto";
import { dayKey } from "@/lib/catalog";
import { execute } from "@/lib/db";

export type BotResult =
  | "sucesso_bot_instagram"
  | "falha_bot_instagram"
  | "sucesso_bot_whatsapp"
  | "falha_bot_whatsapp";

const RESULTS = new Set<BotResult>([
  "sucesso_bot_instagram",
  "falha_bot_instagram",
  "sucesso_bot_whatsapp",
  "falha_bot_whatsapp",
]);

export function readBotResult(value: unknown): BotResult | null {
  const source = String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/instagran/g, "instagram")
    .replace(/\s*-\s*/g, " - ")
    .replace(/\s+/g, " ");
  const normalized = source.replace(" - ", "_").split(" ").join("_") as BotResult;
  return RESULTS.has(normalized) ? normalized : null;
}

export function botTokenMatches(token: string) {
  const expected = process.env.BOT_ORIGEM_TOKEN?.trim() ?? "";
  if (!expected || !token) return false;
  const actual = createHash("sha256").update(token).digest();
  const wanted = createHash("sha256").update(expected).digest();
  return timingSafeEqual(actual, wanted);
}

export async function recordBotResult(result: BotResult) {
  await execute("INSERT INTO bot_resultados (tipo, day_key) VALUES (?, ?)", [result, dayKey()]);
  return result;
}
