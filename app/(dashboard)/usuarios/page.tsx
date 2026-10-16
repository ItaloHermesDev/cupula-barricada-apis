import type { Metadata } from "next";
import { Suspense } from "react";
import { PageFallback } from "@/app/components/dashboard-shell";
import { UsersManager } from "@/app/components/users-manager";
import { requirePage } from "@/lib/dal";
import { listUsersWithPages } from "@/lib/users";

export const metadata: Metadata = {
  title: "Usuários",
};

export default function UsersPage() {
  return (
    <Suspense fallback={<PageFallback />}>
      <UsersContent />
    </Suspense>
  );
}

async function UsersContent() {
  const currentUser = await requirePage("usuarios");
  const users = await listUsersWithPages();

  return (
    <main className="w-full">
      <UsersManager
        users={users.map((user) => ({
          id: user.id,
          name: user.name,
          email: user.email,
          createdAt: user.createdAt,
          pages: user.pages,
          isCurrent: user.id === currentUser.id,
        }))}
      />
    </main>
  );
}
