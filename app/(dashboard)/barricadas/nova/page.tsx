import type { Metadata } from "next";
import { Suspense } from "react";
import { SimpleBarricadeForm } from "@/app/components/catalog/simple-barricade-form";
import { PageFallback } from "@/app/components/dashboard-shell";
import { listBarricades } from "@/lib/barricades";
import { dayKey } from "@/lib/catalog";
import { requirePage } from "@/lib/dal";

export const metadata: Metadata = { title: "Nova barricada" };

export default function NewBarricadePage() {
  return (
    <Suspense fallback={<PageFallback />}>
      <NewBarricade />
    </Suspense>
  );
}

async function NewBarricade() {
  await requirePage("barricadas");
  const barricades = await listBarricades(dayKey());
  return (
    <SimpleBarricadeForm
      alternatives={barricades.map((item) => ({ id: item.id, name: item.name }))}
      endpoint=""
      draft={{
        name: "",
        apiUrl: "https://",
        apiMethod: "POST",
        bodyMode: "form",
        headers: [
          { name: "x-rapidapi-host", value: "", keep: false },
          { name: "x-rapidapi-key", value: "", keep: false },
        ],
        fields: [
          { name: "data", value: "basic", open: false },
          { name: "username_or_url", value: "", open: true },
        ],
        jsonBody: "",
        slug: "",
        origins: "",
        dailyLimit: 1000,
        responseTemplate: "",
        fallbackId: null,
        active: true,
      }}
    />
  );
}
