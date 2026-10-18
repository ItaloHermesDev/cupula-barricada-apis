import { exampleHtml, TRACKER_KEY } from "@/lib/pixel";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const key = url.searchParams.get("c") ?? "";
  if (!TRACKER_KEY.test(key)) {
    return new Response("Chave da tag inválida.", {
      status: 400,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }

  return new Response(exampleHtml(url.origin, key), {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}
