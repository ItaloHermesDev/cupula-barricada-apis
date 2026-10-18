import { readTrackPayload, recordTrackEvent } from "@/lib/track";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

function empty(status: number) {
  return new Response(null, { status, headers: CORS });
}

export async function OPTIONS() {
  return empty(204);
}

export async function POST(request: Request) {
  const raw = await request.text();
  const payload = readTrackPayload(raw);
  if (!payload) return empty(400);

  try {
    const result = await recordTrackEvent(payload);
    if (result === "unknown") return empty(404);
    return empty(204);
  } catch (error) {
    console.error("Falha ao gravar evento da trilha", error);
    return empty(500);
  }
}
