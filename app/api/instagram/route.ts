import { lookupInstagramProfile, recordInstagramLookup } from "@/lib/instagram-page";

function json(body: unknown, status: number) {
  return Response.json(body, { status, headers: { "cache-control": "no-store" } });
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  return respond(url.searchParams.get("usuario") || url.searchParams.get("url") || "");
}

export async function POST(request: Request) {
  const raw = await request.text();
  if (raw.length > 2_000) return json({ erro: "payload_invalido", mensagem: "O corpo precisa ser um JSON." }, 400);
  let body: unknown;
  try {
    body = raw ? JSON.parse(raw) : {};
  } catch {
    return json({ erro: "payload_invalido", mensagem: "O corpo precisa ser um JSON." }, 400);
  }
  const record = body && typeof body === "object" && !Array.isArray(body) ? body as Record<string, unknown> : {};
  const value = record.usuario ?? record.url;
  return respond(typeof value === "string" ? value : "");
}

async function respond(raw: string) {
  const result = await lookupInstagramProfile(raw);
  if (!result.ok) return json({ erro: result.erro, mensagem: result.mensagem }, result.status);

  try {
    await recordInstagramLookup(result.usuario, result.existe);
  } catch {
    return json({ erro: "indisponivel", mensagem: "Não foi possível gravar a consulta." }, 500);
  }

  return json({ usuario: `@${result.usuario}`, existe: result.existe }, 200);
}
