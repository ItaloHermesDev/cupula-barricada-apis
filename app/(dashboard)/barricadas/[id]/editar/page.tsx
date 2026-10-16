import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { removeBarricade } from "@/app/actions/catalog";
import { BarricadePageLinks } from "@/app/components/catalog/barricade-links";
import { DeleteButton } from "@/app/components/catalog/fields";
import { SimpleBarricadeForm } from "@/app/components/catalog/simple-barricade-form";
import { PageFallback } from "@/app/components/dashboard-shell";
import { getApi } from "@/lib/apis";
import { getBarricade, listBarricades } from "@/lib/barricades";
import { dayKey } from "@/lib/catalog";
import { requirePage } from "@/lib/dal";
import { bodyModeOf, fieldsFromTemplate, joinApiUrl } from "@/lib/draft";
import { isSensitiveHeader } from "@/lib/secrets";

export const metadata: Metadata = { title: "Editar barricada" };

export default function EditBarricadePage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <Suspense fallback={<PageFallback />}>
      <EditBarricade params={params} />
    </Suspense>
  );
}

async function EditBarricade({ params }: { params: Promise<{ id: string }> }) {
  await requirePage("barricadas");
  const { id } = await params;
  const numericId = Number(id);
  const day = dayKey();
  const [current, barricades, headerList] = await Promise.all([
    getBarricade(numericId, day),
    listBarricades(day),
    headers(),
  ]);
  if (!current) notFound();
  const api = await getApi(current.apiId);
  if (!api) notFound();
  const host = headerList.get("x-forwarded-host") ?? headerList.get("host") ?? "";
  const proto = headerList.get("x-forwarded-proto") ?? "http";
  const mode = bodyModeOf(api.requestContentType, api.bodyTemplate);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex justify-end">
        <BarricadePageLinks id={current.id} />
      </div>
      <SimpleBarricadeForm
        alternatives={barricades.map((item) => ({ id: item.id, name: item.name }))}
        endpoint={`${proto}://${host}/api/barricada/${current.slug}`}
        draft={{
          barricadeId: current.id,
          apiId: api.id,
          name: current.name,
          apiUrl: joinApiUrl(api.baseUrl, api.endpointPath),
          apiMethod: api.method,
          bodyMode: mode,
          headers: api.headers.map((header) => ({
            name: header.name,
            value: isSensitiveHeader(header.name) ? "" : header.value,
            keep: isSensitiveHeader(header.name) && Boolean(header.value),
          })),
          fields: mode === "form" ? fieldsFromTemplate(api.bodyTemplate) : [],
          jsonBody: mode === "json" ? api.bodyTemplate : "",
          slug: current.slug,
          origins: current.origins.join("\n"),
          dailyLimit: current.dailyLimit,
          responseTemplate: current.responseTemplate,
          fallbackId: current.fallbackId,
          active: current.active,
          tokenPrefix: current.tokenPrefix,
          logoUpdatedAt: current.logoUpdatedAt,
        }}
      />
      <DeleteButton action={removeBarricade} id={current.id} message="Excluir esta barricada?" />
    </div>
  );
}
