import "server-only";
import { getBarricadeBySlug, verifyBarricadeToken } from "@/lib/barricades";
import { dayKey } from "@/lib/catalog";
import { execute } from "@/lib/db";

export type DisplaySource = "barricada" | "externo";

export function readDisplaySource(value: unknown): DisplaySource | null {
  const source = String(value ?? "").trim().toLowerCase();
  if (source === "barricada" || source === "externo") return source;
  return null;
}

type ReportFailure = "nao_encontrada" | "inativa" | "nao_autorizado";
type ReportResult = { error: ReportFailure } | { ok: true; origem: DisplaySource };

export async function recordDisplaySource(slug: string, token: string, source: DisplaySource): Promise<ReportResult> {
  const barricade = await getBarricadeBySlug(slug);
  if (!barricade) return { error: "nao_encontrada" as const };
  if (!barricade.active) return { error: "inativa" as const };
  if (!token || !(await verifyBarricadeToken(token, barricade.tokenHash))) return { error: "nao_autorizado" as const };
  await execute("INSERT INTO exibicao_origem (barricade_id, origem, day_key) VALUES (?, ?, ?)", [barricade.id, source, dayKey()]);
  return { ok: true as const, origem: source };
}
