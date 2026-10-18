import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { APP_PAGES, type PageKey } from "@/lib/pages";
import { decrypt } from "@/lib/session-token";
import { findUserById, listPageKeysForUser } from "@/lib/users";

export const verifySession = cache(async () => {
  const token = (await cookies()).get("session")?.value;
  const session = await decrypt(token);
  if (!session) redirect("/login");
  return session;
});

export const getCurrentUser = cache(async () => {
  const session = await verifySession();
  const user = await findUserById(session.userId);

  if (!user) redirect("/api/auth/limpar");

  const pages = await listPageKeysForUser(user.id);

  return {
    id: String(user.id),
    name: user.name,
    email: user.email,
    pages,
  };
});

export async function requirePage(pageKey: PageKey) {
  return requireAnyPage(pageKey);
}

export async function requireAnyPage(...pageKeys: PageKey[]) {
  const user = await getCurrentUser();
  if (pageKeys.some((pageKey) => user.pages.includes(pageKey))) return user;

  const nextPage = APP_PAGES.find((page) => user.pages.includes(page.key));
  redirect(nextPage?.href ?? "/sem-acesso");
}
