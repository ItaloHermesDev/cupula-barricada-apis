import "server-only";
import { listBarricades } from "@/lib/barricades";
import { dayKey } from "@/lib/catalog";
import { checkBarricade } from "@/lib/health";

const timer = globalThis as unknown as {
  routineTimer?: ReturnType<typeof setInterval>;
  routineRunning?: boolean;
};

export function startRoutineScheduler() {
  if (timer.routineTimer) return;
  const tick = async () => {
    if (timer.routineRunning) return;
    timer.routineRunning = true;
    try {
      const items = await listBarricades(dayKey());
      for (const item of items) {
        if (!item.healthEnabled) continue;
        await checkBarricade(item.id, { scheduled: true });
      }
    } catch (error) {
      console.error("Falha na verificação automática", error);
    } finally {
      timer.routineRunning = false;
    }
  };
  void tick();
  timer.routineTimer = setInterval(() => {
    void tick();
  }, 30_000);
}
