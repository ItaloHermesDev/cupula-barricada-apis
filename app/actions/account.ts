"use server";

import { compare, hash } from "bcryptjs";
import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/dal";
import { findUserAuthById, updateUserPassword, updateUserProfile } from "@/lib/users";
import {
  type AuthState,
  validateAccount,
  validatePasswordChange,
} from "@/lib/validators";

const DUMMY_HASH = "$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy";

function isDuplicate(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "ER_DUP_ENTRY"
  );
}

type AccountFormState = AuthState & {
  name?: string;
  email?: string;
};

function saved(message: string): AuthState {
  return { success: message, revision: crypto.randomUUID() };
}

function keepAccount(state: AccountFormState): AccountFormState {
  return { revision: state.revision, name: state.name, email: state.email };
}

export async function updateAccount(
  state: AccountFormState,
  formData: FormData,
): Promise<AccountFormState> {
  const current = await getCurrentUser();
  const name = String(formData.get("name") ?? "").trim();
  const email = String(formData.get("email") ?? "")
    .trim()
    .toLowerCase();
  const currentPassword = String(formData.get("currentPassword") ?? "");
  const fieldErrors = validateAccount(name, email, currentPassword);

  if (fieldErrors) return { ...keepAccount(state), fieldErrors };

  try {
    const user = await findUserAuthById(current.id);
    const passwordOk = await compare(currentPassword, user?.password_hash ?? DUMMY_HASH);

    if (!user || !passwordOk) {
      return {
        ...keepAccount(state),
        fieldErrors: { currentPassword: "A senha atual não confere." },
      };
    }

    await updateUserProfile(user.id, { name, email });
  } catch (error) {
    if (isDuplicate(error)) {
      return { ...keepAccount(state), fieldErrors: { email: "Este e-mail já está cadastrado." } };
    }

    console.error("Falha ao atualizar a conta", error);
    return { ...keepAccount(state), error: "Não foi possível salvar agora. Tente de novo em instantes." };
  }

  revalidatePath("/", "layout");
  revalidatePath("/usuarios");
  return { ...saved("Dados atualizados."), name, email };
}

export async function updatePassword(state: AuthState, formData: FormData): Promise<AuthState> {
  const current = await getCurrentUser();
  const currentPassword = String(formData.get("currentPassword") ?? "");
  const password = String(formData.get("password") ?? "");
  const confirmation = String(formData.get("confirmation") ?? "");
  const fieldErrors = validatePasswordChange(currentPassword, password, confirmation);

  if (fieldErrors) return { revision: state.revision, fieldErrors };

  try {
    const user = await findUserAuthById(current.id);
    const passwordOk = await compare(currentPassword, user?.password_hash ?? DUMMY_HASH);

    if (!user || !passwordOk) {
      return {
        revision: state.revision,
        fieldErrors: { currentPassword: "A senha atual não confere." },
      };
    }

    if (password === currentPassword) {
      return {
        revision: state.revision,
        fieldErrors: { password: "Escolha uma senha diferente da atual." },
      };
    }

    await updateUserPassword(user.id, await hash(password, 10));
  } catch (error) {
    console.error("Falha ao atualizar a senha", error);
    return {
      revision: state.revision,
      error: "Não foi possível salvar a senha agora. Tente de novo em instantes.",
    };
  }

  return saved("Senha atualizada. Esta sessão continua aberta.");
}
