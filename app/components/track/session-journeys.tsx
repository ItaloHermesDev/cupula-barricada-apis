"use client";

import { useState } from "react";
import { Dialog } from "@/app/components/dialog";

export type JourneyStep = {
  id: string;
  when: string;
  label: string;
  url: string;
  button: string | null;
};

export type JourneySession = {
  sessionId: string;
  startedAt: string;
  steps: JourneyStep[];
};

export function SessionJourneys({ sessions }: { sessions: JourneySession[] }) {
  const [openId, setOpenId] = useState<string | null>(null);
  const open = sessions.find((session) => session.sessionId === openId) ?? null;

  return (
    <>
      <div className="flex flex-col gap-2">
        {sessions.map((session) => (
          <button
            key={session.sessionId}
            type="button"
            onClick={() => setOpenId(session.sessionId)}
            className="flex items-center justify-between gap-3 rounded-[12px] border border-line bg-card/90 px-3 py-2 text-left hover:border-accent/40"
          >
            <span className="min-w-0">
              <span className="block truncate font-mono text-xs text-foreground">{session.sessionId}</span>
              <span className="mt-0.5 block text-xs text-muted">
                {session.startedAt} · {session.steps.length === 1 ? "1 passo" : `${session.steps.length} passos`}
              </span>
            </span>
            <span className="shrink-0 text-sm text-accent">Ver jornada</span>
          </button>
        ))}
      </div>
      {open ? (
        <Dialog
          title="Jornada"
          description={`${open.startedAt} · ${open.sessionId}`}
          onClose={() => setOpenId(null)}
          wide
        >
          <ol className="flex flex-col gap-3">
            {open.steps.map((step, index) => (
              <li key={step.id} className="flex gap-3">
                <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-line text-xs text-muted">
                  {index + 1}
                </span>
                <span className="min-w-0">
                  <span className="block text-sm text-foreground">
                    {step.label}
                    {step.button ? ` · ${step.button}` : ""}
                  </span>
                  <span className="mt-0.5 block truncate text-xs text-muted" title={step.url}>{step.url}</span>
                  <span className="mt-0.5 block text-xs text-muted">{step.when}</span>
                </span>
              </li>
            ))}
          </ol>
        </Dialog>
      ) : null}
    </>
  );
}
