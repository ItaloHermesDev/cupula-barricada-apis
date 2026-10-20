"use client";

import { useActionState } from "react";
import { updateAccount, updatePassword } from "@/app/actions/account";
import { alertClass, submitClass, successClass, TextField } from "@/app/components/text-field";
import type { AuthState } from "@/lib/validators";

const initialState: AuthState = {};
const initialAccountState: AuthState & { name?: string; email?: string } = {};

const cardClass =
  "rounded-[14px] border border-line bg-card p-5";

export function AccountForms({ name, email }: { name: string; email: string }) {
  return (
    <>
      <ProfileForm name={name} email={email} />
      <PasswordForm />
    </>
  );
}

function ProfileForm({ name, email }: { name: string; email: string }) {
  const [state, action, pending] = useActionState<
    AuthState & { name?: string; email?: string },
    FormData
  >(updateAccount, initialAccountState);

  return (
    <section className={cardClass}>
      <h2 className="text-sm font-medium text-foreground">Seus dados</h2>
      <p className="mt-1 text-sm text-muted">
        Nome e e-mail desta conta. A senha atual confirma a alteração.
      </p>
      <form key={state.revision ?? "dados"} action={action} className="mt-5 flex flex-col gap-5">
        {state.error ? (
          <p role="alert" className={alertClass}>
            {state.error}
          </p>
        ) : null}
        {state.success ? (
          <p role="status" className={successClass}>
            {state.success}
          </p>
        ) : null}
        <TextField
          id="account-name"
          name="name"
          label="Nome"
          type="text"
          autoComplete="name"
          maxLength={120}
          defaultValue={state.name ?? name}
          error={state.fieldErrors?.name}
        />
        <TextField
          id="account-email"
          name="email"
          label="E-mail"
          type="email"
          autoComplete="email"
          maxLength={255}
          defaultValue={state.email ?? email}
          error={state.fieldErrors?.email}
        />
        <TextField
          id="account-current-password"
          name="currentPassword"
          label="Senha atual"
          type="password"
          autoComplete="current-password"
          maxLength={72}
          error={state.fieldErrors?.currentPassword}
        />
        <button type="submit" disabled={pending} className={submitClass}>
          {pending ? "Salvando…" : "Salvar dados"}
        </button>
      </form>
    </section>
  );
}

function PasswordForm() {
  const [state, action, pending] = useActionState(updatePassword, initialState);

  return (
    <section className={cardClass}>
      <h2 className="text-sm font-medium text-foreground">Senha</h2>
      <p className="mt-1 text-sm text-muted">
        A nova senha precisa ter pelo menos 8 caracteres.
      </p>
      <form
        key={state.revision ?? "senha"}
        action={action}
        className="mt-5 flex flex-col gap-5"
      >
        {state.error ? (
          <p role="alert" className={alertClass}>
            {state.error}
          </p>
        ) : null}
        {state.success ? (
          <p role="status" className={successClass}>
            {state.success}
          </p>
        ) : null}
        <TextField
          id="password-current"
          name="currentPassword"
          label="Senha atual"
          type="password"
          autoComplete="current-password"
          maxLength={72}
          error={state.fieldErrors?.currentPassword}
        />
        <TextField
          id="password-new"
          name="password"
          label="Nova senha"
          type="password"
          autoComplete="new-password"
          maxLength={72}
          error={state.fieldErrors?.password}
        />
        <TextField
          id="password-confirmation"
          name="confirmation"
          label="Confirmar nova senha"
          type="password"
          autoComplete="new-password"
          maxLength={72}
          error={state.fieldErrors?.confirmation}
        />
        <button type="submit" disabled={pending} className={submitClass}>
          {pending ? "Salvando…" : "Salvar senha"}
        </button>
      </form>
    </section>
  );
}
