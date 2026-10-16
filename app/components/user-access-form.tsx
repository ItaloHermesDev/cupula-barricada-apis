"use client";

import { useActionState } from "react";
import { updateUserPages, type AccessState } from "@/app/actions/users";
import { PageCheckboxes } from "@/app/components/page-checkboxes";
import { alertClass, submitClass, successClass } from "@/app/components/text-field";

const initialState: AccessState = {};

export function UserAccessForm({
  user,
}: {
  user: {
    id: string;
    pages: string[];
  };
}) {
  const [state, action, pending] = useActionState(updateUserPages, initialState);

  return (
    <form action={action} className="flex flex-col gap-4">
      <input type="hidden" name="userId" value={user.id} />
      <div key={user.pages.join("|") || "nenhuma"}>
        <PageCheckboxes idPrefix={`user-${user.id}`} selected={user.pages} />
      </div>
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
      <button
        type="submit"
        disabled={pending}
        className={submitClass}
      >
        {pending ? "Salvando…" : "Salvar páginas"}
      </button>
    </form>
  );
}
