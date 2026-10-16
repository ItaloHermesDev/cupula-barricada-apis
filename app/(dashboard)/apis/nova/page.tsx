import type { Metadata } from "next";
import { Suspense } from "react";
import { ApiForm } from "@/app/components/catalog/api-form";
import { PageFallback } from "@/app/components/dashboard-shell";
import { requirePage } from "@/lib/dal";

export const metadata: Metadata = { title: "Nova API" };

export default function NewApiPage() {
  return (
    <Suspense fallback={<PageFallback />}>
      <NewApi />
    </Suspense>
  );
}

async function NewApi() {
  await requirePage("apis");
  return <ApiForm />;
}
