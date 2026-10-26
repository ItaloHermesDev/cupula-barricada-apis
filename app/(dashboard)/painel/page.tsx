import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ApiCompareCharts } from "@/app/components/catalog/api-compare";
import { PageFallback } from "@/app/components/dashboard-shell";
import { Icon, type IconName } from "@/app/components/icons";
import { LogResult } from "@/app/components/catalog/log-result";
import { dayKey, formatWhen } from "@/lib/catalog";
import { logDetail } from "@/lib/log-read";
import { requirePage } from "@/lib/dal";
import { performanceReport, type BarricadeSpend } from "@/lib/stats";

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
      <section className="grid gap-3 sm:grid-cols-3">
        <BotCard
          title="Instagram"
          period={period}
          success={report.bots.sucessoInstagram}
          failure={report.bots.falhaInstagram}
        />
        <BotCard
          title="WhatsApp"
          period={period}
          success={report.bots.sucessoWhatsapp}
          failure={report.bots.falhaWhatsapp}
        />
        <Metric
          icon="monitor"
          tone="success"
          label="Da barricada"
          value={String(report.shownBarricade)}
          hint="Vezes em que o dado exibido veio da barricada."
        />
        <Metric
          icon="direct"
          tone="warning"
          label="Chamada direta"
          value={String(report.shownExternal)}
          hint="Vezes em que o dado exibido veio de uma chamada direta."
        />
        <Metric
          icon="alert"
          tone="danger"
          label="Falha total"
          value={String(report.shownFailure)}
          hint="Vezes em que nem a barricada nem a chamada direta entregaram o dado."
        />
        <Metric
          icon="activity"
          tone="accent"
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
        />
        <Metric
          icon="reports"
          tone="danger"
          label="Gasto na API"
          value={String(report.upstream)}
          hint={`${report.real} uso real · ${report.checks} verificações`}
        />
        <Metric
          icon="analytics"
          tone="warning"
          label="Assinaturas"
          value={report.subscriptionSpend == null ? "—" : money(report.subscriptionSpend)}
          hint={report.focusedName ? "Gasto desta barricada no período" : "Soma das rotas com valor e tokens no período"}
        />
        <Metric
          icon="check"
          tone="success"
          label={report.singleDay ? "Sucesso do dia" : "Sucesso no período"}
          value={report.successRate == null ? "—" : `${report.successRate}%`}
          hint={report.calls > 0 ? `${report.success} de ${report.calls} chamadas reais · ${report.fallback} fallback` : "Nenhuma chamada real no período"}
        />
      </section>
      <form action="/painel" className="grid gap-3 rounded-[14px] border border-line bg-card p-4 md:grid-cols-[minmax(0,1.4fr)_160px_160px_auto] md:items-end">
        <label className="block">
          <span className="mb-1 block text-xs text-muted">Barricada</span>
          <select name="barricada" defaultValue={report.focusedId ?? ""} className={controlClass}>
            <option value="">Todas as barricadas</option>
            {report.barricades.map((item) => (
              <option key={item.id} value={item.id}>{item.name}</option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="mb-1 block text-xs text-muted">De</span>
          <input type="date" name="de" defaultValue={report.from} max={report.today} className={controlClass} />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs text-muted">Até</span>
          <input type="date" name="ate" defaultValue={report.to} max={report.today} className={controlClass} />
        </label>
        <button type="submit" className="rounded-[12px] bg-accent px-4 py-2 text-sm font-medium text-accent-foreground">Filtrar</button>
      </form>
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <PeriodLink href={panelHref(report.focusedId, report.today, report.today)} active={report.from === report.today && report.to === report.today}>Hoje</PeriodLink>
        <PeriodLink href={panelHref(report.focusedId, week, report.today)} active={report.from === week && report.to === report.today}>7 dias</PeriodLink>
        <PeriodLink href={panelHref(report.focusedId, fortnight, report.today)} active={report.from === fortnight && report.to === report.today}>14 dias</PeriodLink>
        <p className="text-muted">{report.focusedName ?? "Todas as barricadas"} · {period}</p>
      </div>

      <article className="rounded-[14px] border border-line bg-card p-5">
        <h2 className="text-sm font-medium">Origem dos dados exibidos</h2>
        <p className="mt-1 text-xs text-muted">O que o solicitante registrou entre {period}. Barricada é o dado que veio dela. Chamada direta é o que precisou ser buscado fora. Falha total é quando nenhum dos dois entregou.</p>
        <ul className="mt-4 grid gap-3 text-sm sm:grid-cols-3">
          <SpendLine label="Barricada" value={report.shownBarricade} detail="Os dados mostrados vieram da barricada." />
          <SpendLine label="Chamada direta" value={report.shownExternal} detail="O solicitante usou uma chamada direta." />
          <SpendLine label="Falha total" value={report.shownFailure} detail="Nem a barricada nem a chamada direta entregaram o dado." />
        </ul>
        {report.shownBarricade + report.shownExternal + report.shownFailure === 0 ? (
          <p className="mt-4 text-sm text-muted">Nenhum relato nesse período.</p>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[520px] text-left text-sm">
              <thead className="text-xs text-muted">
                <tr className="border-t border-line">
                  <th className="py-3 pr-3 font-medium">Barricada</th>
                  <th className="px-3 py-3 font-medium">Da barricada</th>
                  <th className="px-3 py-3 font-medium">Chamada direta</th>
                  <th className="py-3 pl-3 font-medium">Falha total</th>
                </tr>
              </thead>
              <tbody>
                {report.barricades.filter((item) => (report.focusedId == null || item.id === report.focusedId) && item.shownBarricade + item.shownExternal + item.shownFailure > 0).map((item) => (
                  <tr key={item.id} className="border-t border-line">
                    <td className="py-3 pr-3 font-medium text-foreground">{item.name}</td>
                    <td className="px-3 py-3">{item.shownBarricade}</td>
                    <td className="px-3 py-3">{item.shownExternal}</td>
                    <td className="py-3 pl-3">{item.shownFailure}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </article>

      <section className="grid min-w-0 gap-4">
        <SpendChart items={report.barricades} period={period} focusedId={report.focusedId} />
        <ErrorChart items={report.barricades} period={period} focusedId={report.focusedId} />
      </section>

      <article className="rounded-[14px] border border-line bg-card p-5">
        <h2 className="text-sm font-medium">O que conta como gasto</h2>
        <ul className="mt-4 grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
          <SpendLine label="Uso real" value={report.real} detail="Entra na cota e chama a API." />
          <SpendLine label="Verificação" value={report.checks} detail="Chama a API e não entra na cota." />
          <SpendLine label="Rejeitada" value={report.rejected} detail="Não chama a API." />
          <SpendLine label="Fallback" value={report.fallback} detail="A alternativa também consome a cota dela." />
        </ul>
      </article>

      <ApiCompareCharts apis={report.apis} period={period} />

      <article className="overflow-hidden rounded-[14px] border border-line bg-card">
        <div className="px-5 py-4">
          <h2 className="text-sm font-medium">Gasto por assinatura</h2>
          <p className="mt-1 text-xs text-muted">
            Valor mensal ÷ tokens do mês × chamadas reais da rota entre {period}. O mesmo nome soma rotas de barricadas diferentes.
          </p>
        </div>
        {report.subscriptions.length === 0 ? (
          <p className="px-5 pb-5 text-sm text-muted">Nenhuma rota tem nome, valor mensal e tokens do mês preenchidos.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead className="text-xs text-muted">
                <tr className="border-t border-line">
                  <th className="px-5 py-3 font-medium">Assinatura</th>
                  <th className="px-3 py-3 font-medium">Valor mensal</th>
                  <th className="px-3 py-3 font-medium">Tokens do mês</th>
                  <th className="px-3 py-3 font-medium">Chamadas</th>
                  <th className="px-5 py-3 font-medium">Gasto</th>
                </tr>
              </thead>
              <tbody>
                {report.subscriptions.map((item) => (
                  <tr key={item.name} className="border-t border-line">
                    <td className="px-5 py-3">
                      <p className="font-medium text-foreground">{item.name}</p>
                      <p className="mt-1 text-xs text-muted">{item.routes.map((route) => `${route.barricadeName} · ${route.apiName} · ${route.calls}`).join(" · ")}</p>
                    </td>
                    <td className="px-3 py-3">{item.mixedPrice ? "valores diferentes" : item.price == null ? "—" : money(item.price)}</td>
                    <td className="px-3 py-3">{item.mixedTokens ? "cotas diferentes" : item.tokens ?? "—"}</td>
                    <td className="px-3 py-3">{item.calls}</td>
                    <td className="px-5 py-3">{money(item.spend)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </article>

      <article className="overflow-hidden rounded-[14px] border border-line bg-card">
        <div className="flex items-center justify-between gap-3 px-5 py-4">
          <h2 className="text-sm font-medium">Por barricada</h2>
          <Link href="/barricadas" className="text-sm text-accent">Abrir barricadas</Link>
        </div>
        {report.barricades.length === 0 ? (
          <p className="px-5 pb-5 text-sm text-muted">Cadastre uma barricada para acompanhar desempenho e gasto.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[980px] text-left text-sm">
              <thead className="text-xs text-muted">
                <tr className="border-t border-line">
                  <th className="px-5 py-3 font-medium">Barricada</th>
                  <th className="px-3 py-3 font-medium">{report.singleDay ? "Cota do dia" : "Cota diária"}</th>
                  <th className="px-3 py-3 font-medium">Uso real</th>
                  <th className="px-3 py-3 font-medium">Verificações</th>
                  <th className="px-3 py-3 font-medium">Resposta</th>
                  <th className="px-3 py-3 font-medium">Sucesso</th>
                  <th className="px-3 py-3 font-medium">Gasto</th>
                  <th className="px-3 py-3 font-medium">Da barricada</th>
                  <th className="px-3 py-3 font-medium">Chamada direta</th>
                  <th className="px-3 py-3 font-medium">Falha total</th>
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

      <article className="rounded-[14px] border border-line bg-card p-5">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-sm font-medium">Falhas no período</h2>
          <Link href={historyHref(report.focusedId, report.from, report.to)} className="text-sm text-accent">Abrir histórico</Link>
        </div>
        {report.failures.length === 0 ? (
          <p className="mt-3 text-sm text-muted">Sem falhas nesse período.</p>
        ) : (
          <ul className="mt-3 space-y-3 text-sm">
            {report.failures.map((item) => (
              <li key={item.id} className="flex flex-col gap-1 border-t border-line pt-3 first:border-t-0 first:pt-0">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-foreground">{item.barricade_name}</span>
                  <LogResult outcome={item.outcome} failure={item.failure_reason} />
                </div>
                <p className="text-xs leading-5 break-words text-muted">{formatWhen(item.created_at)} · {logDetail(item)}</p>
              </li>
            ))}
          </ul>
        )}
      </article>
    </div>
  );
}

const controlClass =
  "w-full rounded-[12px] border border-line bg-field px-3 py-2 text-sm text-foreground outline-none focus:border-accent";

function Metric({
  icon,
  tone,
  label,
  value,
  hint,
}: {
  icon: IconName;
  tone: "accent" | "success" | "warning" | "danger";
  label: string;
  value: string;
  hint: string;
}) {
  const toneClass = {
    accent: "text-accent",
    success: "text-success",
    warning: "text-warning",
    danger: "text-danger",
  }[tone];

  return (
    <article className="kpi-card flex h-full min-h-[180px] flex-col rounded-[14px] border border-line bg-card p-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs text-muted">{label}</p>
        <span className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] border border-line bg-field ${toneClass}`}>
          <Icon name={icon} />
        </span>
      </div>
      <p className="mt-3 text-2xl font-semibold tracking-tight">{value}</p>
      <p className="mt-auto pt-2 text-xs leading-5 text-muted">{hint}</p>
    </article>
  );
}

function BotCard({ title, period, success, failure }: { title: string; period: string; success: number; failure: number }) {
  return (
    <article className="kpi-card flex h-full min-h-[180px] flex-col rounded-[14px] border border-line bg-card p-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-medium">BOT - {title}</h2>
        <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] border border-line bg-field text-accent">
          <Icon name="robot" />
        </span>
      </div>
      <p className="mt-1 text-xs text-muted">Sucessos e falhas entre {period}.</p>
      <dl className="mt-auto grid grid-cols-2 gap-3 pt-3">
        <div>
          <dt className="text-xs text-muted">Sucessos</dt>
          <dd className="mt-1 text-2xl font-semibold tracking-tight text-success">{success}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted">Falhas</dt>
          <dd className="mt-1 text-2xl font-semibold tracking-tight text-danger">{failure}</dd>
        </div>
      </dl>
    </article>
  );
}

function SpendLine({ label, value, detail }: { label: string; value: number; detail: string }) {
  return (
    <li className="rounded-[12px] border border-line bg-field px-3 py-2.5">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-foreground">{label}</span>
        <span className="font-medium">{value}</span>
      </div>
      <p className="mt-1 text-xs text-muted">{detail}</p>
    </li>
  );
}

function SpendChart({ items, period, focusedId }: { items: BarricadeSpend[]; period: string; focusedId: number | null }) {
  const ranked = [...items].sort((left, right) => (right.spend ?? -1) - (left.spend ?? -1) || left.name.localeCompare(right.name, "pt", { sensitivity: "base" }));
  const peak = Math.max(0, ...ranked.map((item) => item.spend ?? 0));
  return (
    <article className="min-w-0 overflow-hidden rounded-[14px] border border-line bg-card p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-medium">Gasto por barricada</h2>
          <p className="mt-1 text-xs text-muted">Valor da assinatura entre {period}. A coluna maior é a barricada que mais gastou.</p>
        </div>
        <p className="inline-flex items-center gap-2 text-xs text-muted">
          <span className="h-2 w-2 rounded-full bg-accent" />
          Valor gasto
        </p>
      </div>
      {peak <= 0 ? (
        <p className="mt-4 text-sm text-muted">Nenhuma barricada tem valor mensal e tokens do mês preenchidos.</p>
      ) : (
        <ColumnChart
          label="Gasto por barricada"
          peak={peak}
          columns={ranked.map((item) => ({
            id: item.id,
            name: item.name,
            value: item.spend ?? 0,
            caption: item.spend == null ? "—" : money(item.spend),
            detail: item.spend == null ? `${item.name}: sem valor de assinatura` : `${item.name}: ${money(item.spend)}`,
            color: "var(--accent)",
            focused: item.id === focusedId,
          }))}
        />
      )}
    </article>
  );
}

function ErrorChart({ items, period, focusedId }: { items: BarricadeSpend[]; period: string; focusedId: number | null }) {
  const ranked = [...items].sort((left, right) => {
    const leftRate = errorRate(left);
    const rightRate = errorRate(right);
    if (leftRate == null && rightRate == null) return left.name.localeCompare(right.name, "pt", { sensitivity: "base" });
    if (leftRate == null) return 1;
    if (rightRate == null) return -1;
    return rightRate - leftRate || left.name.localeCompare(right.name, "pt", { sensitivity: "base" });
  });
  return (
    <article className="min-w-0 overflow-hidden rounded-[14px] border border-line bg-card p-5">
      <h2 className="text-sm font-medium">Taxa de erro por barricada</h2>
      <p className="mt-1 text-xs text-muted">Falhas entre as chamadas reais de {period}. A escala vai até 100%.</p>
      <ColumnChart
        label="Taxa de erro por barricada"
        peak={100}
        columns={ranked.map((item) => {
          const rate = errorRate(item);
          return {
            id: item.id,
            name: item.name,
            value: rate ?? 0,
            caption: rate == null ? "—" : `${rate}%`,
            detail: rate == null ? `${item.name}: sem chamadas reais` : `${item.name}: ${rate}% · ${item.calls - item.success} de ${item.calls}`,
            color: rate == null ? "rgba(135,149,170,0.35)" : rate >= 20 ? "var(--danger)" : rate > 0 ? "var(--warning)" : "var(--success)",
            focused: item.id === focusedId,
          };
        })}
      />
    </article>
  );
}

function ColumnChart({
  label,
  peak,
  columns,
}: {
  label: string;
  peak: number;
  columns: { id: number; name: string; value: number; caption: string; detail: string; color: string; focused: boolean }[];
}) {
  const slot = 86;
  const width = Math.max(columns.length * slot + 28, slot);
  const height = 268;
  const pad = { top: 22, bottom: 136 };
  const innerH = height - pad.top - pad.bottom;
  const baseline = pad.top + innerH;
  return (
    <div className="mt-4 w-full overflow-x-auto">
      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="block max-w-none" role="img" aria-label={label}>
        {[0, 0.5, 1].map((step) => {
          const y = baseline - step * innerH;
          return <line key={step} x1="8" x2={width - 8} y1={y} y2={y} stroke="var(--line)" />;
        })}
        {columns.map((column, index) => {
          const x = index * slot + 16;
          const barW = 28;
          const ratio = peak > 0 ? Math.min(1, Math.max(0, column.value / peak)) : 0;
          const barH = ratio <= 0 ? 0 : Math.max(4, ratio * innerH);
          const y = baseline - barH;
          const labelX = x + barW / 2;
          const labelY = baseline + 16;
          return (
            <g key={column.id}>
              <text x={labelX} y={y - 6} textAnchor="middle" fill="var(--muted)" fontSize="10">{column.caption}</text>
              <rect x={x} y={y} width={barW} height={barH} rx="4" fill={column.color} stroke={column.focused ? "var(--foreground)" : "none"} strokeWidth="1.5">
                <title>{column.detail}</title>
              </rect>
              <text x={labelX} y={labelY} fill={column.focused ? "var(--accent)" : "var(--muted)"} fontSize="11" transform={`rotate(58 ${labelX} ${labelY})`}>
                {axisLabel(column.name)}
                <title>{column.name}</title>
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

function axisLabel(name: string) {
  const split = name.split(" · ");
  const label = split.length === 1 ? name : `${split[0].split(" ")[0]} · ${split.slice(1).join(" · ")}`;
  return label.length > 18 ? `${label.slice(0, 17)}…` : label;
}

function errorRate(item: BarricadeSpend) {
  if (item.calls <= 0) return null;
  return Math.round(((item.calls - item.success) / item.calls) * 1000) / 10;
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
      <td className="px-3 py-3">{item.spend == null ? "—" : money(item.spend)}</td>
      <td className="px-3 py-3">{item.shownBarricade}</td>
      <td className="px-3 py-3">{item.shownExternal}</td>
      <td className="px-3 py-3">{item.shownFailure}</td>
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
    <Link href={href} className={`rounded-[10px] border px-3 py-1.5 ${active ? "border-transparent bg-accent text-accent-foreground" : "border-line bg-field text-muted hover:text-foreground"}`} aria-current={active ? "page" : undefined}>
      {children}
    </Link>
  );
}

function money(value: number) {
  const digits = value !== 0 && Math.abs(value) < 0.01 ? 4 : 2;
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 2, maximumFractionDigits: digits });
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
