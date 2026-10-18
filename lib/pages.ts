export const APP_PAGES = [
  {
    key: "painel",
    href: "/painel",
    label: "Painel",
    description: "Desempenho, cota do dia e chamadas que gastam a API.",
    nav: true,
  },
  {
    key: "barricadas",
    href: "/barricadas",
    label: "Barricadas",
    description: "URL protegida que consulta uma API e devolve os campos escolhidos.",
    nav: true,
  },
  {
    key: "status",
    href: "/status",
    label: "Status",
    description: "Se cada barricada está funcionando, a verificação e uma chamada de teste.",
    nav: true,
  },
  {
    key: "usuarios",
    href: "/usuarios",
    label: "Usuários",
    description: "Criar contas e escolher as páginas de cada pessoa.",
    nav: true,
  },
  {
    key: "apis",
    href: "/apis",
    label: "APIs",
    description: "Cadastrar e testar serviços externos.",
    nav: false,
  },
  {
    key: "historico",
    href: "/historico",
    label: "Histórico",
    description: "Chamadas recebidas, falhas e fallback.",
    nav: false,
  },
] as const;

export const NAV_PAGES = APP_PAGES.filter((page) => page.nav);

export type PageKey = (typeof APP_PAGES)[number]["key"];

export function isPageKey(value: string): value is PageKey {
  return APP_PAGES.some((page) => page.key === value);
}

export function pagesFromForm(values: FormDataEntryValue[]) {
  const selected = new Set(values.map(String));
  return APP_PAGES.filter((page) => selected.has(page.key)).map((page) => page.key);
}
