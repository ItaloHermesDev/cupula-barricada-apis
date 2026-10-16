import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { PageFallback } from "@/app/components/dashboard-shell";
import { getCurrentUser } from "@/lib/dal";

export const metadata: Metadata = { title: "Painel" };

export default function HomePage() {
  return (
    <Suspense fallback={<PageFallback />}>
      <Entrada />
    </Suspense>
  );
}

async function Entrada() {
  const user = await getCurrentUser();
  if (user.pages.includes("barricadas")) return redirect("/barricadas");
  if (user.pages.includes("painel")) return redirect("/painel");
  return redirect("/sem-acesso");
}
