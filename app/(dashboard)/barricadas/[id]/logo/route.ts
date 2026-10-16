import { requirePage } from "@/lib/dal";
import { getBarricadeLogo } from "@/lib/barricades";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  await requirePage("barricadas");
  const { id } = await context.params;
  const numericId = Number(id);
  if (!Number.isInteger(numericId) || numericId < 1) return new Response(null, { status: 404 });
  const logo = await getBarricadeLogo(numericId);
  if (!logo) return new Response(null, { status: 404 });
  return new Response(new Uint8Array(logo.image), {
    headers: {
      "Content-Type": logo.mime,
      "Cache-Control": "private, max-age=60",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
