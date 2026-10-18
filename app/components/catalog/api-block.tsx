"use client";

import { useMemo, useState } from "react";
import { fieldClass } from "@/app/components/catalog/fields";
import { alertClass, successClass } from "@/app/components/text-field";
import { HTTP_METHODS, type CatalogState, type HttpMethod } from "@/lib/catalog";
import { leavesFromText, queryChoices, selectionFromTemplate, type Leaf, type OpenField } from "@/lib/draft";

type HeaderDraft = { name: string; value: string; keep: boolean };
type Chosen = { on: boolean; name: string };

export type ApiSlice = {
  apiId?: number;
  apiUrl: string;
  apiMethod: HttpMethod;
  bodyMode: "none" | "json" | "form";
  headers: HeaderDraft[];
  fields: OpenField[];
  queryFields: OpenField[];
  jsonBody: string;
  responseTemplate: string;
  monthlyTokens: number | null;
  requestsPerMinute: number | null;
  calls: number;
};

export function ApiBlock({
  title,
  hint,
  prefix,
  pingSource,
  draft,
  onRemove,
}: {
  title: string;
  hint: string;
  prefix: string;
  pingSource: string;
  draft: ApiSlice;
  onRemove?: () => void;
}) {
  const [bodyMode, setBodyMode] = useState(draft.bodyMode);
  const [headers, setHeaders] = useState<HeaderDraft[]>(draft.headers.length > 0 ? draft.headers : [{ name: "", value: "", keep: false }]);
  const [fields, setFields] = useState<OpenField[]>(draft.fields.length > 0 ? draft.fields : [{ name: "", value: "", open: false }]);
  const [queryFields, setQueryFields] = useState<OpenField[]>(draft.queryFields);
  const [chosen, setChosen] = useState<Record<string, Chosen>>(() => chosenFrom(draft.responseTemplate));
  const [leaves, setLeaves] = useState<Leaf[]>([]);
  const [pingState, setPingState] = useState<CatalogState>({});
  const [pinging, setPinging] = useState(false);
  const [pinged, setPinged] = useState(false);
  const template = useMemo(() => templateFromChosen(chosen), [chosen]);
  const listed = leaves.length > 0 ? leaves : selectionFromTemplate(draft.responseTemplate).map((item) => ({ path: item.path, sample: "" }));
  const listedPaths = new Set(listed.map((row) => row.path));
  const kept = leaves.length > 0
    ? Object.entries(chosen).filter(([path, item]) => item.on && !listedPaths.has(path)).map(([path]) => ({ path, sample: "" }))
    : [];
  const rows = [...kept, ...listed];
  const nameOf = (field: string) => `${prefix}${field}`;

  return (
    <section className="flex flex-col gap-4 rounded-[14px] border border-line bg-card/90 p-5">
      <div className="flex items-start justify-between gap-3">
        <h2 className="text-sm font-medium">{title}</h2>
        {onRemove ? (
          <button type="button" className="text-sm text-muted" onClick={onRemove}>
            Remover esta API
          </button>
        ) : null}
      </div>
      <p className="text-xs text-muted">{hint}</p>
      <div className="grid gap-4 md:grid-cols-2">
        <label className="text-sm text-foreground">
          Tokens no mês
          <input name={nameOf("monthly_tokens")} type="number" min={0} defaultValue={draft.monthlyTokens ?? ""} className={fieldClass} />
        </label>
        <label className="text-sm text-foreground">
          Requisições por minuto
          <input name={nameOf("requests_per_minute")} type="number" min={0} defaultValue={draft.requestsPerMinute ?? ""} className={fieldClass} />
        </label>
      </div>
      <p className="text-xs text-muted">Esses números só servem para comparar. Não limitam a chamada. Chamadas desta rota: {draft.calls}.</p>
      {prefix ? <input type="hidden" name="source_index" value={pingSource} /> : null}
      {draft.apiId ? <input type="hidden" name={nameOf("api_id")} value={draft.apiId} /> : null}
      <input type="hidden" name={nameOf("response_template")} value={template} />
      <label className="text-sm text-foreground">
        URL da API
        <input name={nameOf("api_url")} required defaultValue={draft.apiUrl} placeholder="https://instagram-scraper-stable-api.p.rapidapi.com/ig_get_fb_profile.php" className={fieldClass} onChange={(event) => {
          const nextUrl = event.target.value;
          setQueryFields((current) => queryChoices(nextUrl, current));
        }} />
      </label>
      {queryFields.length > 0 ? (
        <div>
          <p className="text-sm text-foreground">Parâmetros da URL</p>
          <p className="mt-1 text-xs text-muted">Marque “quem chama informa” só nos parâmetros que entram na URL da barricada. O valor ao lado é o padrão. Os demais ficam fixos.</p>
          <div className="mt-3 flex flex-col gap-2">
            {queryFields.map((field) => (
              <div key={`query-${field.name}`} className="grid items-center gap-2 sm:grid-cols-[1fr_1fr_auto]">
                <span className="truncate font-mono text-xs text-muted">{field.name}</span>
                <span className="truncate font-mono text-xs text-foreground" title={field.value}>{field.value || "sem padrão"}</span>
                <label className="flex items-center gap-2 text-xs text-muted">
                  <input type="checkbox" name={nameOf("query_open_name")} value={field.name} checked={field.open} onChange={(event) => setQueryFields((current) => current.map((item) => item.name === field.name ? { ...item, open: event.target.checked } : item))} />
                  Quem chama informa
                </label>
              </div>
            ))}
          </div>
        </div>
      ) : null}
      <div className="grid gap-4 md:grid-cols-2">
        <label className="text-sm text-foreground">
          Método
          <select name={nameOf("api_method")} defaultValue={draft.apiMethod} className={fieldClass}>
            {HTTP_METHODS.map((method) => (
              <option key={method}>{method}</option>
            ))}
          </select>
        </label>
        <label className="text-sm text-foreground">
          Corpo
          <select name={nameOf("body_mode")} value={bodyMode} onChange={(event) => setBodyMode(event.target.value as ApiSlice["bodyMode"])} className={fieldClass}>
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
              <input name={nameOf("header_key")} defaultValue={header.name} placeholder="x-rapidapi-host" className={fieldClass} />
              <input name={nameOf("header_value")} type={header.keep || /key|token|secret|authorization/i.test(header.name) ? "password" : "text"} autoComplete="off" defaultValue={header.value} placeholder={header.keep ? "Salva. Preencha só para trocar." : "Valor"} className={fieldClass} />
              <input type="hidden" name={nameOf("header_keep")} value={header.keep ? "1" : "0"} />
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
          <p className="mt-1 text-xs text-muted">Marque “quem chama informa” para a barricada aceitar esse valor na URL. O valor digitado vira o padrão.</p>
          <div className="mt-3 flex flex-col gap-2">
            {fields.map((field, index) => (
              <div key={`field-${index}`} className="grid items-center gap-2 sm:grid-cols-[1fr_1fr_auto_auto]">
                <input name={nameOf("field_key")} defaultValue={field.name} placeholder="username_or_url" className={fieldClass} />
                <input name={nameOf("field_value")} defaultValue={field.value} placeholder="quran" className={fieldClass} />
                <input type="hidden" name={nameOf("field_open")} value={field.open ? "1" : "0"} />
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
          <textarea name={nameOf("json_body")} defaultValue={draft.jsonBody} rows={6} className={`${fieldClass} font-mono`} placeholder='{"consulta":"{{consumer.query.consulta}}"}' />
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
            body.set("ping_source", pingSource);
            setPinging(true);
            void fetch("/api/ping", { method: "POST", body })
              .then(async (response) => {
                const data = (await response.json()) as CatalogState;
                const next = data.preview || data.error || data.success ? data : { error: "Não foi possível chamar a API." };
                setPingState(next);
                setPinged(true);
                setLeaves(listedFields(next));
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
      <div>
        <p className="text-sm text-foreground">O que esta API devolve</p>
        <p className="mt-1 text-xs text-muted">Marque os campos do JSON e dê o nome que quem consome vai receber. Sem marcação, a resposta inteira entra no objeto combinado.</p>
        {rows.length === 0 ? (
          <p className="mt-3 text-sm text-muted">{pinged ? "A resposta não trouxe campos para marcar." : "Faça um ping para ver os campos."}</p>
        ) : (
          <div className="mt-3 flex max-h-[28rem] flex-col gap-2 overflow-auto pr-1">
            {rows.length >= 400 ? <p className="text-xs text-muted">A lista mostra os primeiros 400 campos.</p> : null}
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
      </div>
    </section>
  );
}

function listedFields(data: CatalogState) {
  const provided = data.preview?.fields;
  if (Array.isArray(provided)) return provided;
  return leavesFromText(data.preview?.responseBody ?? "");
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

export function emptyApiSlice(method: HttpMethod = "GET"): ApiSlice {
  return {
    apiUrl: "https://",
    apiMethod: method,
    bodyMode: "none",
    headers: [{ name: "", value: "", keep: false }],
    fields: [],
    queryFields: [],
    jsonBody: "",
    responseTemplate: "",
    monthlyTokens: null,
    requestsPerMinute: null,
    calls: 0,
  };
}
