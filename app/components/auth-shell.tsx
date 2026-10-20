import type { ReactNode } from "react";
import { Logo } from "@/app/components/icons";

export function AuthShell({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-1 items-center justify-center bg-background px-4 py-16">
      <div className="w-full max-w-[420px]">
        <div className="mb-8 flex items-center gap-3">
          <Logo />
          <div>
            <p className="text-sm font-medium text-foreground">Cúpula Barricada</p>
            <p className="text-sm text-muted">Acesso restrito</p>
          </div>
        </div>
        <section className="rounded-[16px] border border-line bg-card p-8">
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">{title}</h1>
          <p className="mt-2 text-sm leading-6 text-muted">{description}</p>
          <div className="mt-8">{children}</div>
        </section>
      </div>
    </div>
  );
}
