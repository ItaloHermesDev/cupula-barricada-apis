"use server";

import { requirePage } from "@/lib/dal";
import { APP_PAGES, isPageKey, pagesFromForm } from "@/lib/pages";
import {
  countUsersWithPage,
  findUserById,
  listPageKeysForUser,
  replaceUserPages,
} from "@/lib/users";

export type AccessState = {
  error?: string;
  success?: string;
};

export async function updateUserPages(
  _state: AccessState,
  formData: FormData,
): Promise<AccessState> {
  await requirePage("usuarios");

  const userId = String(formData.get("userId") ?? "");
  const numericId = Number(userId);
  if (!Number.isInteger(numericId) || numericId <= 0) {
    return { error: "Usuário inválido." };
  }

  const target = await findUserById(userId);
  if (!target) return { error: "Usuário não encontrado." };

  const selected = pagesFromForm(formData.getAll("pages"));
  const current = await listPageKeysForUser(numericId);
  const hidden = current.filter((key) => isPageKey(key) && APP_PAGES.find((page) => page.key === key)?.nav === false);
  const pages = [...new Set([...selected, ...hidden])];
  const removesUsersPage = current.includes("usuarios") && !pages.includes("usuarios");

  if (removesUsersPage && (await countUsersWithPage("usuarios")) <= 1) {
    return {
      error: "Mantenha Usuários nesta conta. Ela é a última com essa página.",
    };
  }

  try {
    await replaceUserPages(numericId, pages);
  } catch (error) {
    console.error("Falha ao salvar páginas", error);
    return { error: "Não foi possível salvar as páginas agora." };
  }

  const labels = APP_PAGES.filter((page) => page.nav && pages.includes(page.key)).map((page) => page.label);

  return {
    success: labels.length
      ? `Páginas atualizadas: ${labels.join(", ")}.`
      : "Nenhuma página liberada.",
  };
}
