"use client";

export default function DashboardError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="rounded-[14px] border border-danger/30 bg-danger/10 p-5">
      <h2 className="text-base font-medium text-foreground">Não foi possível abrir esta tela</h2>
      <p className="mt-2 text-sm leading-6 text-muted">
        O console encontrou um erro ao montar a página. Os dados de demonstração não foram alterados.
      </p>
      <button
        type="button"
        onClick={reset}
        className="mt-4 h-10 rounded-[12px] bg-accent px-4 text-sm font-medium text-accent-foreground"
      >
        Tentar de novo
      </button>
    </div>
  );
}
