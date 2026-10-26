"use client";

import { useState, type FormEvent } from "react";
import { generateProfileReport } from "@/app/actions/profile-report";
import { formatWhen } from "@/lib/catalog";

type Report = Awaited<ReturnType<typeof generateProfileReport>>;

export function ProfileReportPanel({ from, to }: { from: string; to: string }) {
  const [start, setStart] = useState(from);
  const [end, setEnd] = useState(to);
  const [report, setReport] = useState<Report | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  async function load(page: number, event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault();
    const range = event || !report ? { from: start, to: end } : { from: report.from, to: report.to };
    setPending(true);
    setError("");
    try {
      setReport(await generateProfileReport({ ...range, page }));
    } catch {
      setError("Não foi possível gerar o relatório.");
    } finally {
      setPending(false);
    }
  }

  return (
    <section className="rounded-[14px] border border-line bg-card p-4">
      <h2 className="text-base font-semibold text-foreground">Relatório de perfil</h2>
      <p className="mt-2 max-w-3xl text-sm leading-6 text-muted">
        Escolha o intervalo. O relatório mostra só os perfis em que a primeira busca, a da foto, falhou. Cada Instagram entra uma vez. Não existe só entra depois que a verificação da página pública confirma, e esse @ fica gravado. As outras porcentagens separam nome inválido e falha das barricadas.
      </p>
      <form className="mt-4 grid gap-3 md:grid-cols-4" onSubmit={(event) => load(1, event)}>
        <label className="text-sm text-foreground">
          De
          <input type="date" value={start} onChange={(event) => setStart(event.target.value)} className="mt-2 w-full rounded-[12px] border border-line bg-background px-3 py-2" />
        </label>
        <label className="text-sm text-foreground">
          Até
          <input type="date" value={end} onChange={(event) => setEnd(event.target.value)} className="mt-2 w-full rounded-[12px] border border-line bg-background px-3 py-2" />
        </label>
        <button type="submit" disabled={pending} className="self-end rounded-[12px] bg-accent px-4 py-2 text-sm font-medium text-accent-foreground disabled:opacity-60 md:col-span-2 md:w-fit">
          {pending ? "Confirmando..." : "Gerar relatório"}
        </button>
      </form>
      {error ? <p className="mt-4 text-sm text-danger">{error}</p> : null}
      {report ? <ProfileReportResult report={report} pending={pending} onPage={(page) => load(page)} /> : null}
    </section>
  );
}

function ProfileReportResult({
  report,
  pending,
  onPage,
}: {
  report: Report;
  pending: boolean;
  onPage: (page: number) => void;
}) {
  return (
    <div className="mt-4 flex flex-col gap-4" aria-busy={pending}>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <article className="rounded-[12px] border border-line bg-background p-4">
          <p className="text-xs tracking-wide text-muted uppercase">Falha na foto</p>
          <p className="mt-2 text-2xl font-semibold text-foreground">{report.total}</p>
          <p className="mt-1 text-xs text-muted">{report.total === 1 ? "1 perfil" : `${report.total} perfis`}</p>
        </article>
        <article className="rounded-[12px] border border-line bg-background p-4">
          <p className="text-xs tracking-wide text-muted uppercase">Não existe</p>
          <p className="mt-2 text-2xl font-semibold text-foreground">{report.missingPercent}</p>
          <p className="mt-1 text-xs text-muted">{report.missing === 1 ? "1 perfil" : `${report.missing} perfis`}</p>
        </article>
        <article className="rounded-[12px] border border-line bg-background p-4">
          <p className="text-xs tracking-wide text-muted uppercase">Nome inválido</p>
          <p className="mt-2 text-2xl font-semibold text-foreground">{report.invalidPercent}</p>
          <p className="mt-1 text-xs text-muted">{report.invalidName === 1 ? "1 perfil" : `${report.invalidName} perfis`}</p>
        </article>
        <article className="rounded-[12px] border border-line bg-background p-4">
          <p className="text-xs tracking-wide text-muted uppercase">Tudo falhou</p>
          <p className="mt-2 text-2xl font-semibold text-foreground">{report.failedPercent}</p>
          <p className="mt-1 text-xs text-muted">{report.failed === 1 ? "1 perfil" : `${report.failed} perfis`}</p>
        </article>
      </div>
      <div className="overflow-x-auto rounded-[12px] border border-line">
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead className="text-xs tracking-wide text-muted uppercase">
            <tr>
              <th className="px-4 py-3 font-medium">Instagram</th>
              <th className="px-4 py-3 font-medium">Classificação</th>
              <th className="px-4 py-3 font-medium">Motivo</th>
              <th className="px-4 py-3 font-medium">Quando</th>
            </tr>
          </thead>
          <tbody>
            {report.rows.length === 0 ? (
              <tr><td colSpan={4} className="px-4 py-8 text-muted">Nenhum perfil falhou na busca da foto nesse intervalo.</td></tr>
            ) : report.rows.map((row) => (
              <tr key={row.id} className="border-t border-line align-top">
                <td className="px-4 py-3 font-medium break-all text-foreground">{row.alvo}</td>
                <td className="px-4 py-3">
                  <span className={`inline-flex rounded-[10px] border px-2 py-1 text-xs font-medium whitespace-nowrap ${row.kind === "falhou" ? "border-danger/40 bg-danger/10 text-danger" : row.kind === "invalido" ? "border-line bg-background text-foreground" : "border-warning/40 bg-warning/10 text-warning"}`}>
                    {row.kind === "falhou" ? "Tudo falhou" : row.kind === "invalido" ? "Nome inválido" : "Não existe"}
                  </span>
                </td>
                <td className="px-4 py-3 text-muted">{row.reason}</td>
                <td className="px-4 py-3 whitespace-nowrap text-muted">{formatWhen(row.createdAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex items-center justify-end gap-3 text-sm text-muted">
        {report.page > 1 ? <button type="button" onClick={() => onPage(report.page - 1)} disabled={pending} className="text-accent disabled:opacity-60">Anterior</button> : null}
        <span>{report.page} / {report.pages}</span>
        {report.page < report.pages ? <button type="button" onClick={() => onPage(report.page + 1)} disabled={pending} className="text-accent disabled:opacity-60">Próxima</button> : null}
      </div>
    </div>
  );
}
