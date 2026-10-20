"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { runBarricadeSample, toggleRoutine, type BarricadeSampleState } from "@/app/actions/catalog";
import { BarricadeMark } from "@/app/components/catalog/barricade-mark";
import { fieldClass } from "@/app/components/catalog/fields";
import { Dialog } from "@/app/components/dialog";

export type BarricadeOpsRow = {
  id: number;
  name: string;
  statusLabel: string;
  statusTone: "muted" | "success" | "warning" | "danger";
  healthEnabled: boolean;
  interval: number;
  logoVersion: string | null;
  fallbackName: string | null;
  fields: { name: string; value: string; required: boolean }[];
};

const toneClass = {
  muted: "text-muted",
  success: "text-success",
  warning: "text-warning",
  danger: "text-danger",
};

const emptySample: BarricadeSampleState = {};

export function BarricadeOps({ rows }: { rows: BarricadeOpsRow[] }) {
  const [openId, setOpenId] = useState<number | null>(null);
  const open = rows.find((row) => row.id === openId) ?? null;

  return (
    <section className="relative flex flex-col gap-3">
      <ul className="flex flex-col gap-2">
        {rows.map((row) => (
          <li key={row.id} className="flex flex-wrap items-center gap-3 rounded-[14px] border border-line bg-card px-4 py-3">
            {row.logoVersion ? (
              <BarricadeMark id={row.id} updatedAt={row.logoVersion} />
            ) : (
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[12px] border border-line bg-background text-sm font-medium text-muted">
                {row.name.slice(0, 1).toUpperCase()}
              </span>
            )}
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-foreground">{row.name}</p>
              <p className={`text-xs ${toneClass[row.statusTone]}`}>{row.statusLabel}</p>
              {row.fallbackName ? <p className="truncate text-xs text-muted">Reserva: {row.fallbackName}</p> : null}
            </div>
            <form action={toggleRoutine}>
              <input type="hidden" name="id" value={row.id} />
              <input type="hidden" name="interval" value={row.interval} />
              <button type="submit" name="enabled" value={row.healthEnabled ? "0" : "1"} className="rounded-[12px] border border-line px-3 py-2 text-sm text-foreground">
                {row.healthEnabled ? "Desligar verificação" : "Ativar verificação"}
              </button>
            </form>
            <Link href={`/barricadas/${row.id}/logs`} className="rounded-[12px] border border-line px-3 py-2 text-sm text-foreground">
              Logs
            </Link>
            <button type="button" onClick={() => setOpenId(row.id)} className="rounded-[12px] border border-line px-3 py-2 text-sm text-foreground">
              Chamar
            </button>
          </li>
        ))}
      </ul>
      {open ? (
        <Dialog
          wide
          title={open.name}
          description="Preencha os campos da chamada para ver o resultado da barricada e de cada API."
          onClose={() => setOpenId(null)}
        >
          <SampleForm key={open.id} row={open} />
        </Dialog>
      ) : null}
    </section>
  );
}

function JsonBlock({ text }: { text: string }) {
  const parsed = parseJson(text);
  if (!parsed.ok) {
    return (
      <pre className="mt-2 max-h-80 overflow-auto whitespace-pre-wrap break-all rounded-[12px] border border-line bg-background p-3 font-mono text-xs leading-5 text-foreground">
        {text}
      </pre>
    );
  }
  return (
    <div className="mt-2 max-h-80 overflow-auto rounded-[12px] border border-line bg-background p-3 font-mono text-xs leading-6">
      <JsonNode value={parsed.value} depth={0} />
    </div>
  );
}

function parseJson(text: string): { ok: true; value: unknown } | { ok: false } {
  const trimmed = text.trim();
  if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) return { ok: false };
  try {
    return { ok: true, value: JSON.parse(trimmed) as unknown };
  } catch {
    return { ok: false };
  }
}

function JsonNode({ value, depth }: { value: unknown; depth: number }) {
  if (value === null) return <span className="text-muted">null</span>;
  if (typeof value === "boolean") return <span className="text-success">{value ? "true" : "false"}</span>;
  if (typeof value === "number") return <span className="text-accent">{String(value)}</span>;
  if (typeof value === "string") return <JsonString value={value} />;
  if (Array.isArray(value)) return <JsonList values={value} depth={depth} />;
  if (typeof value === "object") return <JsonObject value={value as Record<string, unknown>} depth={depth} />;
  return <span>{String(value)}</span>;
}

function JsonString({ value }: { value: string }) {
  if (/^https?:\/\//i.test(value)) {
    return (
      <a href={value} target="_blank" rel="noreferrer" className="break-all text-accent underline decoration-accent/40 underline-offset-2">
        {value}
      </a>
    );
  }
  return <span className="break-all text-foreground">&quot;{value}&quot;</span>;
}

function JsonObject({ value, depth }: { value: Record<string, unknown>; depth: number }) {
  const entries = Object.entries(value);
  const [open, setOpen] = useState(depth < 2);
  if (entries.length === 0) return <span className="text-muted">{"{}"}</span>;
  return (
    <div>
      {depth >= 2 ? (
        <button type="button" onClick={() => setOpen((current) => !current)} className="text-muted">
          {open ? "ocultar" : `mostrar ${entries.length}`}
        </button>
      ) : null}
      {open ? (
        <div className={depth > 0 ? "mt-1 ml-3 border-l border-line pl-3" : ""}>
          {entries.map(([key, item]) => (
            <div key={key} className="py-0.5">
              <span className="text-violet">{key}</span>
              <span className="text-muted">: </span>
              <JsonNode value={item} depth={depth + 1} />
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function JsonList({ values, depth }: { values: unknown[]; depth: number }) {
  const [open, setOpen] = useState(depth < 2);
  if (values.length === 0) return <span className="text-muted">[]</span>;
  return (
    <div>
      {depth >= 2 ? (
        <button type="button" onClick={() => setOpen((current) => !current)} className="text-muted">
          {open ? "ocultar" : `mostrar ${values.length}`}
        </button>
      ) : null}
      {open ? (
        <div className={depth > 0 ? "mt-1 ml-3 border-l border-line pl-3" : ""}>
          {values.map((item, index) => (
            <div key={index} className="py-0.5">
              <span className="text-muted">{index}: </span>
              <JsonNode value={item} depth={depth + 1} />
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function SampleForm({ row }: { row: BarricadeOpsRow }) {
  const [state, action, pending] = useActionState(runBarricadeSample, emptySample);

  return (
    <form action={action} className="mt-4 flex flex-col gap-4">
      <input type="hidden" name="id" value={row.id} />
      {row.fields.length === 0 ? (
        <p className="text-sm text-muted">Esta barricada não pede campos na chamada.</p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {row.fields.map((field) => (
            <label key={field.name} className="text-sm text-foreground">
              {field.name}
              {" *"}
              <input name={`param_${field.name}`} defaultValue={field.value} required className={fieldClass} />
            </label>
          ))}
        </div>
      )}
      {state.error ? <p className="text-sm text-danger">{state.error}</p> : null}
      <button type="submit" disabled={pending} className="self-start rounded-[12px] bg-accent px-4 py-2 text-sm font-medium text-accent-foreground disabled:opacity-60">
        {pending ? "Chamando..." : "Chamar barricada"}
      </button>
      {state.total ? (
        <div className="flex flex-col gap-3">
          {state.notice ? <p className="text-sm text-foreground">{state.notice}</p> : null}
          <div>
            <h3 className="text-sm font-medium text-foreground">Resultado da barricada</h3>
            <JsonBlock text={state.total} />
          </div>
          {(state.apis ?? []).map((api, index) => (
            <div key={`${api.name}-${index}`}>
              <h3 className="text-sm font-medium text-foreground">{api.name}</h3>
              <p className="mt-1 text-xs break-words text-muted">{api.status}</p>
              <JsonBlock text={api.body} />
            </div>
          ))}
        </div>
      ) : null}
    </form>
  );
}
