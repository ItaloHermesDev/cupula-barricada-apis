import "server-only";
import type { RowDataPacket } from "mysql2/promise";
import { execute, query } from "@/lib/db";
import { type ErrorRule, parseStoredRules } from "@/lib/error-rules";

export type BarricadeSource = {
  id: number;
  apiId: number;
  position: number;
  responseTemplate: string;
  errorRules: ErrorRule[];
};

interface SourceRow extends RowDataPacket {
  id: number;
  api_id: number;
  position: number;
  response_template: string | null;
  error_rules_json: string | null;
}

export async function listBarricadeSources(barricadeId: number) {
  const rows = await query<SourceRow[]>(
    `SELECT id, api_id, position, response_template, error_rules_json
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
    errorRules: parseStoredRules(row.error_rules_json),
  }));
}

export type RouteStat = {
  apiId: number;
  monthlyTokens: number | null;
  requestsPerMinute: number | null;
  subscriptionName: string | null;
  subscriptionPrice: number | null;
  calls: number;
};

interface StatRow extends RowDataPacket {
  api_id: number;
  monthly_tokens: number | null;
  requests_per_minute: number | null;
  subscription_name: string | null;
  subscription_price: number | string | null;
  calls: number;
}

export async function listRouteStats(barricadeId: number) {
  const rows = await query<StatRow[]>(
    `SELECT api_id, monthly_tokens, requests_per_minute, subscription_name, subscription_price, calls
     FROM barricade_api_stats
     WHERE barricade_id = ?`,
    [barricadeId],
  );
  return rows.map((row) => ({
    apiId: row.api_id,
    monthlyTokens: row.monthly_tokens == null ? null : Number(row.monthly_tokens),
    requestsPerMinute: row.requests_per_minute == null ? null : Number(row.requests_per_minute),
    subscriptionName: row.subscription_name?.trim() || null,
    subscriptionPrice: row.subscription_price == null ? null : Number(row.subscription_price),
    calls: Number(row.calls ?? 0),
  }));
}

export async function saveRouteQuotas(
  barricadeId: number,
  routes: { apiId: number; monthlyTokens: number | null; requestsPerMinute: number | null; subscriptionName: string | null; subscriptionPrice: number | null }[],
) {
  for (const route of routes) {
    await execute(
      `INSERT INTO barricade_api_stats (barricade_id, api_id, monthly_tokens, requests_per_minute, subscription_name, subscription_price, calls)
       VALUES (?, ?, ?, ?, ?, ?, 0)
       ON DUPLICATE KEY UPDATE monthly_tokens = VALUES(monthly_tokens), requests_per_minute = VALUES(requests_per_minute),
         subscription_name = VALUES(subscription_name), subscription_price = VALUES(subscription_price)`,
      [barricadeId, route.apiId, route.monthlyTokens, route.requestsPerMinute, route.subscriptionName, route.subscriptionPrice],
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
  sources: { apiId: number; responseTemplate: string; errorRules: ErrorRule[] }[],
) {
  await execute("DELETE FROM barricade_sources WHERE barricade_id = ?", [barricadeId]);
  for (const [position, source] of sources.entries()) {
    await execute(
      `INSERT INTO barricade_sources (barricade_id, api_id, position, response_template, error_rules_json)
       VALUES (?, ?, ?, ?, ?)`,
      [barricadeId, source.apiId, position, source.responseTemplate.trim() || null, JSON.stringify(source.errorRules)],
    );
  }
}
