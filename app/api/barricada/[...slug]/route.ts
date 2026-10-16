import { headers } from "next/headers";
import { serveBarricade } from "@/lib/gateway";

async function handle(request: Request, context: { params: Promise<{ slug: string[] }> }) {
  await headers();
  const { slug } = await context.params;
  return serveBarricade(request, slug.map(decodeURIComponent).join("/"));
}

export const GET = handle;
export const POST = handle;
export const PUT = handle;
export const PATCH = handle;
export const DELETE = handle;
export const OPTIONS = handle;
