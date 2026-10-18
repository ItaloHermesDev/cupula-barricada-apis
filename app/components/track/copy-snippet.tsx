"use client";

import { useState } from "react";

export function CopySnippet({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <pre className="overflow-x-auto rounded-[12px] border border-line bg-background px-3 py-3 font-mono text-xs leading-5 text-foreground">{code}</pre>
      <button
        type="button"
        onClick={copy}
        className="w-fit rounded-[12px] border border-line px-3 py-2 text-sm text-foreground hover:border-accent/40"
      >
        {copied ? "Tag copiada" : "Copiar tag"}
      </button>
    </div>
  );
}
