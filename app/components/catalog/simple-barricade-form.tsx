"use client";

import Link from "next/link";
import { useActionState, useMemo, useState, type ChangeEvent } from "react";
import { renewToken, saveSimpleBarricade } from "@/app/actions/catalog";
import { fieldClass } from "@/app/components/catalog/fields";
import { alertClass, submitClass, successClass } from "@/app/components/text-field";
import { HTTP_METHODS, type CatalogState, type HttpMethod } from "@/lib/catalog";
import { flattenJson, selectionFromTemplate, type Leaf, type OpenField } from "@/lib/draft";

const initialState: CatalogState = {};

type HeaderDraft = { name: string; value: string; keep: boolean };

type Chosen = { on: boolean; name: string };

export type SimpleDraft = {
  barricadeId?: number;
  apiId?: number;
  name: string;
  apiUrl: string;
  apiMethod: HttpMethod;
  bodyMode: "none" | "json" | "form";
  headers: HeaderDraft[];
  fields: OpenField[];
  jsonBody: string;
  slug: string;
  origins: string;
  dailyLimit: number;
  responseTemplate: string;
  fallbackId: number | null;
  active: boolean;
  tokenPrefix?: string;
  logoUpdatedAt?: Date | string | null;
};

export function SimpleBarricadeForm({
  draft,
  alternatives,
  endpoint,
}: {
  draft: SimpleDraft;
  alternatives: { id: number; name: string }[];
  endpoint: string;
}) {
  const [saveState, saveAction, saving] = useActionState(saveSimpleBarricade, initialState);
  const [pingState, setPingState] = useState<CatalogState>({});
  const [pinging, setPinging] = useState(false);
  const [bodyMode, setBodyMode] = useState(draft.bodyMode);
  const [headers, setHeaders] = useState<HeaderDraft[]>(draft.headers.length > 0 ? draft.headers : [{ name: "", value: "", keep: false }]);
  const [fields, setFields] = useState<OpenField[]>(draft.fields.length > 0 ? draft.fields : [{ name: "", value: "", open: false }]);
  const [slug, setSlug] = useState(draft.slug);
  const [slugTouched, setSlugTouched] = useState(Boolean(draft.slug));
  const [chosen, setChosen] = useState<Record<string, Chosen>>(() => chosenFrom(draft.responseTemplate));
  const [leaves, setLeaves] = useState<Leaf[]>([]);
  const [appliedPing, setAppliedPing] = useState("");

  const pingBody = pingState.preview?.responseBody ?? "";
  if (pingBody && pingBody !== appliedPing && (pingState.preview?.status ?? 500) < 400) {
    setAppliedPing(pingBody);
    try {
      setLeaves(flattenJson(JSON.parse(pingBody) as unknown));
    } catch {
      setLeaves([]);
    }
  }

  const template = useMemo(() => templateFromChosen(chosen), [chosen]);
  const rows = leaves.length > 0 ? leaves : selectionFromTemplate(draft.responseTemplate).map((item) => ({ path: item.path, sample: "" }));
  const publicPath = `/api/barricada/${slug || "endereco"}`;

  return (
    <form action={saveAction} className="flex flex-col gap-5">
      {draft.barricadeId ? <input type="hidden" name="id" value={draft.barricadeId} /> : null}
      {draft.apiId ? <input type="hidden" name="api_id" value={draft.apiId} /> : null}
      <input type="hidden" name="response_template" value={template} />
      {saveState.error ? <p className={alertClass}>{saveState.error}</p> : null}
      {saveState.success ? <p className={successClass}>{saveState.success}</p> : null}
      {saveState.token ? (
        <p className="rounded-[14px] border border-warning/40 bg-warning/10 px-4 py-3 text-sm text-foreground">
          Token: <span className="font-mono">{saveState.token}</span>
        </p>
      ) : null}
      {saveState.createdId ? (
        <Link href={`/barricadas/${saveState.createdId}`} className="text-sm text-accent">
          Ver
        </Link>
      ) : null}

      <section className="flex flex-col gap-4 rounded-[14px] border border-line bg-card/90 p-5">
        <h2 className="text-sm font-medium">API</h2>
        <label className="text-sm text-foreground">
          Nome
          <input name="name" required maxLength={120} defaultValue={draft.name} className={fieldClass} onChange={(event) => {
            if (!slugTouched) setSlug(slugify(event.target.value));
          }} />
        </label>
        <LogoField barricadeId={draft.barricadeId} logoUpdatedAt={draft.logoUpdatedAt} />
        <label className="text-sm text-foreground">
          URL da API
          <input name="api_url" required defaultValue={draft.apiUrl} placeholder="https://instagram-scraper-stable-api.p.rapidapi.com/ig_get_fb_profile.php" className={fieldClass} />
        </label>
        <div className="grid gap-4 md:grid-cols-2">
          <label className="text-sm text-foreground">
            Método
            <select name="api_method" defaultValue={draft.apiMethod} className={fieldClass}>
              {HTTP_METHODS.map((method) => (
                <option key={method}>{method}</option>
              ))}
            </select>
          </label>
          <label className="text-sm text-foreground">
            Corpo
            <select name="body_mode" value={bodyMode} onChange={(event) => setBodyMode(event.target.value as SimpleDraft["bodyMode"])} className={fieldClass}>
              <option value="none">Nenhum</option>
              <option value="form">Formulário</option>
              <option value="json">JSON</option>
            </select>
          </label>
        </div>

        <div>
          <p className="text-sm text-foreground">Cabeçalhos</p>
          <p className="mt-1 text-xs text-muted">A chave da API fica só no servidor. No exemplo da RapidAPI, use x-rapidapi-host e x-rapidapi-key.</p>
          <div className="mt-3 flex flex-col gap-2">
            {headers.map((header, index) => (
              <div key={`header-${index}`} className="grid gap-2 sm:grid-cols-[1fr_1.4fr_auto]">
                <input name="header_key" defaultValue={header.name} placeholder="x-rapidapi-host" className={fieldClass} />
                <input name="header_value" type={header.keep || /key|token|secret|authorization/i.test(header.name) ? "password" : "text"} autoComplete="off" defaultValue={header.value} placeholder={header.keep ? "Salva. Preencha só para trocar." : "Valor"} className={fieldClass} />
                <input type="hidden" name="header_keep" value={header.keep ? "1" : "0"} />
                <button type="button" className="text-sm text-muted" onClick={() => setHeaders((current) => current.filter((_, itemIndex) => itemIndex !== index))}>
                  Remover
                </button>
              </div>
            ))}
          </div>
          <button type="button" className="mt-3 text-sm text-accent" onClick={() => setHeaders((current) => [...current, { name: "", value: "", keep: false }])}>
            Adicionar cabeçalho
          </button>
        </div>

        {bodyMode === "form" ? (
          <div>
            <p className="text-sm text-foreground">Campos do formulário</p>
            <p className="mt-1 text-xs text-muted">Marque “quem chama informa” para a barricada aceitar esse valor na URL, por exemplo ?username_or_url=quran. O valor digitado vira o padrão.</p>
            <div className="mt-3 flex flex-col gap-2">
              {fields.map((field, index) => (
                <div key={`field-${index}`} className="grid items-center gap-2 sm:grid-cols-[1fr_1fr_auto_auto]">
                  <input name="field_key" defaultValue={field.name} placeholder="username_or_url" className={fieldClass} />
                  <input name="field_value" defaultValue={field.value} placeholder="quran" className={fieldClass} />
                  <input type="hidden" name="field_open" value={field.open ? "1" : "0"} />
                  <label className="flex items-center gap-2 text-xs text-muted">
                    <input type="checkbox" checked={field.open} onChange={(event) => setFields((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, open: event.target.checked } : item))} />
                    Quem chama informa
                  </label>
                  <button type="button" className="text-sm text-muted" onClick={() => setFields((current) => current.filter((_, itemIndex) => itemIndex !== index))}>
                    Remover
                  </button>
                </div>
              ))}
            </div>
            <button type="button" className="mt-3 text-sm text-accent" onClick={() => setFields((current) => [...current, { name: "", value: "", open: false }])}>
              Adicionar campo
            </button>
          </div>
        ) : null}
        {bodyMode === "json" ? (
          <label className="text-sm text-foreground">
            JSON enviado à API
            <textarea name="json_body" defaultValue={draft.jsonBody} rows={6} className={`${fieldClass} font-mono`} placeholder='{"consulta":"{{consumer.query.consulta}}"}' />
          </label>
        ) : null}
        <div>
          {pingState.error ? <p className={`${alertClass} mb-3`}>{pingState.error}</p> : null}
          {pingState.success ? <p className={`${successClass} mb-3`}>{pingState.success}</p> : null}
          <button
            type="button"
            disabled={pinging}
            className="rounded-[12px] border border-accent/50 px-4 py-2 text-sm text-accent disabled:opacity-60"
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              const form = event.currentTarget.form;
              if (!form || pinging) return;
              const body = new FormData(form);
              setPinging(true);
              void fetch("/api/ping", { method: "POST", body })
                .then(async (response) => {
                  const data = (await response.json()) as CatalogState;
                  setPingState(data.preview || data.error || data.success ? data : { error: "Não foi possível chamar a API." });
                })
                .catch(() => setPingState({ error: "Não foi possível chamar a API." }))
                .finally(() => setPinging(false));
            }}
          >
            {pinging ? "Chamando..." : "Ping"}
          </button>
        </div>
        {pingState.preview?.responseBody ? (
          <pre className="max-h-72 overflow-auto rounded-[12px] border border-line bg-background p-3 text-xs leading-5 text-foreground">{pingState.preview.responseBody}</pre>
        ) : null}
      </section>

      <section className="flex flex-col gap-4 rounded-[14px] border border-line bg-card/90 p-5">
        <h2 className="text-sm font-medium">O que a barricada devolve</h2>
        <p className="text-xs text-muted">Marque os campos do JSON e dê o nome que quem consome vai receber. Sem marcação, a resposta inteira é devolvida.</p>
        {rows.length === 0 ? <p className="text-sm text-muted">Faça um ping para ver os campos.</p> : (
          <div className="flex flex-col gap-2">
            {rows.map((row) => {
              const item = chosen[row.path] ?? { on: false, name: row.path.split(".").at(-1) ?? row.path };
              return (
                <div key={row.path} className="grid items-center gap-2 sm:grid-cols-[auto_1fr_1fr]">
                  <input type="checkbox" checked={item.on} onChange={(event) => setChosen((current) => ({ ...current, [row.path]: { ...item, on: event.target.checked } }))} aria-label={`Enviar ${row.path}`} />
                  <span className="truncate font-mono text-xs text-muted" title={row.sample}>{row.path}</span>
                  <input value={item.name} onChange={(event) => setChosen((current) => ({ ...current, [row.path]: { on: current[row.path]?.on ?? item.on, name: event.target.value } }))} className={fieldClass} aria-label={`Nome de ${row.path}`} />
                </div>
              );
            })}
          </div>
        )}
      </section>

      <section className="flex flex-col gap-4 rounded-[14px] border border-line bg-card/90 p-5">
        <h2 className="text-sm font-medium">Quem pode chamar</h2>
        <label className="text-sm text-foreground">
          URL da barricada
          <input name="slug" required value={slug} onChange={(event) => { setSlugTouched(true); setSlug(event.target.value); }} placeholder="instagram/perfil" className={fieldClass} />
        </label>
        <p className="font-mono text-xs text-muted">{endpoint || publicPath}</p>
        {draft.tokenPrefix ? (
          <p className="text-sm text-muted">Token atual: <span className="font-mono">{draft.tokenPrefix}</span>••••</p>
        ) : (
          <label className="text-sm text-foreground">
            Token
            <input name="token" autoComplete="off" placeholder="Deixe em branco para gerar" className={fieldClass} />
          </label>
        )}
        <label className="text-sm text-foreground">
          URLs que podem acessar
          <textarea name="origins" defaultValue={draft.origins} rows={3} placeholder={"https://app.exemplo.com\n203.0.113.10"} className={fieldClass} />
        </label>
        <p className="text-xs text-muted">Uma por linha. Em branco, qualquer origem passa. Com uma URL na lista, o pedido precisa enviar o cabeçalho Origin com essa URL. O token continua obrigatório.</p>
        <label className="text-sm text-foreground">
          Consumo por dia
          <input name="daily_limit" type="number" min={0} defaultValue={draft.dailyLimit} className={fieldClass} />
        </label>
        <label className="text-sm text-foreground">
          Se falhar, usar
          <select name="fallback_id" defaultValue={draft.fallbackId ?? ""} className={fieldClass}>
            <option value="">Nenhuma</option>
            {alternatives.filter((item) => item.id !== draft.barricadeId).map((item) => (
              <option key={item.id} value={item.id}>{item.name}</option>
            ))}
          </select>
        </label>
        <p className="text-xs text-muted">A reserva entra em timeout, falha de conexão ou erro 5xx. Quem chama continua usando GET {publicPath} com Authorization: Bearer.</p>
        <label className="flex items-center gap-2 text-sm text-foreground">
          <input type="checkbox" name="active" value="1" defaultChecked={draft.active} />
          Barricada ativa
        </label>
        <button type="submit" disabled={saving} className={submitClass}>
          {saving ? "Salvando..." : "Salvar"}
        </button>
      </section>
    </form>
  );
}

export function RenewToken({ id }: { id: number }) {
  const [state, action, pending] = useActionState(renewToken, initialState);
  return (
    <form action={action}>
      <input type="hidden" name="id" value={id} />
      <button type="submit" disabled={pending} className="text-sm text-accent">{pending ? "Gerando..." : "Gerar outro token"}</button>
      <p className="mt-2 text-xs text-muted">O token anterior deixa de funcionar. O novo fica salvo nesta tela.</p>
      {state.token ? <p className="mt-3 font-mono text-sm text-foreground">{state.token}</p> : null}
      {state.error ? <p className={`${alertClass} mt-3`}>{state.error}</p> : null}
    </form>
  );
}

function LogoField({ barricadeId, logoUpdatedAt }: { barricadeId?: number; logoUpdatedAt?: Date | string | null }) {
  const saved = barricadeId && logoUpdatedAt
    ? `/barricadas/${barricadeId}/logo?v=${encodeURIComponent(logoUpdatedAt instanceof Date ? String(logoUpdatedAt.getTime()) : String(logoUpdatedAt))}`
    : "";
  const [preview, setPreview] = useState(saved);
  const [remove, setRemove] = useState(false);
  const [fileKey, setFileKey] = useState(0);

  function onFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setRemove(false);
    setPreview(URL.createObjectURL(file));
  }

  function onRemove(checked: boolean) {
    setRemove(checked);
    if (checked) {
      setPreview("");
      setFileKey((current) => current + 1);
      return;
    }
    setPreview(saved);
  }

  const visible = Boolean(preview) && !remove;

  return (
    <div>
      <p className="text-sm text-foreground">Logo</p>
      <div className="mt-2 flex items-center gap-3">
        {visible ? (
          <img src={preview} alt="" className="h-12 w-12 rounded-[12px] border border-line bg-background object-cover" />
        ) : (
          <span className="flex h-12 w-12 items-center justify-center rounded-[12px] border border-dashed border-line text-[10px] text-muted">sem logo</span>
        )}
        <div className="min-w-0">
          <input key={fileKey} name="logo" type="file" accept="image/png,image/jpeg,image/webp,image/gif" onChange={onFile} className="block w-full text-sm text-muted file:mr-3 file:rounded-[10px] file:border-0 file:bg-accent file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-accent-foreground" />
          <p className="mt-1 text-xs text-muted">PNG, JPG, WEBP ou GIF, até 400 KB.</p>
          {saved ? (
            <label className="mt-2 flex items-center gap-2 text-xs text-muted">
              <input type="checkbox" name="remove_logo" value="1" checked={remove} onChange={(event) => onRemove(event.target.checked)} />
              Remover logo
            </label>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function chosenFrom(template: string) {
  const chosen: Record<string, Chosen> = {};
  for (const item of selectionFromTemplate(template)) chosen[item.path] = { on: true, name: item.name };
  return chosen;
}

function templateFromChosen(chosen: Record<string, Chosen>) {
  const body: Record<string, string> = {};
  for (const [path, item] of Object.entries(chosen)) {
    const name = item.name.trim();
    if (!item.on || !name) continue;
    body[name] = `{{${path}}}`;
  }
  return Object.keys(body).length > 0 ? JSON.stringify(body) : "";
}

function slugify(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}
