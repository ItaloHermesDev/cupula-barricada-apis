import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { BarricadePageLinks } from "@/app/components/catalog/barricade-links";
import { PageFallback } from "@/app/components/dashboard-shell";
import { getApi } from "@/lib/apis";
import { getBarricade } from "@/lib/barricades";
import { dayKey, formatWhen } from "@/lib/catalog";
import { requirePage } from "@/lib/dal";
import { listBarricadeSources } from "@/lib/sources";
import { searchLogs } from "@/lib/stats";

export const metadata: Metadata = { title: "Logs" };

export default function BarricadeLogsPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  return (
    <Suspense fallback={<PageFallback />}>
      <BarricadeLogs params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function BarricadeLogs({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requirePage("barricadas");
  const { id } = await params;
  const numericId = Number(id);
  const current = await getBarricade(numericId, dayKey());
  if (!current) notFound();
  const query = await searchParams;
  const read = (key: string) => {
    const value = query[key];
    return Array.isArray(value) ? value[0] ?? "" : value ?? "";
  };
  const apiId = Number(read("api"));
  const page = Number(read("page") || "1");
  const [primary, linked, logs] = await Promise.all([
    getApi(current.apiId),
    listBarricadeSources(current.id),
    searchLogs({
      barricadeId: current.id,
      apiId: Number.isInteger(apiId) && apiId > 0 ? apiId : undefined,
      scope: Number.isInteger(apiId) && apiId > 0 ? "api" : "geral",
      page,
    }),
  ]);
  const extras = await Promise.all(linked.map(async (source) => ({ id: source.apiId, api: await getApi(source.apiId) })));
  const routes = [
    primary ? { id: primary.id, name: primary.name } : null,
    ...extras.flatMap((item) => item.api ? [{ id: item.api.id, name: item.api.name }] : []),
  ].filter((item): item is { id: number; name: string } => Boolean(item));
  const selected = routes.find((route) => route.id === apiId) ?? null;
  const pages = Math.max(1, Math.ceil(logs.total / 20));

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-medium text-foreground">{current.name}</h2>
          <p className="mt-1 text-sm text-muted">
            {selected ? `Chamadas da API ${selected.name}.` : "Chamadas gerais desta barricada."}
          </p>
        </div>
        <BarricadePageLinks id={current.id} />
      </div>
      <div className="flex flex-wrap gap-2">
        <Link href={`/barricadas/${current.id}/logs`} className={tabClass(!selected)}>
          Geral
        </Link>
        {routes.map((route) => (
          <Link key={route.id} href={`/barricadas/${current.id}/logs?api=${route.id}`} className={tabClass(selected?.id === route.id)}>
            {route.name}
          </Link>
        ))}
      </div>
      <div className="overflow-x-auto rounded-[14px] border border-line bg-card">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead className="text-xs tracking-wide text-muted uppercase">
            <tr>
              <th className="px-4 py-3 font-medium">Quando</th>
              <th className="px-4 py-3 font-medium">API</th>
              <th className="px-4 py-3 font-medium">Tipo</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium">Tempo</th>
              <th className="px-4 py-3 font-medium">Fallback</th>
            </tr>
          </thead>
          <tbody>
            {logs.rows.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-muted">
                  {selected ? "Nenhuma chamada desta API." : "Nenhuma chamada registrada."}
                </td>
              </tr>
            ) : logs.rows.map((row) => (
              <tr key={row.id} className="border-t border-line">
                <td className="px-4 py-3 text-muted">{formatWhen(row.created_at)}</td>
                <td className="px-4 py-3 text-foreground">{row.api_name}</td>
                <td className="px-4 py-3 text-foreground">{kindOf(row.outcome)}</td>
                <td className="px-4 py-3 text-foreground">{statusOfLog(row)}</td>
                <td className="px-4 py-3 text-muted">{row.duration_ms} ms</td>
                <td className="px-4 py-3 text-muted">{row.outcome === "verificacao" ? "—" : row.used_fallback ? row.fallback_reason || "sim" : "não"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex items-center justify-between text-sm text-muted">
        <span>{logs.total} registros</span>
        <span className="flex gap-3">
          {logs.page > 1 ? <Link href={pageHref(current.id, selected?.id, logs.page - 1)} className="text-accent">Anterior</Link> : null}
          <span>{logs.page} / {pages}</span>
          {logs.page < pages ? <Link href={pageHref(current.id, selected?.id, logs.page + 1)} className="text-accent">Próxima</Link> : null}
        </span>
      </div>
    </div>
  );
}

function tabClass(active: boolean) {
  return active
    ? "rounded-full bg-accent px-3 py-1.5 text-sm font-medium text-accent-foreground"
    : "rounded-full border border-line px-3 py-1.5 text-sm text-foreground";
}

function pageHref(id: number, apiId: number | undefined, page: number) {
  const params = new URLSearchParams();
  if (apiId) params.set("api", String(apiId));
  params.set("page", String(page));
  return `/barricadas/${id}/logs?${params.toString()}`;
}

function kindOf(outcome: string) {
  if (outcome === "verificacao") return "Verificação";
  if (outcome === "rejeitada") return "Rejeitada";
  if (outcome === "fallback") return "Fallback";
  if (outcome === "falha") return "Falha";
  return "Uso real";
}

function statusOfLog(row: { outcome: string; provider_status: number | null; consumer_status: number; failure_reason: string | null }) {
  if (row.outcome === "verificacao" || row.outcome === "sucesso" || row.outcome === "falha") {
    return `HTTP ${row.provider_status ?? "—"}${row.failure_reason ? ` · ${row.failure_reason}` : ""}`;
  }
  return `${row.outcome} · ${row.provider_status ?? "—"}/${row.consumer_status}`;
}
