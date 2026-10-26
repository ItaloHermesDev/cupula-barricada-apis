"use server";

import { requirePage } from "@/lib/dal";
import { profileFailureReport } from "@/lib/profile-report";

export async function generateProfileReport(input: { from: string; to: string; page?: number }) {
  await requirePage("consultas");
  return profileFailureReport({
    from: input.from,
    to: input.to,
    page: input.page,
  });
}
