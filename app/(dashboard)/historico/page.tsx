import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { PageFallback } from "@/app/components/dashboard-shell";
import { listApis } from "@/lib/apis";
import { listBarricades } from "@/lib/barricades";
import { dayKey, formatWhen } from "@/lib/catalog";
import { requirePage } from "@/lib/dal";
import { searchLogs } from "@/lib/stats";

export const metadata: Metadata = { title: "Histórico" };

export default function HistoryPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  return (
    <Suspense fallback={<PageFallback />}>
      <History searchParams={searchParams} />
    </Suspense>
  );
}

async function History({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requirePage("historico");
  const params = await searchParams;
  const read = (key: string) => {
    const value = params[key];
    return Array.isArray(value) ? value[0] ?? "" : value ?? "";
  };
  const page = Number(read("page") || "1");
  const [apis, barricades, result] = await Promise.all([
    listApis(),
    listBarricades(dayKey()),
    searchLogs({
      apiId: Number(read("api")) || undefined,
      barricadeId: Number(read("barricada")) || undefined,
      outcome: read("status"),
      from: read("de"),
      to: read("ate"),
      sort: read("ordem"),
      page,
    }),
  ]);
  const pages = Math.max(1, Math.ceil(result.total / 20));

  return (
    <div className="flex flex-col gap-4">
      <form className="grid gap-3 rounded-[14px] border border-line bg-card p-4 md:grid-cols-3 xl:grid-cols-6">
        <select name="api" defaultValue={read("api")} className="rounded-[12px] border border-line bg-background px-3 py-2 text-sm">
          <option value="">Todas as APIs</option>
          {apis.map((api) => <option key={api.id} value={api.id}>{api.name}</option>)}
        </select>
        <select name="barricada" defaultValue={read("barricada")} className="rounded-[12px] border border-line bg-background px-3 py-2 text-sm">
          <option value="">Todas as barricadas</option>
          {barricades.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
        </select>
        <select name="status" defaultValue={read("status")} className="rounded-[12px] border border-line bg-background px-3 py-2 text-sm">
          <option value="">Todos os status</option>
          <option value="sucesso">Sucesso</option>
          <option value="falha">Falha</option>
          <option value="rejeitada">Rejeitada</option>
          <option value="fallback">Fallback</option>
          <option value="verificacao">Verificação</option>
        </select>
        <input type="date" name="de" defaultValue={read("de")} className="rounded-[12px] border border-line bg-background px-3 py-2 text-sm" />
        <input type="date" name="ate" defaultValue={read("ate")} className="rounded-[12px] border border-line bg-background px-3 py-2 text-sm" />
        <select name="ordem" defaultValue={read("ordem")} className="rounded-[12px] border border-line bg-background px-3 py-2 text-sm">
          <option value="recente">Mais recentes</option>
          <option value="duracao">Maior tempo</option>
        </select>
        <button type="submit" className="rounded-[12px] bg-accent px-4 py-2 text-sm font-medium text-accent-foreground md:col-span-3 xl:col-span-6 xl:w-fit">
          Filtrar
        </button>
      </form>
      <div className="overflow-x-auto rounded-[14px] border border-line bg-card">
        <table className="w-full min-w-[880px] text-left text-sm">
          <thead className="text-xs tracking-wide text-muted uppercase">
            <tr>
              <th className="px-4 py-3 font-medium">Quando</th>
              <th className="px-4 py-3 font-medium">Pedido</th>
              <th className="px-4 py-3 font-medium">Barricada</th>
              <th className="px-4 py-3 font-medium">API</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium">Tempo</th>
              <th className="px-4 py-3 font-medium">Fallback</th>
            </tr>
          </thead>
          <tbody>
            {result.rows.length === 0 ? (
              <tr><td colSpan={7} className="px-4 py-8 text-muted">Nenhuma chamada neste filtro.</td></tr>
            ) : result.rows.map((row) => (
              <tr key={row.id} className="border-t border-line">
                <td className="px-4 py-3 text-muted">{formatWhen(row.created_at)}</td>
                <td className="px-4 py-3 font-mono text-xs text-foreground">{row.request_id}</td>
                <td className="px-4 py-3 text-muted">{row.processed_name !== row.barricade_name ? `${row.barricade_name} → ${row.processed_name}` : row.barricade_name}</td>
                <td className="px-4 py-3 text-muted">{row.api_name}</td>
                <td className="max-w-md px-4 py-3 break-words whitespace-normal text-muted">{row.outcome === "verificacao" ? "verificação" : row.outcome} · {row.provider_status ?? "—"}/{row.consumer_status}{row.failure_reason ? ` · ${row.failure_reason}` : ""}</td>
                <td className="px-4 py-3 text-muted">{row.duration_ms} ms · {row.attempts} tent.</td>
                <td className="px-4 py-3 text-muted">{row.outcome === "verificacao" ? "consumo interno" : `${row.used_fallback ? row.fallback_reason || "sim" : "não"} · ${row.counted ? "contabilizada" : "não contabilizada"}`}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex items-center justify-between text-sm text-muted">
        <span>{result.total} registros</span>
        <span className="flex gap-3">
          {result.page > 1 ? <Link href={pageHref(read, result.page - 1)} className="text-accent">Anterior</Link> : null}
          <span>{result.page} / {pages}</span>
          {result.page < pages ? <Link href={pageHref(read, result.page + 1)} className="text-accent">Próxima</Link> : null}
        </span>
      </div>
    </div>
  );
}

function pageHref(read: (key: string) => string, page: number) {
  const params = new URLSearchParams();
  for (const key of ["api", "barricada", "status", "de", "ate", "ordem"]) {
    const value = read(key);
    if (value) params.set(key, value);
  }
  params.set("page", String(page));
  return `/historico?${params.toString()}`;
}
