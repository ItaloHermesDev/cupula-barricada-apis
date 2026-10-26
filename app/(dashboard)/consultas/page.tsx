import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { LogResult } from "@/app/components/catalog/log-result";
import { PageFallback } from "@/app/components/dashboard-shell";
import { formatWhen } from "@/lib/catalog";
import { requirePage } from "@/lib/dal";
import { listPassages, type Passage, type PassageColumn } from "@/lib/passages";

export const metadata: Metadata = { title: "Consultas" };

const KINDS = [
  { key: "ig", title: "Instagram", empty: "Nenhum Instagram neste período.", anchor: "instagram" },
  { key: "tel", title: "Telefones", empty: "Nenhum telefone neste período.", anchor: "telefones" },
  { key: "ip", title: "IPs", empty: "Nenhum IP neste período.", anchor: "ips" },
] as const;

export default function ConsultasPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  return (
    <Suspense fallback={<PageFallback />}>
      <Consultas searchParams={searchParams} />
    </Suspense>
  );
}

async function Consultas({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requirePage("consultas");
  const params = await searchParams;
  const read = (key: string) => {
    const value = params[key];
    return Array.isArray(value) ? value[0] ?? "" : value ?? "";
  };
  const report = await listPassages({ from: read("de"), to: read("ate"), q: read("q") });
  const tables = {
    ig: report.instagram,
    tel: report.telefone,
    ip: report.ip,
  };

  return (
    <div className="flex flex-col gap-4">
      <form className="grid gap-3 rounded-[14px] border border-line bg-card p-4 md:grid-cols-4">
        <input
          type="search"
          name="q"
          defaultValue={read("q")}
          placeholder="Instagram, telefone ou IP"
          className="rounded-[12px] border border-line bg-background px-3 py-2 text-sm md:col-span-2"
        />
        <input type="date" name="de" defaultValue={read("de") || report.from} className="rounded-[12px] border border-line bg-background px-3 py-2 text-sm" />
        <input type="date" name="ate" defaultValue={read("ate") || report.to} className="rounded-[12px] border border-line bg-background px-3 py-2 text-sm" />
        <button type="submit" className="rounded-[12px] bg-accent px-4 py-2 text-sm font-medium text-accent-foreground md:col-span-4 md:w-fit">
          Filtrar
        </button>
      </form>
      <p className="text-sm text-muted">
        Cada coluna é uma barricada, e dentro dela ficam as rotas usadas por aquele Instagram, telefone ou IP. Ativadas conta as barricadas que chegaram a ser chamadas. Recusa antes da API não entra.
      </p>
      <nav className="flex flex-wrap gap-2 text-sm">
        {KINDS.map((kind) => (
          <a key={kind.anchor} href={`#${kind.anchor}`} className="rounded-[12px] border border-line bg-card px-3 py-2 text-foreground">
            {kind.title}
            <span className="ml-2 text-muted">{tables[kind.key].length}</span>
          </a>
        ))}
      </nav>
      {KINDS.map((kind) => {
        const page = Math.max(1, Number(read(kind.key)) || 1);
        return (
          <PassageTable
            key={kind.key}
            id={kind.anchor}
            title={kind.title}
            empty={kind.empty}
            rows={tables[kind.key]}
            columns={report.columns[kind.key === "ig" ? "instagram" : kind.key === "tel" ? "telefone" : "ip"]}
            page={page}
            pageSize={report.pageSize}
            hrefFor={(next) => pageHref(read, kind.key, next)}
          />
        );
      })}
    </div>
  );
}

function PassageTable({
  id,
  title,
  empty,
  rows,
  columns,
  page,
  pageSize,
  hrefFor,
}: {
  id: string;
  title: string;
  empty: string;
  rows: Passage[];
  columns: PassageColumn[];
  page: number;
  pageSize: number;
  hrefFor: (page: number) => string;
}) {
  const pages = Math.max(1, Math.ceil(rows.length / pageSize));
  const current = Math.min(page, pages);
  const visible = rows.slice((current - 1) * pageSize, current * pageSize);

  return (
    <section id={id} className="scroll-mt-24">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="text-base font-semibold text-foreground">{title}</h2>
        <p className="text-sm text-muted">{rows.length === 1 ? "1 registro" : `${rows.length} registros`}</p>
      </div>
      <div className="overflow-x-auto rounded-[14px] border border-line bg-card">
        <table className="w-full min-w-[760px] text-left text-sm">
          <thead className="text-xs tracking-wide text-muted uppercase">
            <tr>
              <th className="min-w-36 px-4 py-3 font-medium">{title === "Instagram" ? "Instagram" : title === "Telefones" ? "Telefone" : "IP"}</th>
              <th className="px-4 py-3 font-medium whitespace-nowrap">Ativadas</th>
              {columns.map((column) => (
                <th key={column.key} className="min-w-44 px-4 py-3 font-medium normal-case">{column.label}</th>
              ))}
              <th className="px-4 py-3 font-medium">Status final</th>
              <th className="px-4 py-3 font-medium">Quando</th>
            </tr>
          </thead>
          <tbody>
            {visible.length === 0 ? (
              <tr><td colSpan={4 + columns.length} className="px-4 py-8 text-muted">{empty}</td></tr>
            ) : visible.map((row) => (
              <tr key={row.alvo} className="border-t border-line align-top">
                <td className="min-w-36 px-4 py-3 text-foreground">
                  <div className="font-medium break-all">{row.alvo}</div>
                  <div className="mt-1 text-xs text-muted">{row.calls === 1 ? "1 chamada" : `${row.calls} chamadas`}</div>
                </td>
                <td className="px-4 py-3 whitespace-nowrap text-foreground">
                  <span className="text-base font-semibold">{row.activated}</span>
                  <span className="mt-1 block text-xs text-muted">{row.activated === 1 ? "barricada" : "barricadas"}</span>
                </td>
                {columns.map((column) => {
                  const routes = row.routes[column.key] ?? [];
                  return (
                    <td key={column.key} className="px-4 py-3">
                      {routes.length === 0 ? <span className="text-muted">—</span> : (
                        <ul className="flex flex-col gap-2">
                          {routes.map((route) => (
                            <li key={route.key} className="flex flex-wrap items-center gap-2">
                              {route.label ? <span className="text-foreground">{route.label}</span> : null}
                              <LogResult outcome={route.outcome} failure={route.failure} />
                            </li>
                          ))}
                        </ul>
                      )}
                    </td>
                  );
                })}
                <td className="px-4 py-3"><LogResult outcome={row.finalOutcome} failure={row.finalFailure} /></td>
                <td className="px-4 py-3 whitespace-nowrap text-muted">{formatWhen(row.lastAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt-3 flex items-center justify-end gap-3 text-sm text-muted">
        {current > 1 ? <Link href={hrefFor(current - 1)} className="text-accent">Anterior</Link> : null}
        <span>{current} / {pages}</span>
        {current < pages ? <Link href={hrefFor(current + 1)} className="text-accent">Próxima</Link> : null}
      </div>
    </section>
  );
}

function pageHref(read: (key: string) => string, key: string, page: number) {
  const params = new URLSearchParams();
  for (const name of ["q", "de", "ate", "ig", "tel", "ip"]) {
    const value = name === key ? String(page) : read(name);
    if (value && value !== "1") params.set(name, value);
  }
  const text = params.toString();
  return text ? `/consultas?${text}#${key === "ig" ? "instagram" : key === "tel" ? "telefones" : "ips"}` : `/consultas#${key === "ig" ? "instagram" : key === "tel" ? "telefones" : "ips"}`;
}
