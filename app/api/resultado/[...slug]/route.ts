import { isBarricadeSlug } from "@/lib/barricades";
import { readDisplaySource, recordDisplaySource } from "@/lib/source-report";

const MESSAGES = {
  nao_encontrada: "Barricada não encontrada.",
  inativa: "Esta barricada está inativa.",
  nao_autorizado: "Token ausente ou inválido.",
  origem_invalida: "Informe origem barricada ou externo.",
  payload_invalido: "O corpo precisa ser um JSON.",
};

function json(body: unknown, status: number) {
  return Response.json(body, { status, headers: { "cache-control": "no-store" } });
}

function decodeSlug(parts: string[]) {
  try {
    const slug = parts.map((part) => decodeURIComponent(part)).join("/");
    return isBarricadeSlug(slug) ? slug : null;
  } catch {
    return null;
  }
}

export async function POST(request: Request, context: { params: Promise<{ slug: string[] }> }) {
  const { slug: parts } = await context.params;
  const slug = decodeSlug(parts);
  if (!slug) return json({ erro: "nao_encontrada", mensagem: MESSAGES.nao_encontrada }, 404);

  const raw = await request.text();
  if (raw.length > 2_000) return json({ erro: "payload_invalido", mensagem: MESSAGES.payload_invalido }, 400);
  let body: unknown;
  try {
    body = raw ? JSON.parse(raw) : {};
  } catch {
    return json({ erro: "payload_invalido", mensagem: MESSAGES.payload_invalido }, 400);
  }
  const record = body && typeof body === "object" && !Array.isArray(body) ? body as Record<string, unknown> : {};
  const source = readDisplaySource(record.origem);
  if (!source) return json({ erro: "origem_invalida", mensagem: MESSAGES.origem_invalida }, 400);

  const token = request.headers.get("authorization")?.match(/^Bearer\s+(\S+)$/i)?.[1] ?? "";
  try {
    const result = await recordDisplaySource(slug, token, source);
    if ("error" in result) {
      const status = result.error === "nao_encontrada" ? 404 : result.error === "nao_autorizado" ? 401 : 403;
      return json({ erro: result.error, mensagem: MESSAGES[result.error] }, status);
    }
    return json({ gravado: true, origem: result.origem }, 201);
  } catch {
    return json({ erro: "indisponivel", mensagem: "Não foi possível gravar o resultado." }, 500);
  }
}
