import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ApiForm } from "@/app/components/catalog/api-form";
import { PageFallback } from "@/app/components/dashboard-shell";
import { getApi } from "@/lib/apis";
import { requirePage } from "@/lib/dal";

export const metadata: Metadata = { title: "Editar API" };

export default function EditApiPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ erro?: string }> }) {
  return (
    <Suspense fallback={<PageFallback />}>
      <EditApi params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function EditApi({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ erro?: string }> }) {
  await requirePage("apis");
  const [{ id }, query] = await Promise.all([params, searchParams]);
  const api = await getApi(Number(id));
  if (!api) notFound();

  return (
    <div className="flex flex-col gap-4">
      {query.erro === "vinculo" ? (
        <p className="rounded-[12px] border border-warning/30 bg-warning/10 px-3 py-2 text-sm text-warning">
          Remova as barricadas vinculadas antes de excluir esta API.
        </p>
      ) : null}
      <ApiForm api={api} />
    </div>
  );
}
