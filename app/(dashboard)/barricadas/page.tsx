import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { BarricadeCard, type BarricadeCardData } from "@/app/components/catalog/barricade-card";
import { PageFallback } from "@/app/components/dashboard-shell";
import { listBarricades, type BarricadeRecord } from "@/lib/barricades";
import { dayKey } from "@/lib/catalog";
import { requirePage } from "@/lib/dal";
import { refreshDueHealth } from "@/lib/health";

export const metadata: Metadata = { title: "Barricadas" };

export default function BarricadesPage() {
  return (
    <Suspense fallback={<PageFallback />}>
      <Barricades />
    </Suspense>
  );
}

async function Barricades() {
  await requirePage("barricadas");
  const day = dayKey();
  await refreshDueHealth(await listBarricades(day));
  const items = await listBarricades(day);

  return (
    <div className="relative flex flex-col gap-4">
      <div className="pointer-events-none absolute -top-10 right-0 h-72 w-72 rounded-full bg-violet/20 blur-3xl" />
      <div className="relative flex items-center justify-between gap-3">
        <p className="text-sm text-muted">{items.length === 0 ? "Nenhuma barricada" : `${items.length} ${items.length === 1 ? "barricada" : "barricadas"}`}</p>
        <Link href="/barricadas/nova" className="inline-flex items-center gap-1.5 rounded-full bg-gradient-to-r from-[#7A45FF] to-[#D24BFF] px-4 py-2 text-sm font-medium text-white shadow-[0_8px_24px_rgba(168,70,255,0.35)]">
          <span aria-hidden="true">+</span>
          Nova barricada
        </Link>
      </div>
      {items.length === 0 ? (
        <p className="relative rounded-[14px] border border-dashed border-line px-4 py-8 text-sm text-muted">
          Cadastre a URL da API. A barricada vira o endereço que as aplicações chamam.
        </p>
      ) : (
        <div className="relative flex flex-wrap gap-5">
          {items.map((item) => (
            <BarricadeCard key={item.id} item={cardOf(item)} />
          ))}
        </div>
      )}
    </div>
  );
}

function cardOf(item: BarricadeRecord): BarricadeCardData {
  const status = statusOf(item);
  const used = item.dailyLimit > 0 ? `${item.usedToday} / ${item.dailyLimit}` : `${item.usedToday} · sem limite`;
  const stamp = item.logoUpdatedAt instanceof Date ? String(item.logoUpdatedAt.getTime()) : item.logoUpdatedAt;
  return {
    id: item.id,
    name: item.name,
    apiMethod: item.apiMethod,
    apiUrl: item.apiUrl,
    slug: item.slug,
    usedLabel: used,
    checksLabel: `${item.internalToday} ${item.internalToday === 1 ? "verificação" : "verificações"}`,
    logoVersion: stamp ? String(stamp) : null,
    statusLabel: status.label,
    statusTone: status.tone,
  };
}

function statusOf(item: BarricadeRecord) {
  if (!item.active) return { label: "Inativa", tone: "muted" as const };
  if (!item.healthEnabled) return { label: "Verificação desligada", tone: "success" as const };
  if (item.healthOk === null) return { label: "Aguardando verificação", tone: "warning" as const };
  if (item.healthOk) return { label: "Funcionando", tone: "success" as const };
  return { label: "Com falha", tone: "danger" as const };
}
