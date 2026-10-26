"use client";

import { useState, type FormEvent } from "react";
import { checkInstagramPage } from "@/app/actions/instagram-page";

type Check = Awaited<ReturnType<typeof checkInstagramPage>>;

export function PageCheckPanel() {
  const [url, setUrl] = useState("");
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<Check | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    try {
      setResult(await checkInstagramPage(url));
    } catch {
      setResult({ ok: false, mensagem: "Não foi possível ler a página." });
    } finally {
      setPending(false);
    }
  }

  return (
    <section className="rounded-[14px] border border-line bg-card p-4">
      <h2 className="text-base font-semibold text-foreground">Verificar página</h2>
      <p className="mt-2 max-w-3xl text-sm leading-6 text-muted">
        Cole a URL pública do Instagram. A leitura pega o HTML que a página entrega e mostra os textos encontrados.
      </p>
      <form className="mt-4 flex flex-col gap-3 md:flex-row" onSubmit={submit}>
        <label className="min-w-0 flex-1 text-sm text-foreground">
          URL da página
          <input
            type="text"
            inputMode="url"
            required
            maxLength={500}
            value={url}
            onChange={(event) => setUrl(event.target.value)}
            placeholder="https://www.instagram.com/usuario"
            className="mt-2 w-full rounded-[12px] border border-line bg-background px-3 py-2"
          />
        </label>
        <button type="submit" disabled={pending} className="self-end rounded-[12px] bg-accent px-4 py-2 text-sm font-medium text-accent-foreground disabled:opacity-60">
          {pending ? "Lendo..." : "Verificar"}
        </button>
      </form>
      {result ? <PageCheckResult result={result} /> : null}
    </section>
  );
}

function PageCheckResult({ result }: { result: Check }) {
  if (!result.ok) return <p className="mt-4 text-sm text-danger">{result.mensagem}</p>;

  return (
    <div className="mt-4 flex flex-col gap-3">
      <p className="text-sm break-all text-muted">{result.url}</p>
      {result.aviso ? <p className="text-sm text-foreground">{result.aviso}</p> : null}
      {result.texts.length === 0 ? (
        result.aviso ? null : <p className="text-sm text-muted">A página não trouxe texto legível.</p>
      ) : (
        <ol className="flex flex-col gap-2 rounded-[12px] border border-line bg-background p-4 text-sm text-foreground">
          {result.texts.map((text) => (
            <li key={text} className="break-words">{text}</li>
          ))}
        </ol>
      )}
    </div>
  );
}
