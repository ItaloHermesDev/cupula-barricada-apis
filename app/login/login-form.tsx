"use client";

import { useActionState } from "react";
import { login } from "@/app/actions/auth";
import { alertClass, submitClass, TextField } from "@/app/components/text-field";
import type { AuthState } from "@/lib/validators";

const initialState: AuthState = {};

export function LoginForm() {
  const [state, action, pending] = useActionState(login, initialState);

  return (
    <form action={action} className="flex flex-col gap-5">
      {state.error ? (
        <p role="alert" className={alertClass}>
          {state.error}
        </p>
      ) : null}
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
        autoComplete="current-password"
        maxLength={72}
        error={state.fieldErrors?.password}
      />
      <button type="submit" disabled={pending} className={submitClass}>
        {pending ? "Entrando…" : "Entrar"}
      </button>
    </form>
  );
}
