export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { startRoutineScheduler } = await import("@/lib/routine-scheduler");
    startRoutineScheduler();
    console.info("Agenda de verificação ligada");
  }
}
