"use client";

import { useActionState } from "react";
import { signup } from "@/app/actions/auth";
import { PageCheckboxes } from "@/app/components/page-checkboxes";
import { alertClass, submitClass, successClass, TextField } from "@/app/components/text-field";
import type { AuthState } from "@/lib/validators";

const initialState: AuthState = {};

export function SignupForm() {
  const [state, action, pending] = useActionState(signup, initialState);

  return (
    <form key={state.success ?? "nova-conta"} action={action} className="flex flex-col gap-5">
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
        id="name"
        name="name"
        label="Nome"
        type="text"
        autoComplete="name"
        maxLength={120}
        error={state.fieldErrors?.name}
      />
      <TextField
        id="email"
        name="email"
        label="E-mail"
        type="email"
        autoComplete="email"
        maxLength={255}
        error={state.fieldErrors?.email}
      />
      <TextField
        id="password"
        name="password"
        label="Senha"
        type="password"
        autoComplete="new-password"
        maxLength={72}
        error={state.fieldErrors?.password}
      />
      <PageCheckboxes idPrefix="nova-conta" />
      <button type="submit" disabled={pending} className={submitClass}>
        {pending ? "Criando conta…" : "Criar conta"}
      </button>
    </form>
  );
}
