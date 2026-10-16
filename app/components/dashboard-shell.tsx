import type { ReactNode } from "react";
import { CommandShell } from "@/app/components/command/shell";
import { getCurrentUser } from "@/lib/dal";

export function PageFallback() {
  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(280px,360px)_minmax(0,1fr)]">
      <div className="h-36 animate-pulse rounded-[14px] bg-card" />
      <div className="h-36 animate-pulse rounded-[14px] bg-card" />
    </div>
  );
}

export function FrameFallback() {
  return (
    <div className="flex min-h-full flex-1 flex-col md:flex-row">
      <div className="h-16 w-full shrink-0 bg-sidebar md:h-auto md:w-64" />
      <div className="flex-1 p-4 md:p-6">
        <PageFallback />
      </div>
    </div>
  );
}

export async function AuthedFrame({ children }: { children: ReactNode }) {
  const user = await getCurrentUser();

  return (
    <CommandShell user={{ name: user.name, email: user.email, pages: user.pages }}>
      {children}
    </CommandShell>
  );
}
