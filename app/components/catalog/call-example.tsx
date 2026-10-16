"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

export function CallExample({
  method,
  url,
  env,
  fields,
  origins,
  response,
}: {
  method: string;
  url: string;
  env: string;
  fields: { name: string; value: string; jsonName?: string }[];
  origins: string[];
  response: string;
}) {
  const [origin, setOrigin] = useState(origins[0] ?? "");
  const chosen = origins.includes(origin) ? origin : origins[0] ?? "";
  const prompt = buildPrompt({ method, url, env, fields, origin: chosen, response });
  const [copied, setCopied] = useState<"prompt" | "response" | null>(null);

  function copy(kind: "prompt" | "response", value: string) {
    setCopied(kind);
    window.setTimeout(() => setCopied(null), 1600);
    const fallback = () => {
      const area = document.createElement("textarea");
      area.value = value;
      area.setAttribute("readonly", "");
      area.style.position = "fixed";
      area.style.left = "-9999px";
      document.body.appendChild(area);
      area.select();
      document.execCommand("copy");
      area.remove();
    };
    const write = navigator.clipboard?.writeText(value);
    if (!write) {
      fallback();
      return;
    }
    void Promise.race([
      write,
      new Promise((_, reject) => window.setTimeout(() => reject(new Error("timeout")), 400)),
    ]).catch(fallback);
  }

  return (
    <div className="flex flex-col gap-4">
      {origins.length > 0 ? (
        <label className="text-sm text-foreground">
          Origem no prompt
          <select
            value={chosen}
            onChange={(event) => setOrigin(event.target.value)}
            className="mt-1 block w-full max-w-xl rounded-[12px] border border-line bg-background px-3 py-2 text-sm"
          >
            {origins.map((item) => (
              <option key={item} value={item}>{item}</option>
            ))}
          </select>
        </label>
      ) : null}
      <div>
        <p className="text-xs text-muted">Prompt</p>
        <pre className="mt-1 overflow-auto whitespace-pre-wrap rounded-[12px] border border-line bg-background p-3 text-xs leading-5 text-foreground">{prompt}</pre>
        <button type="button" className="mt-2 text-sm text-accent" onClick={() => copy("prompt", prompt)}>
          {copied === "prompt" ? "Prompt copiado" : "Copiar prompt"}
        </button>
      </div>
      <div>
        <p className="text-xs text-muted">JSON devolvido</p>
        <pre className="mt-1 overflow-auto rounded-[12px] border border-line bg-background p-3 text-xs leading-5 text-foreground">{response}</pre>
        <button type="button" className="mt-2 text-sm text-accent" onClick={() => copy("response", response)}>
          {copied === "response" ? "JSON copiado" : "Copiar JSON"}
        </button>
      </div>
    </div>
  );
}

function buildPrompt({
  method,
  url,
  env,
  fields,
  origin,
  response,
}: {
  method: string;
  url: string;
  env: string;
  fields: { name: string; value: string; jsonName?: string }[];
  origin: string;
  response: string;
}) {
  const lines = [
    "Implemente no projeto a chamada desta barricada.",
    "",
    `Crie a variável de ambiente ${env} e grave nela o token. Leia essa variável na requisição. Não escreva o token no código, em arquivo versionado, em log nem neste chat.`,
    "",
    `Método: ${method}`,
    `URL: ${url}`,
    "",
    "Cabeçalhos:",
    `Authorization: Bearer <valor de ${env}>`,
  ];
  if (origin) lines.push(`Origin: ${origin}`, "", `Origin é obrigatório e deve ser exatamente ${origin}.`);
  lines.push("");
  if (fields.length === 0) {
    lines.push("Esta URL não recebe parâmetros.");
  } else {
    lines.push(
      "Parâmetros na URL:",
      "O nome do parâmetro na URL da barricada é o nome do campo no JSON enviado à API. O valor informado na URL é o valor enviado nesse campo.",
    );
    for (const field of fields) {
      const jsonName = field.jsonName && field.jsonName !== field.name ? field.jsonName : field.name;
      const target = `A barricada envia esse valor no campo ${jsonName} do JSON da API.`;
      const fallback = field.value ? ` Se o parâmetro não for enviado, a barricada usa ${field.value}.` : "";
      lines.push(`- ${field.name}: na URL, use ${field.name}={${field.name}}. ${target}${fallback}`);
    }
  }
  lines.push("", "A resposta tem esta forma:", response);
  return lines.join("\n");
}

export function HealthClock({ minutes, enabled }: { minutes: number; enabled: boolean }) {
  const router = useRouter();
  useEffect(() => {
    if (!enabled || minutes < 1) return;
    const id = window.setInterval(() => router.refresh(), minutes * 60_000);
    return () => window.clearInterval(id);
  }, [enabled, minutes, router]);
  return null;
}
