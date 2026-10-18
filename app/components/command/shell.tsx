"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { logout } from "@/app/actions/auth";
import { Icon, Logo, type IconName } from "@/app/components/icons";
import { NAV_PAGES } from "@/lib/pages";

const ICONS: Record<string, IconName> = {
  painel: "overview",
  apis: "activity",
  barricadas: "monitor",
  status: "activity",
  trilha: "analytics",
  historico: "reports",
  usuarios: "users",
};

function titleFor(pathname: string) {
  if (pathname.startsWith("/apis")) return { title: "APIs", crumb: "Cadastro" };
  if (pathname.startsWith("/painel")) return { title: "Painel", crumb: "Desempenho" };
  if (pathname.includes("/logs")) return { title: "Logs", crumb: "Barricada" };
  if (pathname.startsWith("/barricadas")) return { title: "Barricadas", crumb: "Proteção" };
  if (pathname.startsWith("/status")) return { title: "Status", crumb: "Verificação" };
  if (pathname.startsWith("/trilha")) return { title: "Trilha", crumb: "Landpage" };
  if (pathname.startsWith("/historico")) return { title: "Histórico", crumb: "Monitoramento" };
  if (pathname === "/usuarios") return { title: "Usuários", crumb: "Acesso" };
  if (pathname === "/sem-acesso") return { title: "Sem acesso", crumb: "Conta" };
  return { title: "Painel", crumb: "Operações" };
}

export function CommandShell({
  user,
  children,
}: {
  user: { name: string; email: string; pages: string[] };
  children: ReactNode;
}) {
  const pathname = usePathname();
  const page = titleFor(pathname);
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const items = NAV_PAGES.filter((item) => user.pages.includes(item.key));

  useEffect(() => {
    if (window.localStorage.getItem("cb-sidebar") === "collapsed") setCollapsed(true);
  }, []);

  useEffect(() => {
    setMobileOpen(false);
    setAccountOpen(false);
  }, [pathname]);

  function toggleCollapsed() {
    setCollapsed((current) => {
      const next = !current;
      window.localStorage.setItem("cb-sidebar", next ? "collapsed" : "expanded");
      return next;
    });
  }

  return (
    <div className="relative flex min-h-full w-full flex-1">
      <div className="command-atmosphere pointer-events-none absolute inset-0" />
      {mobileOpen ? (
        <button
          type="button"
          aria-label="Fechar menu"
          className="fixed inset-0 z-30 bg-black/60 md:hidden"
          onClick={() => setMobileOpen(false)}
        />
      ) : null}
      <aside
        className={`fixed inset-y-0 left-0 z-40 flex w-64 flex-col border-r border-line bg-sidebar/95 text-sidebar-foreground backdrop-blur-xl transition-[width,transform] duration-200 md:sticky md:top-0 md:z-20 md:h-screen md:translate-x-0 ${
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        } ${collapsed ? "md:w-[76px]" : "md:w-64"}`}
      >
        <div className={`flex items-center gap-3 px-4 py-4 ${collapsed ? "md:justify-center md:px-2" : ""}`}>
          <Logo />
          <div className={`min-w-0 ${collapsed ? "md:hidden" : ""}`}>
            <p className="truncate text-sm font-medium">Cúpula Barricada</p>
            <p className="truncate text-xs text-sidebar-muted">Acesso restrito</p>
          </div>
        </div>
        <nav aria-label="Menu" className="flex flex-1 flex-col gap-1 px-3">
          {items.map((item) => {
            const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
            return (
              <Link
                key={item.key}
                href={item.href}
                aria-current={active ? "page" : undefined}
                title={item.label}
                className={`flex items-center gap-3 rounded-[12px] border px-3 py-2.5 text-sm transition-colors ${
                  collapsed ? "md:justify-center md:px-0" : ""
                } ${
                  active
                    ? "border-[#1f6a86] bg-[#12384a] text-foreground"
                    : "border-transparent text-sidebar-muted hover:border-line hover:bg-white/5 hover:text-foreground"
                }`}
              >
                <Icon name={ICONS[item.key] ?? "overview"} className={active ? "h-4 w-4 text-accent" : "h-4 w-4"} />
                <span className={collapsed ? "md:sr-only" : ""}>{item.label}</span>
              </Link>
            );
          })}
        </nav>
        <div className="border-t border-line p-3">
          <button
            type="button"
            onClick={toggleCollapsed}
            className="mb-3 hidden w-full items-center justify-center gap-2 rounded-[12px] border border-line px-3 py-2 text-xs text-sidebar-muted transition-colors hover:border-accent/40 hover:text-foreground md:flex"
          >
            <Icon name="panel" />
            <span className={collapsed ? "sr-only" : ""}>{collapsed ? "Expandir menu" : "Recolher menu"}</span>
          </button>
          <div className={`flex items-center gap-3 ${collapsed ? "md:justify-center" : ""}`}>
            <Avatar name={user.name} />
            <div className={`min-w-0 flex-1 ${collapsed ? "md:hidden" : ""}`}>
              <p className="truncate text-sm font-medium">{user.name}</p>
              <p className="truncate text-xs text-sidebar-muted">{user.email}</p>
            </div>
          </div>
          <form action={logout} className="mt-3">
            <button
              type="submit"
              title="Sair"
              className={`flex w-full items-center justify-center gap-2 rounded-[12px] border border-line px-3 py-2 text-sm text-sidebar-foreground transition-colors hover:border-accent/40 hover:text-accent ${collapsed ? "md:px-0" : ""}`}
            >
              <Icon name="logout" />
              <span className={collapsed ? "md:sr-only" : ""}>Sair</span>
            </button>
          </form>
        </div>
      </aside>
      <div className="relative flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex items-center justify-between gap-3 border-b border-line/80 bg-[#080B12]/75 px-4 py-3 backdrop-blur-xl md:px-6 lg:px-8">
          <div className="flex min-w-0 items-center gap-3">
            <button
              type="button"
              className="inline-flex h-10 w-10 items-center justify-center rounded-[12px] border border-line text-foreground md:hidden"
              aria-label="Abrir menu"
              onClick={() => setMobileOpen(true)}
            >
              <Icon name="menu" />
            </button>
            <div className="min-w-0">
              <p className="truncate text-[11px] tracking-wide text-muted uppercase">
                Cúpula Barricada <span aria-hidden="true">/</span> {page.crumb}
              </p>
              <h1 className="truncate text-lg font-semibold tracking-tight text-foreground">{page.title}</h1>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <p className="hidden items-center gap-2 rounded-full border border-success/25 bg-success/10 px-3 py-1.5 text-xs text-success sm:flex">
              <span className="pulse-dot h-1.5 w-1.5 rounded-full bg-success" />
              Sessão ativa
            </p>
            <div className="relative">
              <button
                type="button"
                aria-label="Menu do usuário"
                aria-expanded={accountOpen}
                onClick={() => setAccountOpen((open) => !open)}
                className="rounded-full border border-line hover:border-accent/40"
              >
                <Avatar name={user.name} />
              </button>
              {accountOpen ? (
                <div className="absolute right-0 z-30 mt-2 w-64 rounded-[14px] border border-line bg-card p-3 shadow-2xl">
                  <p className="truncate text-sm font-medium">{user.name}</p>
                  <p className="truncate text-xs text-muted">{user.email}</p>
                  <form action={logout} className="mt-3">
                    <button type="submit" className="w-full rounded-[12px] px-2 py-2 text-left text-sm text-foreground hover:bg-white/5">
                      Sair
                    </button>
                  </form>
                </div>
              ) : null}
            </div>
          </div>
        </header>
        <div className="min-w-0 flex-1 px-4 py-5 md:px-6 lg:px-8">{children}</div>
      </div>
    </div>
  );
}

function Avatar({ name }: { name: string }) {
  const initials = name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");

  return (
    <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-[#132033] text-xs font-semibold text-accent shadow-[0_0_12px_rgba(0,229,255,0.18)]">
      {initials}
    </span>
  );
}
