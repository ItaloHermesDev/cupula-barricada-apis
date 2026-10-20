import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { removeApi } from "@/app/actions/catalog";
import { DeleteButton } from "@/app/components/catalog/fields";
import { PageFallback } from "@/app/components/dashboard-shell";
import { listApis } from "@/lib/apis";
import { requirePage } from "@/lib/dal";
import { operationalState, outcomeSamples } from "@/lib/stats";

export const metadata: Metadata = { title: "APIs" };

export default function ApisPage() {
  return (
    <Suspense fallback={<PageFallback />}>
      <Apis />
    </Suspense>
  );
}

async function Apis() {
  await requirePage("apis");
  const [apis, samples] = await Promise.all([listApis(), outcomeSamples()]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-muted">{apis.length} {apis.length === 1 ? "serviço externo" : "serviços externos"}</p>
        <Link href="/apis/nova" className="rounded-[12px] bg-accent px-4 py-2 text-sm font-medium text-accent-foreground">
          Nova API
        </Link>
      </div>
      {apis.length === 0 ? (
        <p className="rounded-[14px] border border-dashed border-line px-4 py-8 text-sm text-muted">
          Nenhuma API cadastrada. O primeiro serviço externo entra por aqui, sem alterar o código.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-[14px] border border-line bg-card">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="text-xs tracking-wide text-muted uppercase">
              <tr>
                <th className="px-4 py-3 font-medium">Nome</th>
                <th className="px-4 py-3 font-medium">Destino</th>
                <th className="px-4 py-3 font-medium">Estado</th>
                <th className="px-4 py-3 font-medium">Barricadas</th>
                <th className="px-4 py-3 font-medium">Ações</th>
              </tr>
            </thead>
            <tbody>
              {apis.map((api) => {
                const state = operationalState(
                  api.active,
                  false,
                  samples.filter((sample) => sample.api_id === api.id).slice(0, 5),
                );
                return (
                  <tr key={api.id} className="border-t border-line">
                    <td className="px-4 py-3">
                      <Link href={`/apis/${api.id}`} className="font-medium text-foreground hover:text-accent">{api.name}</Link>
                      <p className="text-xs text-muted">{api.method}</p>
                    </td>
                    <td className="max-w-xs truncate px-4 py-3 text-muted">{api.baseUrl}{api.endpointPath}</td>
                    <td className="px-4 py-3 text-muted">{labelState(state)}</td>
                    <td className="px-4 py-3 text-muted">{api.barricadeCount}</td>
                    <td className="px-4 py-3"><DeleteButton action={removeApi} id={api.id} message="Excluir esta API?" /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function labelState(state: string) {
  const labels: Record<string, string> = {
    ativa: "Ativa, sem verificação",
    operacional: "Operacional",
    instavel: "Instável",
    com_erro: "Com erro",
    inativa: "Inativa",
    limite_atingido: "Limite atingido",
  };
  return labels[state] ?? state;
}
