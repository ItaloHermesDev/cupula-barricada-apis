import type { Metadata } from "next";
import { Suspense } from "react";
import { AccountForms } from "@/app/components/account-forms";
import { PageFallback } from "@/app/components/dashboard-shell";
import { getCurrentUser } from "@/lib/dal";

export const metadata: Metadata = {
  title: "Meus dados",
};

export default function AccountPage() {
  return (
    <Suspense fallback={<PageFallback />}>
      <AccountContent />
    </Suspense>
  );
}

async function AccountContent() {
  const user = await getCurrentUser();

  return (
    <main className="grid w-full gap-5 lg:grid-cols-2">
      <AccountForms name={user.name} email={user.email} />
    </main>
  );
}
