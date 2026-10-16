"use client";

import { useState } from "react";
import { Dialog } from "@/app/components/dialog";
import { SignupForm } from "@/app/components/signup-form";
import { UserAccessForm } from "@/app/components/user-access-form";
import { NAV_PAGES } from "@/lib/pages";

export type ManagedUser = {
  id: string;
  name: string;
  email: string;
  createdAt: string;
  pages: string[];
  isCurrent: boolean;
};

export function UsersManager({ users }: { users: ManagedUser[] }) {
  const [dialog, setDialog] = useState<null | "create" | string>(null);
  const editing = users.find((user) => user.id === dialog);

  return (
    <>
      <section className="overflow-hidden rounded-[14px] border border-line bg-card/90 shadow-[0_16px_40px_rgba(0,0,0,0.18)] backdrop-blur-md">
        <div className="flex flex-wrap items-center justify-between gap-4 px-5 py-5">
          <div>
            <p className="text-sm font-medium text-foreground">Contas com acesso</p>
            <p className="mt-1 text-sm text-muted">
              {users.length} {users.length === 1 ? "conta" : "contas"}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setDialog("create")}
            className="rounded-lg bg-accent px-4 py-2.5 text-sm font-medium text-accent-foreground transition-opacity hover:opacity-90"
          >
            Novo usuário
          </button>
        </div>
        <div className="overflow-x-auto md:overflow-hidden">
          <table className="w-full table-fixed border-t border-line text-left text-sm">
            <colgroup>
              <col className="w-[32%]" />
              <col className="w-[28%]" />
              <col className="w-[16%]" />
              <col className="w-[12%]" />
              <col className="w-[12%]" />
            </colgroup>
            <thead className="bg-background text-xs tracking-wide text-muted uppercase">
              <tr>
                <th className="px-4 py-3 font-medium">Nome</th>
                <th className="px-4 py-3 font-medium">E-mail</th>
                <th className="px-4 py-3 font-medium">Páginas</th>
                <th className="px-4 py-3 font-medium">Desde</th>
                <th className="px-4 py-3 text-right font-medium">Ações</th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => (
                <tr key={user.id} className="border-t border-line">
                  <td className="px-4 py-4">
                    <div className="flex min-w-0 items-center gap-3">
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent/15 text-xs font-semibold text-accent">
                        {initials(user.name)}
                      </span>
                      <span className="flex min-w-0 items-center gap-2">
                        <span className="truncate font-medium text-foreground">{user.name}</span>
                        {user.isCurrent ? (
                          <span className="shrink-0 rounded-full bg-accent/10 px-2 py-0.5 text-xs font-medium text-accent">
                            Você
                          </span>
                        ) : null}
                      </span>
                    </div>
                  </td>
                  <td className="truncate px-4 py-4 text-muted">{user.email}</td>
                  <td className="px-4 py-4">
                    <div className="flex flex-wrap gap-1.5">
                      {user.pages.length > 0 ? (
                        NAV_PAGES.filter((page) => user.pages.includes(page.key)).map((page) => (
                          <span
                            key={page.key}
                            className="rounded-full bg-background px-2.5 py-1 text-xs font-medium text-foreground"
                          >
                            {page.label}
                          </span>
                        ))
                      ) : (
                        <span className="text-xs text-muted">Nenhuma</span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-4 whitespace-nowrap text-muted">{user.createdAt || "—"}</td>
                  <td className="px-4 py-4 text-right">
                    <button
                      type="button"
                      onClick={() => setDialog(user.id)}
                      className="rounded-lg border border-line px-3 py-1.5 text-sm font-medium text-foreground transition-colors hover:border-accent hover:text-accent"
                    >
                      Editar
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {dialog === "create" ? (
        <Dialog
          title="Novo usuário"
          description="A senha precisa ter pelo menos 8 caracteres. A sua sessão continua nesta conta."
          onClose={() => setDialog(null)}
        >
          <SignupForm />
        </Dialog>
      ) : null}

      {editing ? (
        <Dialog
          title={`Editar ${editing.name}`}
          description="Escolha as páginas que esta conta pode abrir. Vale no próximo acesso."
          onClose={() => setDialog(null)}
        >
          <UserAccessForm user={{ id: editing.id, pages: editing.pages }} />
        </Dialog>
      ) : null}
    </>
  );
}

function initials(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}
