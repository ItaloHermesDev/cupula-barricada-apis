import { pixelSource } from "@/lib/pixel";

export async function GET() {
  return new Response(pixelSource(), {
    headers: {
      "Content-Type": "application/javascript; charset=utf-8",
      "Cache-Control": "public, max-age=300",
      "Access-Control-Allow-Origin": "*",
    },
  });
}
