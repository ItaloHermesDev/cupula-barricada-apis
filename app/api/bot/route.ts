import { botTokenMatches, readBotResult, recordBotResult } from "@/lib/bot-report";

const MESSAGES = {
  nao_autorizado: "Token ausente ou inválido.",
  origem_invalida: "Informe sucesso ou falha do bot de Instagram ou WhatsApp.",
  payload_invalido: "O corpo precisa ser um JSON.",
  sem_chave: "A chave deste endpoint não está configurada.",
};

function json(body: unknown, status: number) {
  return Response.json(body, { status, headers: { "cache-control": "no-store" } });
}

export async function POST(request: Request) {
  if (!process.env.BOT_ORIGEM_TOKEN?.trim()) {
    return json({ erro: "sem_chave", mensagem: MESSAGES.sem_chave }, 503);
  }
  const token = request.headers.get("authorization")?.match(/^Bearer\s+(\S+)$/i)?.[1] ?? "";
  if (!botTokenMatches(token)) return json({ erro: "nao_autorizado", mensagem: MESSAGES.nao_autorizado }, 401);

  const raw = await request.text();
  if (raw.length > 2_000) return json({ erro: "payload_invalido", mensagem: MESSAGES.payload_invalido }, 400);
  let body: unknown;
  try {
    body = raw ? JSON.parse(raw) : {};
  } catch {
    return json({ erro: "payload_invalido", mensagem: MESSAGES.payload_invalido }, 400);
  }
  const record = body && typeof body === "object" && !Array.isArray(body) ? body as Record<string, unknown> : {};
  const result = readBotResult(record.origem);
  if (!result) return json({ erro: "origem_invalida", mensagem: MESSAGES.origem_invalida }, 400);

  try {
    await recordBotResult(result);
    return json({ gravado: true, origem: result }, 201);
  } catch {
    return json({ erro: "indisponivel", mensagem: "Não foi possível gravar o resultado." }, 500);
  }
}
