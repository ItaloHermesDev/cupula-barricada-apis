import type { Metadata } from "next";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { PageFallback } from "@/app/components/dashboard-shell";
import { getCurrentUser } from "@/lib/dal";
import { APP_PAGES } from "@/lib/pages";

export const metadata: Metadata = {
  title: "Sem acesso",
};

export default function NoAccessPage() {
  return (
    <Suspense fallback={<PageFallback />}>
      <NoAccess />
    </Suspense>
  );
}

async function NoAccess() {
  const user = await getCurrentUser();
  const nextPage = APP_PAGES.find((page) => user.pages.includes(page.key));
  if (nextPage) redirect(nextPage.href);

  return (
    <main className="flex w-full max-w-xl flex-col gap-3">
      <p className="text-lg font-medium text-foreground">Nenhuma página liberada</p>
      <p className="max-w-xl text-sm leading-6 text-muted">
        A conta {user.email} ainda não pode abrir páginas. Peça a quem administra os usuários para
        marcar um acesso.
      </p>
    </main>
  );
}
