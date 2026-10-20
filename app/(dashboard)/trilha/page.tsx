import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { createTrackerAction, deleteTrackerAction } from "@/app/actions/track";
import { DeleteButton } from "@/app/components/catalog/fields";
import { PageFallback } from "@/app/components/dashboard-shell";
import { requirePage } from "@/lib/dal";
import { listTrackers } from "@/lib/track";

export const metadata: Metadata = { title: "Trilha" };

export default function TrackPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  return (
    <Suspense fallback={<PageFallback />}>
      <Track searchParams={searchParams} />
    </Suspense>
  );
}

async function Track({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requirePage("trilha");
  const params = await searchParams;
  const error = Array.isArray(params.erro) ? params.erro[0] : params.erro;
  const trackers = await listTrackers();

  return (
    <div className="flex flex-col gap-4">
      <section className="rounded-[14px] border border-line bg-card/90 p-4">
        <h2 className="text-base font-semibold text-foreground">Tag da landpage</h2>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-muted">
          Crie uma tag, cole na landpage e abra a trilha para ver as sessões, as páginas e os botões clicados.
        </p>
        <form action={createTrackerAction} className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end">
          <label className="flex-1 text-sm font-medium text-foreground">
            Nome da página
            <input
              name="nome"
              required
              minLength={2}
              maxLength={80}
              placeholder="Campanha de outubro"
              className="mt-2 w-full rounded-[12px] border border-line bg-background px-3 py-2 text-sm font-normal"
            />
          </label>
          <button type="submit" className="rounded-[12px] bg-accent px-4 py-2 text-sm font-medium text-accent-foreground">
            Criar tag
          </button>
        </form>
        {error === "nome" ? <p className="mt-3 text-sm text-[#ffb3c0]">Dê um nome com pelo menos 2 letras.</p> : null}
        {error === "salvar" ? <p className="mt-3 text-sm text-[#ffb3c0]">Não foi possível criar a tag agora.</p> : null}
        {error === "excluir" ? <p className="mt-3 text-sm text-[#ffb3c0]">Não foi possível excluir a tag agora.</p> : null}
      </section>

      {trackers.length === 0 ? (
        <p className="rounded-[14px] border border-dashed border-line px-4 py-8 text-sm text-muted">
          Nenhuma tag ainda. Crie uma e cole na landpage.
        </p>
      ) : (
        <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(4, minmax(0, 1fr))" }}>
          {trackers.map((tracker) => (
            <article key={tracker.id} className="flex min-w-0 flex-col gap-2 rounded-[12px] border border-line bg-card/90 p-3">
              <h2 className="truncate text-sm font-semibold text-foreground" title={tracker.name}>{tracker.name}</h2>
              <p className="text-xs text-muted">
                {tracker.sessions === 1 ? "1 sessão" : `${tracker.sessions} sessões`}
              </p>
              <div className="mt-auto flex flex-col gap-2">
                <Link
                  href={`/trilha/${tracker.id}`}
                  className="rounded-[10px] bg-accent px-2 py-1.5 text-center text-xs font-medium text-accent-foreground"
                >
                  Abrir trilha
                </Link>
                <DeleteButton
                  action={deleteTrackerAction}
                  id={tracker.id}
                  message={`Excluir ${tracker.name}? Os acessos desta tag também saem.`}
                  className="w-full rounded-[10px] border border-danger/40 px-2 py-1.5 text-center text-xs font-medium text-danger"
                />
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
