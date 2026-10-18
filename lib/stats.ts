import "server-only";
import type { RowDataPacket } from "mysql2/promise";
import { dayKey } from "@/lib/catalog";
import { query } from "@/lib/db";

export type OpsState = "ativa" | "operacional" | "instavel" | "com_erro" | "inativa" | "limite_atingido";

type LogRow = RowDataPacket & {
  id: number;
  request_id: string;
  barricade_name: string;
  processed_name: string;
  api_name: string;
  api_id: number | null;
  barricade_id: number | null;
  created_at: Date | string;
  method: string;
  provider_status: number | null;
  consumer_status: number;
  duration_ms: number;
  outcome: string;
  attempts: number;
  used_fallback: number;
  fallback_reason: string | null;
  failure_reason: string | null;
  counted: number;
  consumer_key: string | null;
};

type CountRow = RowDataPacket & { total: number };
type AvgRow = RowDataPacket & { total: number; success: number; latency: number | null; fallback: number };

export async function dashboardStats() {
  const day = dayKey();
  const [apis, barricades, usage, recent, near, byApi, byBarricade] = await Promise.all([
    query<CountRow[]>("SELECT COUNT(*) AS total FROM external_apis"),
    query<CountRow[]>("SELECT COUNT(*) AS total FROM barricades"),
    query<AvgRow[]>(
      `SELECT COUNT(*) AS total,
        SUM(outcome IN ('sucesso', 'fallback')) AS success,
        AVG(CASE WHEN outcome <> 'rejeitada' THEN duration_ms END) AS latency,
        SUM(outcome = 'fallback') AS fallback
       FROM call_logs WHERE day_key = ? AND outcome <> 'verificacao' AND log_scope = 'geral'`,
      [day],
    ),
    query<LogRow[]>(
      "SELECT * FROM call_logs WHERE outcome IN ('falha', 'rejeitada') AND log_scope = 'geral' ORDER BY id DESC LIMIT 8",
    ),
    query<(RowDataPacket & { name: string; daily_limit: number; used_today: number })[]>(
      `SELECT b.name, b.daily_limit, COALESCE(u.executed, 0) AS used_today
       FROM barricades b
       LEFT JOIN usage_daily u ON u.barricade_id = b.id AND u.day_key = ?
       WHERE b.active = 1 AND b.daily_limit > 0 AND COALESCE(u.executed, 0) * 5 >= b.daily_limit * 4
       ORDER BY used_today DESC LIMIT 6`,
      [day],
    ),
    query<(RowDataPacket & { name: string; total: number })[]>(
      `SELECT api_name AS name, COUNT(*) AS total FROM call_logs
       WHERE day_key = ? AND log_scope = 'geral' AND outcome NOT IN ('rejeitada', 'verificacao') GROUP BY api_name ORDER BY total DESC LIMIT 6`,
      [day],
    ),
    query<(RowDataPacket & { name: string; total: number })[]>(
      `SELECT barricade_name AS name, COUNT(*) AS total FROM call_logs
       WHERE day_key = ? AND log_scope = 'geral' AND outcome <> 'verificacao' AND barricade_name <> 'Verificação' GROUP BY barricade_name ORDER BY total DESC LIMIT 6`,
      [day],
    ),
  ]);

  const calls = Number(usage[0]?.total ?? 0);
  const success = Number(usage[0]?.success ?? 0);
  return {
    apis: Number(apis[0]?.total ?? 0),
    barricades: Number(barricades[0]?.total ?? 0),
    calls,
    success,
    errors: Math.max(0, calls - success),
    successRate: calls > 0 ? Math.round((success / calls) * 1000) / 10 : 0,
    latency: Math.round(Number(usage[0]?.latency ?? 0)),
    fallback: Number(usage[0]?.fallback ?? 0),
    recent,
    near,
    byApi,
    byBarricade,
  };
}

export type DaySpend = {
  day: string;
  label: string;
  real: number;
  checks: number;
};

export type ApiCompare = {
  id: number;
  name: string;
  real: number;
  checks: number;
  series: DaySpend[];
};

export type BarricadeSpend = {
  id: number;
  name: string;
  active: boolean;
  dailyLimit: number;
  executed: number;
  peak: number;
  checks: number;
  rejected: number;
  fallback: number;
  healthEnabled: boolean;
  healthOk: boolean | null;
  healthLatencyMs: number | null;
  calls: number;
  success: number;
  latencyMs: number | null;
};

export async function performanceReport(input?: { barricadeId?: number; from?: string; to?: string }) {
  const today = dayKey();
  const range = resolveRange(input?.from, input?.to, today);
  const barricadeId = input?.barricadeId && input.barricadeId > 0 ? input.barricadeId : 0;
  const span: (string | number)[] = [range.from, range.to, barricadeId, barricadeId];
  const [daily, items, outcomes, durations, failures, apiTotals, apiDaily] = await Promise.all([
    query<(RowDataPacket & { day: string; executed: number; checks: number })[]>(
      `SELECT DATE_FORMAT(u.day_key, '%Y-%m-%d') AS day,
              COALESCE(SUM(u.executed), 0) AS executed,
              COALESCE(SUM(u.internal_count), 0) AS checks
       FROM usage_daily u
       INNER JOIN barricades b ON b.id = u.barricade_id
       WHERE u.day_key BETWEEN ? AND ?
         AND (? = 0 OR u.barricade_id = ?)
       GROUP BY u.day_key`,
      span,
    ),
    query<(RowDataPacket & {
      id: number;
      name: string;
      active: number;
      daily_limit: number;
      health_enabled: number;
      health_ok: number | null;
      health_latency_ms: number | null;
      executed: number;
      peak: number;
      checks: number;
      rejected: number;
      fallback_used: number;
    })[]>(
      `SELECT b.id, b.name, b.active, b.daily_limit,
              b.health_enabled, b.health_ok, b.health_latency_ms,
              COALESCE(SUM(u.executed), 0) AS executed,
              COALESCE(MAX(u.executed), 0) AS peak,
              COALESCE(SUM(u.internal_count), 0) AS checks,
              COALESCE(SUM(u.rejected), 0) AS rejected,
              COALESCE(SUM(u.fallback_used), 0) AS fallback_used
       FROM barricades b
       LEFT JOIN usage_daily u ON u.barricade_id = b.id AND u.day_key BETWEEN ? AND ?
       GROUP BY b.id, b.name, b.active, b.daily_limit, b.health_enabled, b.health_ok, b.health_latency_ms
       ORDER BY b.name`,
      [range.from, range.to],
    ),
    query<(RowDataPacket & { barricade_id: number | null; calls: number; success: number; latency: number | null })[]>(
      `SELECT barricade_id,
              SUM(outcome <> 'verificacao') AS calls,
              SUM(outcome IN ('sucesso', 'fallback')) AS success,
              AVG(CASE WHEN outcome NOT IN ('rejeitada', 'verificacao') THEN duration_ms END) AS latency
       FROM call_logs
       WHERE day_key BETWEEN ? AND ? AND log_scope = 'geral'
       GROUP BY barricade_id`,
      [range.from, range.to],
    ),
    query<(RowDataPacket & { duration_ms: number })[]>(
      `SELECT l.duration_ms FROM call_logs l
       INNER JOIN barricades b ON b.id = l.barricade_id
       WHERE l.day_key BETWEEN ? AND ?
         AND l.log_scope = 'geral'
         AND (? = 0 OR l.barricade_id = ?)
         AND l.outcome NOT IN ('rejeitada', 'verificacao')
       ORDER BY l.duration_ms ASC
       LIMIT 2000`,
      span,
    ),
    query<LogRow[]>(
      `SELECT l.* FROM call_logs l
       INNER JOIN barricades b ON b.id = l.barricade_id
       WHERE l.outcome IN ('falha', 'rejeitada')
         AND l.log_scope = 'geral'
         AND l.day_key BETWEEN ? AND ?
         AND (? = 0 OR l.barricade_id = ?)
       ORDER BY l.id DESC
       LIMIT 8`,
      span,
    ),
    query<(RowDataPacket & { id: number; name: string; executed: number; checks: number })[]>(
      `SELECT a.id, a.name,
              COALESCE(SUM(u.executed), 0) AS executed,
              COALESCE(SUM(u.internal_count), 0) AS checks
       FROM external_apis a
       LEFT JOIN barricades b ON b.api_id = a.id
       LEFT JOIN usage_daily u ON u.barricade_id = b.id AND u.day_key BETWEEN ? AND ?
       GROUP BY a.id, a.name
       ORDER BY executed DESC, a.name ASC`,
      [range.from, range.to],
    ),
    query<(RowDataPacket & { api_id: number; day: string; executed: number })[]>(
      `SELECT a.id AS api_id, DATE_FORMAT(u.day_key, '%Y-%m-%d') AS day,
              COALESCE(SUM(u.executed), 0) AS executed
       FROM usage_daily u
       INNER JOIN barricades b ON b.id = u.barricade_id
       INNER JOIN external_apis a ON a.id = b.api_id
       WHERE u.day_key BETWEEN ? AND ?
       GROUP BY a.id, DATE_FORMAT(u.day_key, '%Y-%m-%d')`,
      [range.from, range.to],
    ),
  ]);

  const byDay = new Map(daily.map((row) => [String(row.day).slice(0, 10), row]));
  const series: DaySpend[] = range.days.map((day) => {
    const row = byDay.get(day);
    return {
      day,
      label: `${day.slice(8, 10)}/${day.slice(5, 7)}`,
      real: Number(row?.executed ?? 0),
      checks: Number(row?.checks ?? 0),
    };
  });
  const byOutcome = new Map(
    outcomes.filter((row) => row.barricade_id != null).map((row) => [Number(row.barricade_id), row]),
  );
  const barricades: BarricadeSpend[] = items.map((row) => {
    const outcome = byOutcome.get(Number(row.id));
    return {
      id: Number(row.id),
      name: row.name,
      active: Number(row.active) === 1,
      dailyLimit: Number(row.daily_limit),
      executed: Number(row.executed),
      peak: Number(row.peak),
      checks: Number(row.checks),
      rejected: Number(row.rejected),
      fallback: Number(row.fallback_used),
      healthEnabled: Number(row.health_enabled) === 1,
      healthOk: row.health_ok == null ? null : Number(row.health_ok) === 1,
      healthLatencyMs: row.health_latency_ms == null ? null : Number(row.health_latency_ms),
      calls: Number(outcome?.calls ?? 0),
      success: Number(outcome?.success ?? 0),
      latencyMs: outcome?.latency == null ? null : Math.round(Number(outcome.latency)),
    };
  });
  const usageByApi = new Map<number, Map<string, number>>();
  for (const row of apiDaily) {
    const id = Number(row.api_id);
    const day = String(row.day).slice(0, 10);
    const bucket = usageByApi.get(id) ?? new Map<string, number>();
    bucket.set(day, Number(row.executed));
    usageByApi.set(id, bucket);
  }
  const apis: ApiCompare[] = apiTotals.map((row) => {
    const id = Number(row.id);
    const byDay = usageByApi.get(id);
    return {
      id,
      name: row.name,
      real: Number(row.executed),
      checks: Number(row.checks),
      series: range.days.map((day) => ({
        day,
        label: `${day.slice(8, 10)}/${day.slice(5, 7)}`,
        real: byDay?.get(day) ?? 0,
        checks: 0,
      })),
    };
  });
  const focused = barricades.find((item) => item.id === barricadeId) ?? null;
  const scope = focused ? [focused] : barricades;

  const real = scope.reduce((total, item) => total + item.executed, 0);
  const checks = scope.reduce((total, item) => total + item.checks, 0);
  const singleDay = range.days.length === 1;
  const limited = scope.filter((item) => item.dailyLimit > 0);
  const quotaUsed = singleDay ? limited.reduce((total, item) => total + item.executed, 0) : 0;
  const quotaLimit = limited.reduce((total, item) => total + item.dailyLimit, 0);
  const calls = scope.reduce((total, item) => total + item.calls, 0);
  const success = scope.reduce((total, item) => total + item.success, 0);
  const samples = durations.map((row) => Number(row.duration_ms)).filter((value) => Number.isFinite(value));
  const average = samples.length > 0 ? Math.round(samples.reduce((total, value) => total + value, 0) / samples.length) : null;
  const p95 = samples.length > 0 ? samples[Math.min(samples.length - 1, Math.ceil(samples.length * 0.95) - 1)] : null;

  return {
    today,
    from: range.from,
    to: range.to,
    dayCount: range.days.length,
    singleDay,
    focusedId: focused?.id ?? null,
    focusedName: focused?.name ?? null,
    series,
    apis,
    barricades,
    failures,
    real,
    checks,
    upstream: real + checks,
    rejected: scope.reduce((total, item) => total + item.rejected, 0),
    fallback: scope.reduce((total, item) => total + item.fallback, 0),
    peak: scope.reduce((total, item) => Math.max(total, item.peak), 0),
    quotaUsed,
    quotaLimit,
    quotaPct: singleDay && quotaLimit > 0 ? Math.round((quotaUsed / quotaLimit) * 1000) / 10 : null,
    calls,
    success,
    successRate: calls > 0 ? Math.round((success / calls) * 1000) / 10 : null,
    latency: average,
    p95,
    samples: samples.length,
    periodReal: series.reduce((total, day) => total + day.real, 0),
    periodChecks: series.reduce((total, day) => total + day.checks, 0),
  };
}

function resolveRange(from: string | undefined, to: string | undefined, today: string) {
  const fallback = shiftDay(today, -13);
  let start = isDay(from) ? from : fallback;
  let end = isDay(to) ? to : today;
  if (start > end) [start, end] = [end, start];
  if (end > today) end = today;
  if (start > end) start = end;
  let days = dayKeysBetween(start, end);
  if (days.length > 90) {
    start = days[days.length - 90];
    days = dayKeysBetween(start, end);
  }
  return { from: start, to: end, days };
}

function isDay(value: string | undefined): value is string {
  return Boolean(value && /^\d{4}-\d{2}-\d{2}$/.test(value));
}

function shiftDay(day: string, delta: number) {
  const [year, month, date] = day.split("-").map(Number);
  return dayKey(new Date(Date.UTC(year, month - 1, date + delta, 15)));
}

function dayKeysBetween(from: string, to: string) {
  const keys: string[] = [];
  let cursor = from;
  for (let index = 0; index < 92 && cursor <= to; index += 1) {
    keys.push(cursor);
    cursor = shiftDay(cursor, 1);
  }
  return keys;
}

export async function outcomeSamples() {
  return query<(RowDataPacket & { api_id: number | null; barricade_id: number | null; outcome: string; duration_ms: number })[]>(
    "SELECT api_id, barricade_id, outcome, duration_ms FROM call_logs WHERE log_scope = 'geral' AND outcome NOT IN ('rejeitada', 'verificacao') ORDER BY id DESC LIMIT 300",
  );
}

export function operationalState(
  active: boolean,
  limitReached: boolean,
  samples: { outcome: string; duration_ms: number }[],
): OpsState {
  if (!active) return "inativa";
  if (limitReached) return "limite_atingido";
  if (samples.length === 0) return "ativa";
  const failures = samples.filter((sample) => sample.outcome === "falha").length;
  const latency = samples.reduce((total, sample) => total + sample.duration_ms, 0) / samples.length;
  if (failures === samples.length) return "com_erro";
  if (failures > 0 || latency > 2500) return "instavel";
  return "operacional";
}

export async function searchLogs(filters: {
  apiId?: number;
  barricadeId?: number;
  outcome?: string;
  from?: string;
  to?: string;
  sort?: string;
  scope?: "geral" | "api";
  page: number;
}) {
  const where = ["log_scope = ?"];
  const params: (string | number)[] = [filters.scope === "api" ? "api" : "geral"];
  if (filters.apiId) {
    where.push("api_id = ?");
    params.push(filters.apiId);
  }
  if (filters.barricadeId) {
    where.push("barricade_id = ?");
    params.push(filters.barricadeId);
  }
  if (filters.outcome && ["sucesso", "falha", "rejeitada", "fallback", "verificacao"].includes(filters.outcome)) {
    where.push("outcome = ?");
    params.push(filters.outcome);
  }
  if (filters.from) {
    where.push("day_key >= ?");
    params.push(filters.from);
  }
  if (filters.to) {
    where.push("day_key <= ?");
    params.push(filters.to);
  }
  const order = filters.sort === "duracao" ? "duration_ms DESC, id DESC" : "id DESC";
  const page = Number.isInteger(filters.page) && filters.page > 0 ? filters.page : 1;
  const offset = (page - 1) * 20;
  const rows = await query<LogRow[]>(
    `SELECT * FROM call_logs WHERE ${where.join(" AND ")} ORDER BY ${order} LIMIT 20 OFFSET ${offset}`,
    params,
  );
  const totalRows = await query<CountRow[]>(
    `SELECT COUNT(*) AS total FROM call_logs WHERE ${where.join(" AND ")}`,
    params,
  );
  return { rows, total: Number(totalRows[0]?.total ?? 0), page };
}
