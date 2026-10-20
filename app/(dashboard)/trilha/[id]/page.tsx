import type { Metadata } from "next";
import Link from "next/link";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { PageFallback } from "@/app/components/dashboard-shell";
import { CopySnippet } from "@/app/components/track/copy-snippet";
import { SessionJourneys, type JourneySession } from "@/app/components/track/session-journeys";
import { formatWhen } from "@/lib/catalog";
import { requirePage } from "@/lib/dal";
import { trackerSnippet } from "@/lib/pixel";
import { getTracker, listTrackEvents, type TrackEventItem } from "@/lib/track";

export const metadata: Metadata = { title: "Trilha" };

export default function TrackerPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <Suspense fallback={<PageFallback />}>
      <Tracker params={params} />
    </Suspense>
  );
}

function eventLabel(eventType: string) {
  if (eventType === "pagina") return "Página";
  if (eventType === "clique") return "Clique";
  return eventType;
}

function sessionsOf(events: TrackEventItem[]): JourneySession[] {
  const groups = new Map<string, TrackEventItem[]>();
  for (const event of events) {
    const current = groups.get(event.sessionId);
    if (current) current.push(event);
    else groups.set(event.sessionId, [event]);
  }
  return [...groups.values()].map((items) => {
    const steps = [...items].reverse();
    return {
      sessionId: steps[0].sessionId,
      startedAt: formatWhen(steps[0].createdAt),
      steps: steps.map((event) => ({
        id: event.id,
        when: formatWhen(event.createdAt),
        label: eventLabel(event.eventType),
        url: event.pageUrl,
        button: event.buttonText,
      })),
    };
  });
}

async function requestOrigin() {
  const incoming = await headers();
  const host = incoming.get("x-forwarded-host") ?? incoming.get("host") ?? "localhost:3000";
  const proto = incoming.get("x-forwarded-proto") ?? (host.startsWith("localhost") || host.startsWith("127.0.0.1") ? "http" : "https");
  return `${proto}://${host}`;
}

async function Tracker({ params }: { params: Promise<{ id: string }> }) {
  await requirePage("trilha");
  const { id } = await params;
  const numericId = Number(id);
  const tracker = await getTracker(numericId);
  if (!tracker) notFound();
  const [origin, events] = await Promise.all([requestOrigin(), listTrackEvents(tracker.id)]);
  const sessions = sessionsOf(events);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link href="/trilha" className="text-sm text-accent underline-offset-2 hover:underline">Voltar</Link>
          <h2 className="mt-1 text-base font-semibold text-foreground">{tracker.name}</h2>
          <p className="mt-1 text-sm text-muted">
            {tracker.sessions === 1 ? "1 sessão" : `${tracker.sessions} sessões`}
          </p>
        </div>
      </div>

      <section className="rounded-[14px] border border-line bg-card/90 p-4">
        <h3 className="text-sm font-medium text-foreground">Tag</h3>
        <div className="mt-3">
          <CopySnippet code={trackerSnippet(origin, tracker.publicKey)} />
        </div>
        <p className="mt-3 text-sm leading-6 text-muted">
          Cole a tag na landpage. Ela registra a visita e acrescenta <span className="text-foreground">utm_trilha</span> com o id da sessão na URL, sem recarregar a página.
        </p>
        <p className="mt-2 text-sm text-muted">
          <a className="text-accent underline-offset-2 hover:underline" href={`/api/trilha/exemplo?c=${tracker.publicKey}`} target="_blank" rel="noreferrer">
            Abrir página de teste
          </a>
        </p>
      </section>

      {sessions.length === 0 ? (
        <p className="rounded-[14px] border border-dashed border-line px-4 py-8 text-sm text-muted">
          Nenhum acesso nesta tag ainda.
        </p>
      ) : (
        <SessionJourneys sessions={sessions} />
      )}
    </div>
  );
}
