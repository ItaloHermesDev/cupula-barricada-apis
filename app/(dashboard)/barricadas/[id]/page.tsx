import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { toggleRoutine } from "@/app/actions/catalog";
import { BarricadePageLinks } from "@/app/components/catalog/barricade-links";
import { BarricadeMark } from "@/app/components/catalog/barricade-mark";
import { CallExample, HealthClock } from "@/app/components/catalog/call-example";
import { RenewToken } from "@/app/components/catalog/simple-barricade-form";
import { PageFallback } from "@/app/components/dashboard-shell";
import { getApi } from "@/lib/apis";
import { getBarricade, revealToken } from "@/lib/barricades";
import { dayKey, formatWhen } from "@/lib/catalog";
import { requirePage } from "@/lib/dal";
import { instructionFields } from "@/lib/draft";
import { refreshDueHealth } from "@/lib/health";
import { searchLogs } from "@/lib/stats";

export const metadata: Metadata = { title: "Barricada" };

export default function ViewBarricadePage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <Suspense fallback={<PageFallback />}>
      <ViewBarricade params={params} />
    </Suspense>
  );
}

async function ViewBarricade({ params }: { params: Promise<{ id: string }> }) {
  await requirePage("barricadas");
  const { id } = await params;
  const numericId = Number(id);
  const day = dayKey();
  const found = await getBarricade(numericId, day);
  if (!found) notFound();
  await refreshDueHealth([found]);
  const [current, api, token, headerList, logs] = await Promise.all([
    getBarricade(numericId, day),
    getApi(found.apiId),
    revealToken(numericId),
    headers(),
    searchLogs({ barricadeId: numericId, page: 1 }),
  ]);
  if (!current || !api) notFound();
  const host = headerList.get("x-forwarded-host") ?? headerList.get("host") ?? "localhost:3000";
  const proto = headerList.get("x-forwarded-proto") ?? "http";
  const origin = `${proto}://${host}`;
  const example = buildExample(
    origin,
    current.slug,
    current.method,
    instructionFields(api.bodyTemplate),
    current.responseTemplate,
    current.origins,
  );
  const status = statusOf(current);
  const remaining = current.dailyLimit > 0 ? Math.max(0, current.dailyLimit - current.usedToday) : null;

  return (
    <div className="flex flex-col gap-5">
      <HealthClock minutes={current.healthIntervalMinutes} enabled={current.healthEnabled} />
      <div className="flex justify-end">
        <BarricadePageLinks id={current.id} />
      </div>
      <div className="flex items-center gap-3">
        <BarricadeMark id={current.id} updatedAt={current.logoUpdatedAt} size="md" />
        <div>
          <p className={`text-sm ${status.className}`}>{status.label}</p>
          <p className="mt-1 text-sm text-muted">
            Hoje: {current.usedToday} {current.usedToday === 1 ? "chamada real" : "chamadas reais"}
            {remaining !== null ? ` · ${remaining} restantes` : ""}. Verificações: {current.internalToday}. Última chamada real: {formatWhen(current.lastUsedAt)}.
          </p>
        </div>
      </div>

      <section className="rounded-[14px] border border-line bg-card/90 p-5">
        <h2 className="text-sm font-medium">Verificação de rotina</h2>
        <p className="mt-2 text-sm text-muted">
          {current.healthEnabled
            ? `${status.label}${current.healthLatencyMs != null && current.healthOk ? ` · ${current.healthLatencyMs} ms` : ""}. Última verificação: ${formatWhen(current.healthCheckedAt)}. Repete a cada ${current.healthIntervalMinutes} min mesmo com o painel fechado.`
            : "Desligada. Ao ligar, o teste segue no intervalo escolhido mesmo com o painel fechado."} Cada verificação chama a API e fica salva como consumo interno, sem entrar no limite do dia.
        </p>
        {current.healthEnabled && current.healthDetail ? <p className="mt-1 text-xs text-muted">{current.healthDetail}</p> : null}
        <form action={toggleRoutine} className="mt-4 flex flex-wrap items-end gap-3">
          <input type="hidden" name="id" value={current.id} />
          <label className="text-sm text-foreground">
            A cada (minutos)
            <input name="interval" type="number" min={1} max={1440} required defaultValue={current.healthIntervalMinutes} className="mt-1 block w-28 rounded-[12px] border border-line bg-background px-3 py-2 text-sm" />
          </label>
          {current.healthEnabled ? (
            <>
              <button type="submit" name="enabled" value="1" className="rounded-[12px] border border-line px-3 py-2 text-sm text-foreground">Salvar intervalo</button>
              <button type="submit" name="enabled" value="0" className="text-sm text-accent">Desligar verificação</button>
            </>
          ) : (
            <button type="submit" name="enabled" value="1" className="text-sm text-accent">Ativar verificação</button>
          )}
        </form>
      </section>

      <section className="rounded-[14px] border border-line bg-card/90 p-5">
        <h2 className="text-sm font-medium">Como chamar</h2>
        <p className="mt-2 text-sm text-muted">Copie o prompt e cole no chat. Ele manda guardar o token numa variável de ambiente e usar essa variável na requisição.</p>
        <div className="mt-4">
          <CallExample
            method={example.method}
            url={example.url}
            env={example.env}
            fields={example.fields}
            origins={example.origins}
            response={example.response}
          />
        </div>
      </section>

      <section className="rounded-[14px] border border-line bg-card/90 p-5">
        <h2 className="text-sm font-medium">Token</h2>
        {token ? (
          <p className="mt-3 break-all font-mono text-sm text-foreground">{token}</p>
        ) : (
          <p className="mt-3 text-sm text-muted">Este token foi criado antes de ficar salvo. Gere outro para vê-lo de novo.</p>
        )}
        <div className="mt-4">
          <RenewToken id={current.id} />
        </div>
      </section>

      <section className="rounded-[14px] border border-line bg-card/90 p-5">
        <h2 className="text-sm font-medium">Chamadas</h2>
        {logs.rows.length === 0 ? <p className="mt-3 text-sm text-muted">Nenhuma chamada registrada.</p> : (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead className="text-xs tracking-wide text-muted uppercase">
                <tr>
                  <th className="px-3 py-2 font-medium">Quando</th>
                  <th className="px-3 py-2 font-medium">Tipo</th>
                  <th className="px-3 py-2 font-medium">Status</th>
                  <th className="px-3 py-2 font-medium">Tempo</th>
                  <th className="px-3 py-2 font-medium">Fallback</th>
                </tr>
              </thead>
              <tbody>
                {logs.rows.map((row) => (
                  <tr key={row.id} className="border-t border-line">
                    <td className="px-3 py-2 text-muted">{formatWhen(row.created_at)}</td>
                    <td className="px-3 py-2 text-foreground">{kindOf(row.outcome)}</td>
                    <td className="px-3 py-2 text-foreground">{statusOfLog(row)}</td>
                    <td className="px-3 py-2 text-muted">{row.duration_ms} ms</td>
                    <td className="px-3 py-2 text-muted">{row.outcome === "verificacao" ? "—" : row.used_fallback ? row.fallback_reason || "sim" : "não"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

function kindOf(outcome: string) {
  if (outcome === "verificacao") return "Verificação";
  if (outcome === "rejeitada") return "Rejeitada";
  return "Uso real";
}

function statusOfLog(row: { outcome: string; provider_status: number | null; consumer_status: number; failure_reason: string | null }) {
  if (row.outcome === "verificacao") {
    return `HTTP ${row.provider_status ?? "—"}${row.failure_reason ? ` · ${row.failure_reason}` : ""}`;
  }
  return `${row.outcome} · ${row.provider_status ?? "—"}/${row.consumer_status}`;
}

function buildExample(origin: string, slug: string, method: string, fields: { name: string; value: string; jsonName: string }[], template: string, allowedOrigins: string[]) {
  const query = fields.map((field) => `${field.name}={${field.name}}`).join("&");
  const url = `${origin}/api/barricada/${slug}${query ? `?${query}` : ""}`;
  const origins = allowedOrigins.filter((item) => item.startsWith("http://") || item.startsWith("https://"));
  return { method, url, env: envName(slug), fields, origins, response: sampleResponse(template) };
}

function envName(slug: string) {
  const cleaned = slug.toUpperCase().replace(/[^A-Z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  return `BARRICADA_${cleaned || "TOKEN"}_TOKEN`;
}

function sampleResponse(template: string) {
  const trimmed = template.trim();
  if (!trimmed) return "{\n  \"...\": \"JSON completo devolvido pela API\"\n}";
  try {
    return JSON.stringify(explainValue(JSON.parse(trimmed) as unknown), null, 2);
  } catch {
    return trimmed;
  }
}

function explainValue(value: unknown): unknown {
  if (typeof value === "string") {
    const match = value.match(/^\{\{\s*([^|}]+)/);
    if (match) return `valor de ${match[1].trim()}`;
    return value;
  }
  if (Array.isArray(value)) return value.map((item) => explainValue(item));
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, explainValue(item)]));
  }
  return value;
}

function statusOf(item: { active: boolean; healthEnabled: boolean; healthOk: boolean | null }) {
  if (!item.active) return { label: "Inativa", className: "text-muted" };
  if (!item.healthEnabled) return { label: "Verificação desligada", className: "text-muted" };
  if (item.healthOk === null) return { label: "Aguardando verificação", className: "text-warning" };
  if (item.healthOk) return { label: "Funcionando", className: "text-success" };
  return { label: "Com falha", className: "text-danger" };
}
