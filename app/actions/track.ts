"use server";

import { redirect } from "next/navigation";
import { requirePage } from "@/lib/dal";
import { createTracker, deleteTracker } from "@/lib/track";

export async function createTrackerAction(formData: FormData) {
  await requirePage("trilha");
  const name = String(formData.get("nome") ?? "").trim().replace(/\s+/g, " ");
  if (name.length < 2 || name.length > 80) redirect("/trilha?erro=nome");

  try {
    await createTracker(name);
  } catch (error) {
    console.error("Falha ao criar tag da trilha", error);
    redirect("/trilha?erro=salvar");
  }

  redirect("/trilha");
}

export async function deleteTrackerAction(formData: FormData) {
  await requirePage("trilha");
  const id = Number(formData.get("id"));
  if (!Number.isInteger(id) || id <= 0) redirect("/trilha?erro=excluir");

  try {
    await deleteTracker(id);
  } catch (error) {
    console.error("Falha ao excluir tag da trilha", error);
    redirect("/trilha?erro=excluir");
  }

  redirect("/trilha");
}
