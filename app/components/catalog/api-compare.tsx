import type { ApiCompare } from "@/lib/stats";

const COLORS = ["var(--accent)", "var(--violet)", "var(--success)", "var(--warning)", "var(--danger)"];

export function ApiCompareCharts({ apis, period }: { apis: ApiCompare[]; period: string }) {
  if (apis.length === 0) {
    return (
      <section className="rounded-[18px] border border-line bg-card/90 p-5">
        <h2 className="text-sm font-medium">Consumo entre as APIs</h2>
        <p className="mt-3 text-sm text-muted">Cadastre uma API para comparar o consumo.</p>
      </section>
    );
  }

  const showTrend = apis.some((api) => api.series.length > 1);
  return (
    <section className={`grid gap-4 ${showTrend ? "lg:grid-cols-2" : ""}`}>
      <article className="rounded-[18px] border border-line bg-card/90 p-5">
        <h2 className="text-sm font-medium">Consumo entre as APIs</h2>
        <p className="mt-1 text-xs text-muted">Chamadas no período {period}. A barra maior é a API que mais consumiu.</p>
        <div className="mt-3 flex flex-wrap gap-3 text-xs text-muted">
          <span>Barra colorida: uso real, na cor da API.</span>
          <span className="inline-flex items-center gap-1.5"><i className="h-2 w-2 rounded-full bg-white/40" /> Verificação</span>
        </div>
        <ApiRank apis={apis} />
      </article>
      {showTrend ? (
        <article className="rounded-[18px] border border-line bg-card/90 p-5">
          <h2 className="text-sm font-medium">Uso real por dia</h2>
          <p className="mt-1 text-xs text-muted">Cada cor é uma API. A altura é o número de chamadas reais naquele dia.</p>
          <ApiTrend apis={apis} />
        </article>
      ) : null}
    </section>
  );
}

function ApiRank({ apis }: { apis: ApiCompare[] }) {
  const peak = Math.max(1, ...apis.flatMap((api) => [api.real, api.checks]));
  return (
    <ul className="mt-4 flex flex-col gap-4">
      {apis.map((api, index) => (
        <li key={api.id}>
          <div className="flex items-baseline justify-between gap-3 text-sm">
            <span className="flex min-w-0 items-center gap-2">
              <i className="h-2 w-2 shrink-0 rounded-full" style={{ background: COLORS[index % COLORS.length] }} />
              <span className="truncate text-foreground" title={api.name}>{api.name}</span>
            </span>
            <span className="shrink-0 text-xs text-muted">{api.real} uso real · {api.checks} verificações</span>
          </div>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/10" role="img" aria-label={`${api.name}: ${api.real} chamadas reais, ${api.checks} verificações`}>
            <div className="h-full rounded-full" style={{ width: share(api.real, peak), background: COLORS[index % COLORS.length] }} />
          </div>
          <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-white/10">
            <div className="h-full rounded-full bg-white/40" style={{ width: share(api.checks, peak) }} />
          </div>
        </li>
      ))}
    </ul>
  );
}

function ApiTrend({ apis }: { apis: ApiCompare[] }) {
  const days = apis[0]?.series ?? [];
  const peak = Math.max(1, ...apis.flatMap((api) => api.series.map((point) => point.real)));
  const width = 640;
  const height = 220;
  const pad = { left: 36, right: 12, top: 16, bottom: 28 };
  const innerW = width - pad.left - pad.right;
  const innerH = height - pad.top - pad.bottom;
  const yAt = (value: number) => pad.top + innerH - (value / peak) * innerH;
  const baseline = pad.top + innerH;
  const groupW = innerW / Math.max(1, days.length);
  const barW = Math.max(2, Math.min(14, (groupW - 6) / Math.max(1, apis.length)));
  const step = days.length > 10 ? Math.ceil(days.length / 6) : 1;
  const ticks = [...new Set([0, Math.round(peak / 2), peak])];

  return (
    <div className="mt-4">
      <svg viewBox={`0 0 ${width} ${height}`} className="h-56 w-full" role="img" aria-label={trendLabel(apis)}>
        {ticks.map((tick) => (
          <g key={tick}>
            <line x1={pad.left} x2={width - pad.right} y1={yAt(tick)} y2={yAt(tick)} stroke="rgba(135,149,170,0.25)" />
            <text x={pad.left - 8} y={yAt(tick) + 4} textAnchor="end" fill="var(--muted)" fontSize="11">{tick}</text>
          </g>
        ))}
        {days.map((day, dayIndex) => {
          const groupX = pad.left + dayIndex * groupW + (groupW - barW * apis.length) / 2;
          return (
            <g key={day.day}>
              {apis.map((api, apiIndex) => {
                const value = api.series[dayIndex]?.real ?? 0;
                const barH = (value / peak) * innerH;
                return (
                  <rect
                    key={api.id}
                    x={groupX + apiIndex * barW}
                    y={baseline - barH}
                    width={Math.max(1, barW - 1)}
                    height={barH}
                    rx="1.5"
                    fill={COLORS[apiIndex % COLORS.length]}
                  >
                    <title>{`${api.name} em ${day.label}: ${value} chamadas reais`}</title>
                  </rect>
                );
              })}
            </g>
          );
        })}
        {days.map((day, index) => (
          index % step === 0 || index === days.length - 1 ? (
            <text key={day.day} x={pad.left + index * groupW + groupW / 2} y={height - 8} textAnchor="middle" fill="var(--muted)" fontSize="11">{day.label}</text>
          ) : null
        ))}
      </svg>
      <ul className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted">
        {apis.map((api, index) => (
          <li key={api.id} className="inline-flex items-center gap-1.5">
            <i className="h-2 w-2 rounded-full" style={{ background: COLORS[index % COLORS.length] }} />
            {api.name}
          </li>
        ))}
      </ul>
    </div>
  );
}

function share(value: number, peak: number) {
  if (value <= 0) return "0%";
  return `${Math.max(4, Math.round((value / peak) * 100))}%`;
}

function trendLabel(apis: ApiCompare[]) {
  return apis.map((api) => `${api.name}: ${api.real} chamadas reais no período`).join(". ");
}
