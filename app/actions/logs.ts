"use server";

import { requireAnyPage } from "@/lib/dal";
import { query } from "@/lib/db";
import { parseErrorLog, type ErrorLogRecord } from "@/lib/error-log";
import type { RowDataPacket } from "mysql2/promise";

export async function readLogError(id: number): Promise<{ error?: string; payload?: ErrorLogRecord }> {
  await requireAnyPage("historico", "barricadas");
  if (!Number.isInteger(id) || id <= 0) return { error: "Registro inválido." };
  const rows = await query<(RowDataPacket & { error_json: string | null })[]>(
    "SELECT error_json FROM call_logs WHERE id = ? LIMIT 1",
    [id],
  );
  const payload = parseErrorLog(rows[0]?.error_json);
  if (!payload) return { error: "Esta chamada não tem o JSON do erro salvo." };
  return { payload };
}
