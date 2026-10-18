import type { Metadata } from "next";
import { Suspense } from "react";
import { BarricadeOps, type BarricadeOpsRow } from "@/app/components/catalog/barricade-ops";
import { PageFallback } from "@/app/components/dashboard-shell";
import { getApi } from "@/lib/apis";
import { listBarricades, type BarricadeRecord } from "@/lib/barricades";
import { dayKey } from "@/lib/catalog";
import { requirePage } from "@/lib/dal";
import { callParameters, type CallParameter } from "@/lib/draft";
import { refreshDueHealth } from "@/lib/health";
import { listBarricadeSources } from "@/lib/sources";

export const metadata: Metadata = { title: "Status" };

export default function StatusPage() {
  return (
    <Suspense fallback={<PageFallback />}>
      <Status />
    </Suspense>
  );
}

async function Status() {
  await requirePage("status");
  const day = dayKey();
  await refreshDueHealth(await listBarricades(day));
  const items = await listBarricades(day);
  const rows = await Promise.all(items.map(opsOf));

  return (
    <div className="relative flex flex-col gap-4">
      <p className="text-sm text-muted">{items.length === 0 ? "Nenhuma barricada" : `${items.length} ${items.length === 1 ? "barricada" : "barricadas"}`}</p>
      {items.length === 0 ? (
        <p className="rounded-[14px] border border-dashed border-line px-4 py-8 text-sm text-muted">
          Cadastre uma barricada para acompanhar se ela está funcionando.
        </p>
      ) : (
        <BarricadeOps rows={rows} />
      )}
    </div>
  );
}

async function opsOf(item: BarricadeRecord): Promise<BarricadeOpsRow> {
  const status = statusOf(item);
  const api = await getApi(item.apiId);
  const linked = await listBarricadeSources(item.id);
  const extras = await Promise.all(linked.map((source) => getApi(source.apiId)));
  const groups = [api, ...extras].flatMap((source) => source ? [callParameters({
    endpointPath: source.endpointPath,
    query: source.query,
    pathParams: source.pathParams,
    bodyTemplate: source.bodyTemplate,
    params: item.params,
  })] : []);
  return {
    id: item.id,
    name: item.name,
    statusLabel: status.label,
    statusTone: status.tone,
    healthEnabled: item.healthEnabled,
    interval: item.healthIntervalMinutes,
    logoVersion: logoVersionOf(item.logoUpdatedAt),
    fields: mergeFields(groups),
  };
}

function mergeFields(groups: CallParameter[][]) {
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

function logoVersionOf(value: Date | string | null) {
  if (!value) return null;
  const stamp = value instanceof Date ? String(value.getTime()) : String(value);
  return stamp || null;
}

function statusOf(item: BarricadeRecord) {
  if (!item.active) return { label: "Inativa", tone: "muted" as const };
  if (!item.healthEnabled) return { label: "Verificação desligada", tone: "success" as const };
  if (item.healthOk === null) return { label: "Aguardando verificação", tone: "warning" as const };
  if (item.healthOk) return { label: "Funcionando", tone: "success" as const };
  return { label: "Com falha", tone: "danger" as const };
}
