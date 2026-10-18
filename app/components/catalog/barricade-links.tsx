import Link from "next/link";

const itemClass = "rounded-[12px] border border-line px-3 py-1.5 text-sm text-foreground hover:border-accent/50";

export function BarricadePageLinks({ id }: { id: number }) {
  return (
    <div className="flex gap-2">
      <Link href="/barricadas" className={itemClass}>
        Voltar
      </Link>
      <Link href={`/barricadas/${id}`} className={itemClass}>
        Ver
      </Link>
      <Link href={`/barricadas/${id}/editar`} className={itemClass}>
        Editar
      </Link>
      <Link href={`/barricadas/${id}/logs`} className={itemClass}>
        Logs
      </Link>
    </div>
  );
}
