export function BarricadeMark({
  id,
  updatedAt,
  size = "sm",
}: {
  id: number;
  updatedAt: Date | string | null;
  size?: "sm" | "md";
}) {
  if (!updatedAt) return null;
  const version = updatedAt instanceof Date ? updatedAt.getTime() : updatedAt;
  const box = size === "md" ? "h-14 w-14" : "h-11 w-11";
  return (
    <img
      src={`/barricadas/${id}/logo?v=${encodeURIComponent(String(version))}`}
      alt=""
      className={`${box} shrink-0 rounded-[12px] border border-line bg-background object-cover`}
    />
  );
}
