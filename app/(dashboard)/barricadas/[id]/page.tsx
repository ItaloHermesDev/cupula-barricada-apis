import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { toggleRoutine } from "@/app/actions/catalog";
import { BarricadePageLinks } from "@/app/components/catalog/barricade-links";
import { HealthPhoto } from "@/app/components/catalog/health-photo";
import { BarricadeMark } from "@/app/components/catalog/barricade-mark";
import { CallExample, HealthClock } from "@/app/components/catalog/call-example";
import { RenewToken } from "@/app/components/catalog/simple-barricade-form";
import { PageFallback } from "@/app/components/dashboard-shell";
import { getApi } from "@/lib/apis";
import { getBarricade, revealToken } from "@/lib/barricades";
import { dayKey, formatWhen } from "@/lib/catalog";
import { requirePage } from "@/lib/dal";
import { callParameters, type CallParameter } from "@/lib/draft";
import { refreshDueHealth } from "@/lib/health";
import { listBarricadeSources, listRouteStats } from "@/lib/sources";

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
  const [current, api, token, headerList] = await Promise.all([
    getBarricade(numericId, day),
    getApi(found.apiId),
    revealToken(numericId),
    headers(),
  ]);
  if (!current || !api) notFound();
  const [linked, usage] = await Promise.all([
    listBarricadeSources(current.id),
    listRouteStats(current.id),
  ]);
  const linkedApis = await Promise.all(linked.map(async (source) => ({ source, api: await getApi(source.apiId) })));
  const host = headerList.get("x-forwarded-host") ?? headerList.get("host") ?? "localhost:3000";
  const proto = headerList.get("x-forwarded-proto") ?? "http";
  const origin = `${proto}://${host}`;
  const parameterGroups = [api, ...linkedApis.flatMap((item) => item.api ? [item.api] : [])].map((item) => callParameters({
    endpointPath: item.endpointPath,
    query: item.query,
    pathParams: item.pathParams,
    bodyTemplate: item.bodyTemplate,
    params: current.params,
  }));
  const example = buildExample(
    origin,
    current.slug,
    current.method,
    mergeParameters(parameterGroups),
    combinedSample([current.responseTemplate, ...linked.map((source) => source.responseTemplate)]),
    current.origins,
  );
  const status = statusOf(current);
  const remaining = current.dailyLimit > 0 ? Math.max(0, current.dailyLimit - current.usedToday) : null;
  const usageByApi = new Map(usage.map((item) => [item.apiId, item]));
  const routes = [
    { apiId: api.id, name: api.name },
    ...linkedApis.flatMap((item) => item.api ? [{ apiId: item.api.id, name: item.api.name }] : []),
  ].map((route) => {
    const stat = usageByApi.get(route.apiId);
    return {
      ...route,
      calls: stat?.calls ?? 0,
      monthlyTokens: stat?.monthlyTokens ?? null,
      requestsPerMinute: stat?.requestsPerMinute ?? null,
      subscriptionName: stat?.subscriptionName ?? null,
      subscriptionPrice: stat?.subscriptionPrice ?? null,
    };
  });

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
            {remaining !== null ? ` · ${remaining} restantes` : " · sem limite"}. Verificações: {current.internalToday}. Última chamada real: {formatWhen(current.lastUsedAt)}.
          </p>
        </div>
      </div>

      <section className="rounded-[14px] border border-line bg-card p-5">
        <h2 className="text-sm font-medium">Verificação de rotina</h2>
        <p className="mt-2 text-sm text-muted">
          {current.healthEnabled
            ? `${status.label}${current.healthLatencyMs != null && current.healthOk ? ` · ${current.healthLatencyMs} ms` : ""}. Última verificação: ${formatWhen(current.healthCheckedAt)}. Repete a cada ${current.healthIntervalMinutes} min mesmo com o painel fechado.`
            : "Desligada. Ao ligar, o teste segue no intervalo escolhido mesmo com o painel fechado."} Cada verificação chama a API e fica salva como consumo interno, sem entrar no limite do dia.
        </p>
        {current.healthCheckedAt && !current.healthOk && current.healthDetail ? (
          <p className="mt-3 text-sm text-danger">{current.healthDetail}</p>
        ) : null}
        {current.healthImage ? <HealthPhoto src={current.healthImage} /> : null}
        {current.healthCheckedAt && current.healthOk && !current.healthImage ? (
          <p className="mt-3 text-sm text-muted">A resposta não trouxe uma URL de foto.</p>
        ) : null}
        <form action={toggleRoutine} className="mt-4 flex flex-wrap items-end gap-3">
          <input type="hidden" name="id" value={current.id} />
          <label className="text-sm text-foreground">
            A cada (minutos)
            <input name="interval" type="number" min={1} max={1440} required defaultValue={current.healthIntervalMinutes} className="mt-1 block w-28 rounded-[12px] border border-line bg-background px-3 py-2 text-sm" />
          </label>
          {current.healthEnabled ? (
            <>
              <button type="submit" name="enabled" value="1" className="rounded-[12px] border border-line px-3 py-2 text-sm text-foreground">Salvar intervalo</button>
              <button type="submit" name="now" value="1" className="rounded-[12px] border border-line px-3 py-2 text-sm text-foreground">Verificar agora</button>
              <button type="submit" name="enabled" value="0" className="text-sm text-accent">Desligar verificação</button>
            </>
          ) : (
            <button type="submit" name="enabled" value="1" className="text-sm text-accent">Ativar verificação</button>
          )}
        </form>
      </section>

      <section className="rounded-[14px] border border-line bg-card p-5">
        <h2 className="text-sm font-medium">Como chamar</h2>
        <p className="mt-2 text-sm text-muted">Copie o prompt e cole no chat. Ele manda guardar o token numa variável de ambiente e usar essa variável na requisição.</p>
        {linked.length > 0 ? (
          <p className="mt-2 text-sm text-muted">Esta chamada consulta {linked.length + 1} APIs e junta os campos numa resposta só.</p>
        ) : null}
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

      <section className="rounded-[14px] border border-line bg-card p-5">
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

      <section className="rounded-[14px] border border-line bg-card p-5">
        <h2 className="text-sm font-medium">Uso por rota</h2>
        <p className="mt-2 text-sm text-muted">Tokens no mês e requisições por minuto são anotações para comparar. Não limitam a chamada.</p>
        <ul className="mt-4 flex flex-col gap-3">
          {routes.map((route) => (
            <li key={route.apiId} className="text-sm text-foreground">
              <span className="font-medium">{route.name}</span>
              <span className="mt-1 block text-muted">
                {route.calls} {route.calls === 1 ? "chamada" : "chamadas"}
                {" · "}tokens no mês: {route.monthlyTokens ?? "—"}
                {" · "}por minuto: {route.requestsPerMinute ?? "—"}
                {route.subscriptionName ? ` · assinatura ${route.subscriptionName}` : ""}
                {route.subscriptionPrice != null ? ` · ${money(route.subscriptionPrice)} por mês` : ""}
              </span>
            </li>
          ))}
        </ul>
      </section>

    </div>
  );
}

function money(value: number) {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function mergeParameters(groups: CallParameter[][]) {
  const found = new Map<string, CallParameter>();
  for (const field of groups.flat()) {
    const current = found.get(field.name);
    if (!current) {
      found.set(field.name, { ...field });
      continue;
    }
    current.required = current.required || field.required;
    if (!current.value && field.value) current.value = field.value;
  }
  return [...found.values()];
}

function combinedSample(templates: string[]) {
  const marked: Record<string, unknown> = {};
  let markedCount = 0;
  let openCount = 0;
  for (const template of templates) {
    const trimmed = template.trim();
    if (!trimmed) {
      openCount += 1;
      continue;
    }
    try {
      const parsed = JSON.parse(trimmed) as unknown;
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        Object.assign(marked, parsed);
        markedCount += 1;
        continue;
      }
    } catch {
      return trimmed;
    }
    openCount += 1;
  }
  if (markedCount === 0) {
    return templates.length > 1
      ? "{\n  \"...\": \"JSON das APIs combinadas, no mesmo objeto\"\n}"
      : sampleResponse("");
  }
  if (openCount > 0) marked["..."] = "JSON completo das APIs sem campos marcados";
  return sampleResponse(JSON.stringify(marked));
}

function buildExample(origin: string, slug: string, method: string, fields: { name: string; value: string; required: boolean }[], template: string, allowedOrigins: string[]) {
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
