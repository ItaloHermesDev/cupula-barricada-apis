import "server-only";
import { getApi } from "@/lib/apis";
import { getBarricade, type BarricadeRecord } from "@/lib/barricades";
import { dayKey } from "@/lib/catalog";
import { joinApiUrl } from "@/lib/draft";
import { execute } from "@/lib/db";
import { logVerification, probeUpstream } from "@/lib/gateway";

export async function setRoutine(id: number, enabled: boolean, intervalMinutes: number) {
  const minutes = clampMinutes(intervalMinutes);
  const current = await getBarricade(id, dayKey());
  await execute(
    "UPDATE barricades SET health_enabled = ?, health_interval_minutes = ? WHERE id = ?",
    [enabled ? 1 : 0, minutes, id],
  );
  if (enabled && !current?.healthEnabled) await checkBarricade(id, { force: true });
}

export async function refreshDueHealth(items: BarricadeRecord[]) {
  const now = Date.now();
  for (const item of items) {
    if (!item.healthEnabled) continue;
    const checked = item.healthCheckedAt ? new Date(item.healthCheckedAt).getTime() : 0;
    if (now - checked < item.healthIntervalMinutes * 60_000) continue;
    await checkBarricade(item.id);
  }
}

function clampMinutes(value: number) {
  const minutes = Math.round(value);
  if (!Number.isFinite(minutes)) return 10;
  return Math.min(1440, Math.max(1, minutes));
}

export async function checkBarricade(id: number, options?: { force?: boolean; scheduled?: boolean }) {
  const barricade = await getBarricade(id, dayKey());
  if (!barricade?.healthEnabled) return;
  const api = await getApi(barricade.apiId);
  if (!api) {
    await saveHealth(id, false, null, "API não encontrada");
    return;
  }
  const minSeconds = options?.force ? 2 : barricade.healthIntervalMinutes * 60;
  if (!(await claimHealth(id, minSeconds))) return;
  if (options?.scheduled) console.info(`Verificação automática: ${barricade.name}`);
  try {
    const preview = await probeUpstream({
      url: joinApiUrl(api.baseUrl, api.endpointPath),
      method: api.method,
      headers: api.headers,
      contentType: api.requestContentType,
      bodyTemplate: api.bodyTemplate,
    });
    const ok = Boolean(preview.status && preview.status >= 200 && preview.status < 300 && !preview.failure);
    const message = detail(preview.status, preview.failure);
    if (preview.failure !== "destino_bloqueado") {
      await logVerification({
        barricadeId: barricade.id,
        barricadeName: barricade.name,
        apiId: api.id,
        apiName: api.name,
        method: api.method,
        providerStatus: preview.status,
        durationMs: preview.durationMs,
        ok,
        detail: message,
      });
    }
    await saveHealth(id, ok, preview.durationMs, message);
  } catch (error) {
    console.error("Falha na verificação da barricada", error);
    await saveHealth(id, false, null, "Não foi possível verificar");
  }
}

async function claimHealth(id: number, minSeconds: number) {
  const result = await execute(
    `UPDATE barricades
     SET health_checked_at = CURRENT_TIMESTAMP
     WHERE id = ? AND health_enabled = 1
       AND (
         health_checked_at IS NULL
         OR TIMESTAMPDIFF(SECOND, health_checked_at, CURRENT_TIMESTAMP) >= ?
       )`,
    [id, minSeconds],
  );
  return result.affectedRows === 1;
}

async function saveHealth(id: number, ok: boolean, latency: number | null, message: string) {
  await execute(
    `UPDATE barricades
     SET health_ok = ?, health_checked_at = CURRENT_TIMESTAMP, health_latency_ms = ?, health_detail = ?
     WHERE id = ?`,
    [ok ? 1 : 0, latency, message.slice(0, 160), id],
  );
}

function detail(status: number | null, failure: string) {
  if (!failure && status && status >= 200 && status < 300) return `HTTP ${status}`;
  const names: Record<string, string> = {
    tempo_esgotado: "Tempo esgotado",
    conexao: "Sem conexão",
    http_5xx: "Erro no provedor",
    http_4xx: "A API recusou",
    destino_bloqueado: "Destino bloqueado",
    redirecionamento: "A API redirecionou",
    resposta_grande: "Resposta grande demais",
  };
  const label = names[failure] || "Falhou";
  return `${label}${status ? ` · HTTP ${status}` : ""}`;
}
