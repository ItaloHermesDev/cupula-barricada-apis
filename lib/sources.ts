import "server-only";
import type { RowDataPacket } from "mysql2/promise";
import { execute, query } from "@/lib/db";

export type BarricadeSource = {
  id: number;
  apiId: number;
  position: number;
  responseTemplate: string;
};

interface SourceRow extends RowDataPacket {
  id: number;
  api_id: number;
  position: number;
  response_template: string | null;
}

export async function listBarricadeSources(barricadeId: number) {
  const rows = await query<SourceRow[]>(
    `SELECT id, api_id, position, response_template
     FROM barricade_sources
     WHERE barricade_id = ?
     ORDER BY position ASC, id ASC`,
    [barricadeId],
  );
  return rows.map((row) => ({
    id: row.id,
    apiId: row.api_id,
    position: row.position,
    responseTemplate: row.response_template ?? "",
  }));
}

export type RouteStat = {
  apiId: number;
  monthlyTokens: number | null;
  requestsPerMinute: number | null;
  calls: number;
};

interface StatRow extends RowDataPacket {
  api_id: number;
  monthly_tokens: number | null;
  requests_per_minute: number | null;
  calls: number;
}

export async function listRouteStats(barricadeId: number) {
  const rows = await query<StatRow[]>(
    `SELECT api_id, monthly_tokens, requests_per_minute, calls
     FROM barricade_api_stats
     WHERE barricade_id = ?`,
    [barricadeId],
  );
  return rows.map((row) => ({
    apiId: row.api_id,
    monthlyTokens: row.monthly_tokens == null ? null : Number(row.monthly_tokens),
    requestsPerMinute: row.requests_per_minute == null ? null : Number(row.requests_per_minute),
    calls: Number(row.calls ?? 0),
  }));
}

export async function saveRouteQuotas(
  barricadeId: number,
  routes: { apiId: number; monthlyTokens: number | null; requestsPerMinute: number | null }[],
) {
  for (const route of routes) {
    await execute(
      `INSERT INTO barricade_api_stats (barricade_id, api_id, monthly_tokens, requests_per_minute, calls)
       VALUES (?, ?, ?, ?, 0)
       ON DUPLICATE KEY UPDATE monthly_tokens = VALUES(monthly_tokens), requests_per_minute = VALUES(requests_per_minute)`,
      [barricadeId, route.apiId, route.monthlyTokens, route.requestsPerMinute],
    );
  }
  const ids = routes.map((route) => route.apiId);
  await execute(
    `DELETE FROM barricade_api_stats WHERE barricade_id = ? AND api_id NOT IN (${ids.map(() => "?").join(",")})`,
    [barricadeId, ...ids],
  );
}

export async function recordRouteCall(barricadeId: number, apiId: number) {
  await execute(
    `INSERT INTO barricade_api_stats (barricade_id, api_id, calls) VALUES (?, ?, 1)
     ON DUPLICATE KEY UPDATE calls = calls + 1`,
    [barricadeId, apiId],
  );
}

export async function replaceBarricadeSources(
  barricadeId: number,
  sources: { apiId: number; responseTemplate: string }[],
) {
  await execute("DELETE FROM barricade_sources WHERE barricade_id = ?", [barricadeId]);
  for (const [position, source] of sources.entries()) {
    await execute(
      `INSERT INTO barricade_sources (barricade_id, api_id, position, response_template)
       VALUES (?, ?, ?, ?)`,
      [barricadeId, source.apiId, position, source.responseTemplate.trim() || null],
    );
  }
}
