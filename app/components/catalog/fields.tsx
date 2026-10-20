"use client";

import { useState } from "react";
import type { AcceptedParam, FieldPair } from "@/lib/catalog";

const inputClass =
  "mt-1 w-full rounded-[12px] border border-line bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-accent";

export function FieldList({
  title,
  hint,
  prefix,
  rows,
}: {
  title: string;
  hint: string;
  prefix: string;
  rows: FieldPair[];
}) {
  const [items, setItems] = useState<FieldPair[]>(rows.length > 0 ? rows : []);

  return (
    <fieldset className="rounded-[14px] border border-line p-4">
      <legend className="px-1 text-sm font-medium text-foreground">{title}</legend>
      <p className="mb-3 text-xs leading-5 text-muted">{hint}</p>
      <div className="flex flex-col gap-2">
        {items.map((item, index) => (
          <div key={`${prefix}-${index}`} className="grid gap-2 sm:grid-cols-[1fr_1.4fr_auto]">
            <input name={`${prefix}_key`} defaultValue={item.name} placeholder="Nome" className={inputClass} />
            <input name={`${prefix}_value`} defaultValue={item.value} placeholder="Valor ou {{consumer.query.nome}}" className={inputClass} />
            <button type="button" className="text-sm text-muted hover:text-foreground" onClick={() => setItems((current) => current.filter((_, itemIndex) => itemIndex !== index))}>
              Remover
            </button>
          </div>
        ))}
      </div>
      <button type="button" className="mt-3 text-sm text-accent" onClick={() => setItems((current) => [...current, { name: "", value: "" }])}>
        Adicionar
      </button>
    </fieldset>
  );
}

export function ParamList({ rows }: { rows: AcceptedParam[] }) {
  const [items, setItems] = useState<AcceptedParam[]>(rows);

  return (
    <fieldset className="rounded-[14px] border border-line p-4">
      <legend className="px-1 text-sm font-medium text-foreground">Parâmetros aceitos do consumidor</legend>
      <p className="mb-3 text-xs leading-5 text-muted">
        Só estes nomes entram na chamada. Use {"{{consumer.query.nome}}"} na API para enviá-los ao serviço externo.
      </p>
      <div className="flex flex-col gap-2">
        {items.map((item, index) => (
          <div key={`param-${index}`} className="grid items-center gap-2 sm:grid-cols-[1fr_auto_auto]">
            <input name="param_key" defaultValue={item.name} placeholder="nome" className={inputClass} />
            <label className="flex items-center gap-2 text-sm text-muted">
              <input type="hidden" name="param_required" value={item.required ? "1" : "0"} />
              <input
                type="checkbox"
                checked={item.required}
                onChange={(event) =>
                  setItems((current) => current.map((param, paramIndex) => (paramIndex === index ? { ...param, required: event.target.checked } : param)))
                }
              />
              Obrigatório
            </label>
            <button type="button" className="text-sm text-muted" onClick={() => setItems((current) => current.filter((_, itemIndex) => itemIndex !== index))}>
              Remover
            </button>
          </div>
        ))}
      </div>
      <button type="button" className="mt-3 text-sm text-accent" onClick={() => setItems((current) => [...current, { name: "", required: false }])}>
        Adicionar parâmetro
      </button>
    </fieldset>
  );
}

export function HeaderAllowList({ rows }: { rows: string[] }) {
  const [items, setItems] = useState(rows);

  return (
    <fieldset className="rounded-[14px] border border-line p-4">
      <legend className="px-1 text-sm font-medium text-foreground">Cabeçalhos permitidos</legend>
      <p className="mb-3 text-xs leading-5 text-muted">Cabeçalhos do consumidor que podem ser lidos em {"{{consumer.header.nome}}"}.</p>
      {items.map((item, index) => (
        <div key={`header-${index}`} className="mt-2 flex gap-2">
          <input name="allowed_header" defaultValue={item} placeholder="x-cliente" className={inputClass} />
          <button type="button" className="text-sm text-muted" onClick={() => setItems((current) => current.filter((_, itemIndex) => itemIndex !== index))}>
            Remover
          </button>
        </div>
      ))}
      <button type="button" className="mt-3 text-sm text-accent" onClick={() => setItems((current) => [...current, ""])}>
        Adicionar cabeçalho
      </button>
    </fieldset>
  );
}

export const fieldClass = inputClass;

export function DeleteButton({
  action,
  id,
  message,
  className,
}: {
  action: (formData: FormData) => Promise<void>;
  id: number;
  message: string;
  className?: string;
}) {
  return (
    <form
      className="w-full"
      action={action}
      onSubmit={(event) => {
        if (!window.confirm(message)) event.preventDefault();
      }}
    >
      <input type="hidden" name="id" value={id} />
      <button type="submit" className={className ?? "text-sm text-danger"}>
        Excluir
      </button>
    </form>
  );
}
