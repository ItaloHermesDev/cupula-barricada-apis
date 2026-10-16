import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ApiCompareCharts } from "@/app/components/catalog/api-compare";
import { PageFallback } from "@/app/components/dashboard-shell";
import { dayKey, formatWhen } from "@/lib/catalog";
import { requirePage } from "@/lib/dal";
import { performanceReport, type BarricadeSpend, type DaySpend } from "@/lib/stats";

export const metadata: Metadata = { title: "Painel" };

export default function PainelPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  return (
    <Suspense fallback={<PageFallback />}>
      <Painel searchParams={searchParams} />
    </Suspense>
  );
}

async function Painel({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requirePage("painel");
  const params = await searchParams;
  const read = (key: string) => {
    const value = params[key];
    return Array.isArray(value) ? value[0] ?? "" : value ?? "";
  };
  const requestedId = Number(read("barricada"));
  const report = await performanceReport({
    barricadeId: Number.isInteger(requestedId) && requestedId > 0 ? requestedId : undefined,
    from: read("de"),
    to: read("ate"),
  });
  const period = report.singleDay ? formatDay(report.from) : `${formatDay(report.from)} a ${formatDay(report.to)}`;
  const week = shiftDay(report.today, -6);
  const fortnight = shiftDay(report.today, -13);

  return (
    <div className="flex flex-col gap-5">
      <form action="/painel" className="grid gap-3 rounded-[18px] border border-line bg-card/90 p-4 md:grid-cols-[minmax(0,1.4fr)_160px_160px_auto] md:items-end">
        <label className="block">
          <span className="mb-1 block text-xs text-muted">Barricada</span>
          <select name="barricada" defaultValue={report.focusedId ?? ""} className="w-full rounded-[12px] border border-line bg-background px-3 py-2 text-sm">
            <option value="">Todas as barricadas</option>
            {report.barricades.map((item) => (
              <option key={item.id} value={item.id}>{item.name}</option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="mb-1 block text-xs text-muted">De</span>
          <input type="date" name="de" defaultValue={report.from} max={report.today} className="w-full rounded-[12px] border border-line bg-background px-3 py-2 text-sm" />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs text-muted">Até</span>
          <input type="date" name="ate" defaultValue={report.to} max={report.today} className="w-full rounded-[12px] border border-line bg-background px-3 py-2 text-sm" />
        </label>
        <button type="submit" className="rounded-full bg-gradient-to-r from-[#7A45FF] to-[#D24BFF] px-4 py-2 text-sm font-medium text-white">Filtrar</button>
      </form>
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <PeriodLink href={panelHref(report.focusedId, report.today, report.today)} active={report.from === report.today && report.to === report.today}>Hoje</PeriodLink>
        <PeriodLink href={panelHref(report.focusedId, week, report.today)} active={report.from === week && report.to === report.today}>7 dias</PeriodLink>
        <PeriodLink href={panelHref(report.focusedId, fortnight, report.today)} active={report.from === fortnight && report.to === report.today}>14 dias</PeriodLink>
        <p className="text-muted">{report.focusedName ?? "Todas as barricadas"} · {period}</p>
      </div>
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Metric
          label={report.singleDay ? "Cota do dia" : "Uso real"}
          value={report.singleDay ? (report.quotaPct == null ? String(report.real) : `${report.quotaPct}%`) : String(report.real)}
          hint={
            report.singleDay
              ? report.quotaLimit > 0
                ? `${report.quotaUsed} de ${report.quotaLimit} chamadas reais`
                : "Sem limite diário"
              : report.focusedName && report.quotaLimit > 0
                ? `Limite diário ${report.quotaLimit} · maior dia ${report.peak}`
                : "Soma das barricadas no período"
          }
          tone="accent"
        />
        <Metric
          label="Gasto na API"
          value={String(report.upstream)}
          hint={`${report.real} uso real · ${report.checks} verificações`}
          tone="violet"
        />
        <Metric
          label={report.singleDay ? "Sucesso do dia" : "Sucesso no período"}
          value={report.successRate == null ? "—" : `${report.successRate}%`}
          hint={report.calls > 0 ? `${report.success} de ${report.calls} chamadas reais · ${report.fallback} fallback` : "Nenhuma chamada real no período"}
          tone="success"
        />
        <Metric
          label="Resposta"
          value={report.latency == null ? "—" : `${report.latency} ms`}
          hint={
            report.latency == null
              ? "Sem amostra de tempo no período"
              : report.samples < 5
                ? `${report.samples} ${report.samples === 1 ? "chamada real medida" : "chamadas reais medidas"}`
                : `95% das chamadas reais até ${report.p95} ms`
          }
          tone="warning"
        />
      </section>

      <section className="grid gap-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(260px,0.8fr)]">
        <article className="rounded-[18px] border border-line bg-card/90 p-5">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="text-sm font-medium">{report.focusedName ?? "Todas as barricadas"}</h2>
              <p className="mt-1 text-xs text-muted">
                {report.periodReal} uso real · {report.periodChecks} verificações
              </p>
            </div>
            <div className="flex gap-3 text-xs text-muted">
              <span className="inline-flex items-center gap-1.5"><i className="h-2 w-2 rounded-full bg-accent" /> Uso real</span>
              <span className="inline-flex items-center gap-1.5"><i className="h-2 w-2 rounded-full bg-violet" /> Verificação</span>
            </div>
          </div>
          <UsageChart days={report.series} />
        </article>
        <article className="rounded-[18px] border border-line bg-card/90 p-5">
          <h2 className="text-sm font-medium">O que conta como gasto</h2>
          <ul className="mt-4 space-y-3 text-sm">
            <SpendLine label="Uso real" value={report.real} detail="Entra na cota e chama a API." />
            <SpendLine label="Verificação" value={report.checks} detail="Chama a API e não entra na cota." />
            <SpendLine label="Rejeitada" value={report.rejected} detail="Não chama a API." />
            <SpendLine label="Fallback" value={report.fallback} detail="A alternativa também consome a cota dela." />
          </ul>
        </article>
      </section>

      <ApiCompareCharts apis={report.apis} period={period} />

      <article className="overflow-hidden rounded-[18px] border border-line bg-card/90">
        <div className="flex items-center justify-between gap-3 px-5 py-4">
          <h2 className="text-sm font-medium">Por barricada</h2>
          <Link href="/barricadas" className="text-sm text-accent">Abrir barricadas</Link>
        </div>
        {report.barricades.length === 0 ? (
          <p className="px-5 pb-5 text-sm text-muted">Cadastre uma barricada para acompanhar desempenho e gasto.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead className="text-xs text-muted">
                <tr className="border-t border-line">
                  <th className="px-5 py-3 font-medium">Barricada</th>
                  <th className="px-3 py-3 font-medium">{report.singleDay ? "Cota do dia" : "Cota diária"}</th>
                  <th className="px-3 py-3 font-medium">Uso real</th>
                  <th className="px-3 py-3 font-medium">Verificações</th>
                  <th className="px-3 py-3 font-medium">Resposta</th>
                  <th className="px-3 py-3 font-medium">Sucesso</th>
                  <th className="px-5 py-3 font-medium">Situação</th>
                </tr>
              </thead>
              <tbody>
                {report.barricades.map((item) => (
                  <BarricadeRow key={item.id} item={item} from={report.from} to={report.to} singleDay={report.singleDay} focused={item.id === report.focusedId} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </article>

      <article className="rounded-[18px] border border-line bg-card/90 p-5">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-sm font-medium">Falhas no período</h2>
          <Link href={historyHref(report.focusedId, report.from, report.to)} className="text-sm text-accent">Abrir histórico</Link>
        </div>
        {report.failures.length === 0 ? (
          <p className="mt-3 text-sm text-muted">Sem falhas nesse período.</p>
        ) : (
          <ul className="mt-3 space-y-3 text-sm">
            {report.failures.map((item) => (
              <li key={item.id} className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="text-foreground">{item.barricade_name} · {item.outcome}</span>
                <span className="text-xs text-muted">{formatWhen(item.created_at)} · {item.failure_reason || "sem detalhe"}</span>
              </li>
            ))}
          </ul>
        )}
      </article>
    </div>
  );
}

function Metric({ label, value, hint, tone }: { label: string; value: string; hint: string; tone: "accent" | "violet" | "success" | "warning" }) {
  const glow = {
    accent: "shadow-[0_0_24px_rgba(0,229,255,0.08)]",
    violet: "shadow-[0_0_24px_rgba(155,92,255,0.12)]",
    success: "shadow-[0_0_24px_rgba(0,229,160,0.08)]",
    warning: "shadow-[0_0_24px_rgba(255,181,71,0.08)]",
  }[tone];
  return (
    <article className={`kpi-card rounded-[18px] border border-line bg-card/90 p-4 ${glow}`}>
      <p className="text-xs text-muted">{label}</p>
      <p className="glow-value mt-2 text-2xl font-semibold">{value}</p>
      <p className="mt-2 text-xs leading-5 text-muted">{hint}</p>
    </article>
  );
}

function SpendLine({ label, value, detail }: { label: string; value: number; detail: string }) {
  return (
    <li className="rounded-[12px] border border-line bg-black/20 px-3 py-2.5">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-foreground">{label}</span>
        <span className="font-medium">{value}</span>
      </div>
      <p className="mt-1 text-xs text-muted">{detail}</p>
    </li>
  );
}

function UsageChart({ days }: { days: DaySpend[] }) {
  const peak = Math.max(1, ...days.flatMap((day) => [day.real, day.checks]));
  const step = days.length > 20 ? Math.ceil(days.length / 10) : 1;
  return (
    <div className="mt-5 flex items-end gap-1 sm:gap-1.5">
      {days.map((day, index) => (
        <div key={day.day} className="flex min-w-0 flex-1 flex-col items-center gap-2">
          <div
            className="flex h-32 w-full items-end justify-center gap-0.5"
            role="img"
            aria-label={`${day.label}: ${day.real} uso real, ${day.checks} verificações`}
          >
            <span className="w-[42%] rounded-t-[4px] bg-accent" style={{ height: barHeight(day.real, peak) }} />
            <span className="w-[42%] rounded-t-[4px] bg-violet" style={{ height: barHeight(day.checks, peak) }} />
          </div>
          <span className="text-[10px] text-muted">{index % step === 0 || index === days.length - 1 ? day.label : ""}</span>
        </div>
      ))}
    </div>
  );
}

function barHeight(value: number, peak: number) {
  if (value <= 0) return "0%";
  return `${Math.max(8, Math.round((value / peak) * 100))}%`;
}

function BarricadeRow({
  item,
  from,
  to,
  singleDay,
  focused,
}: {
  item: BarricadeSpend;
  from: string;
  to: string;
  singleDay: boolean;
  focused: boolean;
}) {
  const status = statusOf(item);
  const used = singleDay ? item.executed : item.peak;
  const percent = item.dailyLimit > 0 ? Math.min(100, Math.round((used / item.dailyLimit) * 100)) : 0;
  const bar = percent >= 100 ? "bg-danger" : percent >= 80 ? "bg-warning" : "bg-accent";
  const rate = item.calls > 0 ? `${Math.round((item.success / item.calls) * 1000) / 10}%` : "—";
  return (
    <tr className={`border-t border-line ${focused ? "bg-accent/5" : ""}`}>
      <td className="px-5 py-3">
        <Link href={focused ? `/barricadas/${item.id}` : panelHref(item.id, from, to)} className="font-medium text-foreground hover:text-accent">{item.name}</Link>
        <Link href={focused ? panelHref(null, from, to) : `/barricadas/${item.id}`} className="mt-0.5 block text-xs text-muted hover:text-accent">
          {focused ? "Ver todas" : "Abrir"}
        </Link>
      </td>
      <td className="px-3 py-3">
        {item.dailyLimit > 0 ? (
          <div className="w-32">
            <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
              <div className={`h-full rounded-full ${bar}`} style={{ width: `${percent}%` }} />
            </div>
            <p className="mt-1 text-xs text-muted">
              {singleDay ? `${item.executed} / ${item.dailyLimit}` : `maior dia ${item.peak} / ${item.dailyLimit}`}
            </p>
          </div>
        ) : (
          <span className="text-xs text-muted">Sem limite</span>
        )}
      </td>
      <td className="px-3 py-3">{item.executed}</td>
      <td className="px-3 py-3 text-muted">{item.checks}</td>
      <td className="px-3 py-3">{item.latencyMs == null ? "—" : `${item.latencyMs} ms`}</td>
      <td className="px-3 py-3">{rate}</td>
      <td className="px-5 py-3">
        <span className="inline-flex items-center gap-2">
          <span className={`h-2 w-2 rounded-full ${status.dot}`} />
          {status.label}
        </span>
      </td>
    </tr>
  );
}

function PeriodLink({ href, active, children }: { href: string; active: boolean; children: string }) {
  return (
    <Link href={href} className={`rounded-full border px-3 py-1 ${active ? "border-accent/50 bg-accent/10 text-accent" : "border-line text-muted hover:text-foreground"}`} aria-current={active ? "page" : undefined}>
      {children}
    </Link>
  );
}

function panelHref(barricadeId: number | null, from: string, to: string) {
  const params = new URLSearchParams({ de: from, ate: to });
  if (barricadeId) params.set("barricada", String(barricadeId));
  return `/painel?${params.toString()}`;
}

function historyHref(barricadeId: number | null, from: string, to: string) {
  const params = new URLSearchParams({ de: from, ate: to });
  if (barricadeId) params.set("barricada", String(barricadeId));
  return `/historico?${params.toString()}`;
}

function formatDay(day: string) {
  return `${day.slice(8, 10)}/${day.slice(5, 7)}/${day.slice(0, 4)}`;
}

function shiftDay(day: string, delta: number) {
  const [year, month, date] = day.split("-").map(Number);
  return dayKey(new Date(Date.UTC(year, month - 1, date + delta, 15)));
}

function statusOf(item: BarricadeSpend) {
  if (!item.active) return { label: "Inativa", dot: "bg-muted" };
  if (!item.healthEnabled) return { label: "Verificação desligada", dot: "bg-success" };
  if (item.healthOk === null) return { label: "Aguardando", dot: "bg-warning" };
  if (item.healthOk) return { label: "Funcionando", dot: "bg-success" };
  return { label: "Com falha", dot: "bg-danger" };
}
