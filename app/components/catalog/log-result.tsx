import { logResult } from "@/lib/log-read";

export function LogResult({ outcome, failure }: { outcome: string; failure?: string | null }) {
  const result = logResult(outcome, failure);
  return (
    <span className={`inline-flex rounded-[10px] border px-2 py-1 text-xs font-medium whitespace-nowrap ${result.className}`}>
      {result.label}
    </span>
  );
}
