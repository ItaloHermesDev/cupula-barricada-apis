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
    <section className={`grid min-w-0 gap-4 ${showTrend ? "lg:grid-cols-2" : ""}`}>
      <article className="min-w-0 overflow-hidden rounded-[18px] border border-line bg-card/90 p-5">
        <h2 className="text-sm font-medium">Consumo entre as APIs</h2>
        <p className="mt-1 text-xs text-muted">Chamadas no período {period}. A coluna maior é a API que mais consumiu. A coluna clara é a verificação.</p>
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
  const slot = 86;
  const width = Math.max(apis.length * slot + 28, slot);
  const height = 268;
  const pad = { top: 22, bottom: 136 };
  const innerH = height - pad.top - pad.bottom;
  const baseline = pad.top + innerH;
  return (
    <div className="mt-4 w-full overflow-x-auto">
      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="block max-w-none" role="img" aria-label="Consumo entre as APIs">
        <line x1="0" x2={width} y1={baseline} y2={baseline} stroke="rgba(135,149,170,0.28)" />
        {apis.map((api, index) => {
          const x = index * slot + 14;
          const realH = api.real <= 0 ? 0 : Math.max(4, (api.real / peak) * innerH);
          const checkH = api.checks <= 0 ? 0 : Math.max(4, (api.checks / peak) * innerH);
          const labelX = x + 18;
          const labelY = baseline + 16;
          return (
            <g key={api.id}>
              <text x={labelX} y={baseline - Math.max(realH, checkH) - 6} textAnchor="middle" fill="var(--muted)" fontSize="10">{api.real}</text>
              <rect x={x} y={baseline - realH} width="18" height={realH} rx="4" fill={COLORS[index % COLORS.length]}>
                <title>{`${api.name}: ${api.real} uso real, ${api.checks} verificações`}</title>
              </rect>
              <rect x={x + 22} y={baseline - checkH} width="14" height={checkH} rx="4" fill="rgba(240,245,255,0.38)">
                <title>{`${api.name}: ${api.checks} verificações`}</title>
              </rect>
              <text x={labelX} y={labelY} fill="var(--muted)" fontSize="11" transform={`rotate(58 ${labelX} ${labelY})`}>
                {axisLabel(api.name)}
                <title>{api.name}</title>
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

function trendLabel(apis: ApiCompare[]) {
  return apis.map((api) => `${api.name}: ${api.real} chamadas reais no período`).join(". ");
}
