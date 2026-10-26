"use server";

import { requirePage } from "@/lib/dal";
import { readInstagramPage } from "@/lib/instagram-page";

export async function checkInstagramPage(url: string) {
  await requirePage("consultas");
  return readInstagramPage(url);
}
