"use client";

import { useState } from "react";
import { readLogError } from "@/app/actions/logs";
import { Dialog } from "@/app/components/dialog";
import type { ErrorCallRecord, ErrorLogRecord } from "@/lib/error-log";
import { readableFailure } from "@/lib/log-read";

export function LogErrorButton({
  id,
  summary,
  hasJson,
}: {
  id: number;
  summary: string;
  hasJson: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [payload, setPayload] = useState<ErrorLogRecord | null>(null);

  async function show() {
    setOpen(true);
    if (!hasJson || payload) return;
    setPending(true);
    setError("");
    const result = await readLogError(id);
    setPending(false);
    if (result.error || !result.payload) {
      setError(result.error || "Não foi possível abrir o erro.");
      return;
    }
    setPayload(result.payload);
  }

  return (
    <>
      <button type="button" onClick={show} className="mt-2 text-xs font-medium text-accent">
        Ver erro
      </button>
      {open ? (
        <Dialog title="Erro da chamada" description={payload?.codigo === "as_duas" ? "A principal e a reserva falharam." : undefined} onClose={() => setOpen(false)} wide>
          {pending ? <p className="text-sm text-muted">Carregando o JSON...</p> : null}
          {error ? <p className="text-sm text-danger">{error}</p> : null}
          {!pending && !payload ? (
            <section className="flex flex-col gap-2">
              <p className="text-sm text-muted">{summary || "Sem detalhe salvo."}</p>
              <p className="text-sm text-muted">O JSON dessa chamada não foi guardado.</p>
            </section>
          ) : null}
          {payload ? (
            <div className="flex flex-col gap-4">
              {payload.chamadas.map((call, index) => (
                <ErrorBlock key={`${call.papel}-${call.nome}-${index}`} call={call} />
              ))}
            </div>
          ) : null}
        </Dialog>
      ) : null}
    </>
  );
}

function ErrorBlock({ call }: { call: ErrorCallRecord }) {
  const code = readableFailure(call.codigo);
  return (
    <section className="rounded-[12px] border border-line p-4">
      <h3 className="text-sm font-medium text-foreground">
        {roleLabel(call.papel)} · {call.nome}
      </h3>
      <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-xs tracking-wide text-muted uppercase">Código</dt>
          <dd className="mt-1 font-mono text-foreground">{call.codigo}</dd>
          {code && code !== call.codigo ? <dd className="mt-1 text-muted">{code}</dd> : null}
        </div>
        <div>
          <dt className="text-xs tracking-wide text-muted uppercase">HTTP</dt>
          <dd className="mt-1 font-mono text-foreground">{call.http ?? "—"}</dd>
        </div>
      </dl>
      <pre className="mt-3 max-h-80 overflow-auto rounded-[12px] border border-line bg-field p-3 font-mono text-xs leading-5 break-words whitespace-pre-wrap text-foreground">
        {formatBody(call.corpo)}
      </pre>
    </section>
  );
}

function roleLabel(papel: ErrorCallRecord["papel"]) {
  if (papel === "reserva") return "Reserva";
  if (papel === "api") return "API";
  return "Principal";
}

function formatBody(corpo: unknown) {
  if (corpo == null || corpo === "") return "A API não devolveu um corpo.";
  if (typeof corpo === "string") return corpo;
  return JSON.stringify(corpo, null, 2);
}
