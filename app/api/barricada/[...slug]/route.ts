import { headers } from "next/headers";
import { isBarricadeSlug } from "@/lib/barricades";
import { serveBarricade } from "@/lib/gateway";

async function handle(request: Request, context: { params: Promise<{ slug: string[] }> }) {
  await headers();
  const { slug } = await context.params;
  const joined = decodeSlug(slug);
  if (!joined) {
    return Response.json(
      { erro: "nao_encontrada", mensagem: "Barricada não encontrada." },
      { status: 404, headers: { "cache-control": "no-store" } },
    );
  }
  return serveBarricade(request, joined);
}

function decodeSlug(parts: string[]) {
  try {
    const slug = parts.map((part) => decodeURIComponent(part)).join("/");
    return isBarricadeSlug(slug) ? slug : null;
  } catch {
    return null;
  }
}

export const GET = handle;
export const POST = handle;
export const PUT = handle;
export const PATCH = handle;
export const DELETE = handle;
export const OPTIONS = handle;
