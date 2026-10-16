"use server";

import { compare, hash } from "bcryptjs";
import { redirect } from "next/navigation";
import { requirePage } from "@/lib/dal";
import { APP_PAGES, pagesFromForm } from "@/lib/pages";
import { createSession, deleteSession } from "@/lib/session";
import { SessionConfigError } from "@/lib/session-token";
import { createUserWithPages, findUserByEmail } from "@/lib/users";
import { type AuthState, validateLogin, validateSignup } from "@/lib/validators";

const DUMMY_HASH = "$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy";

function isDuplicate(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "ER_DUP_ENTRY"
  );
}

export async function login(_state: AuthState, formData: FormData): Promise<AuthState> {
  const email = String(formData.get("email") ?? "")
    .trim()
    .toLowerCase();
  const password = String(formData.get("password") ?? "");
  const fieldErrors = validateLogin(email, password);

  if (fieldErrors) return { fieldErrors };

  try {
    const user = await findUserByEmail(email);
    const passwordOk = await compare(password, user?.password_hash ?? DUMMY_HASH);

    if (!user || !passwordOk) {
      return { error: "E-mail ou senha inválidos." };
    }

    await createSession(String(user.id));
  } catch (error) {
    console.error("Falha no login", error);
    if (error instanceof SessionConfigError) {
      return { error: "O acesso está indisponível no momento." };
    }
    return { error: "Não foi possível entrar agora. Tente de novo em instantes." };
  }

  redirect("/");
}

export async function signup(_state: AuthState, formData: FormData): Promise<AuthState> {
  await requirePage("usuarios");

  const name = String(formData.get("name") ?? "").trim();
  const email = String(formData.get("email") ?? "")
    .trim()
    .toLowerCase();
  const password = String(formData.get("password") ?? "");
  const fieldErrors = validateSignup(name, email, password);

  if (fieldErrors) return { fieldErrors };

  const pages = pagesFromForm(formData.getAll("pages"));

  try {
    const passwordHash = await hash(password, 10);
    await createUserWithPages({ name, email, passwordHash, pages });
  } catch (error) {
    if (isDuplicate(error)) {
      return { fieldErrors: { email: "Este e-mail já está cadastrado." } };
    }

    console.error("Falha no cadastro", error);
    return { error: "Não foi possível criar a conta agora. Tente de novo em instantes." };
  }

  const labels = APP_PAGES.filter((page) => pages.includes(page.key)).map((page) => page.label);
  const access = labels.length > 0 ? labels.join(", ") : "nenhuma página";

  return { success: `Conta de ${name} criada. Páginas liberadas: ${access}.` };
}

export async function logout() {
  await deleteSession();
  redirect("/login");
}
