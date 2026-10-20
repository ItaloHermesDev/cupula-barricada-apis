"use client";

import { useMemo, useState } from "react";
import { fieldClass } from "@/app/components/catalog/fields";
import { alertClass, successClass } from "@/app/components/text-field";
import { HTTP_METHODS, type CatalogState, type HttpMethod } from "@/lib/catalog";
import { leavesFromText, pathChoices, queryChoices, replacePathValue, replaceQueryValue, selectionFromTemplate, type Leaf, type OpenField } from "@/lib/draft";
import { ERROR_WAIT_MAX, type ErrorAction, type ErrorKind, type ErrorRule } from "@/lib/error-rules";

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
  errorRules: ErrorRule[];
  monthlyTokens: number | null;
  requestsPerMinute: number | null;
  subscriptionName: string;
  subscriptionPrice: number | null;
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
  const [apiUrl, setApiUrl] = useState(draft.apiUrl);
  const [chosen, setChosen] = useState<Record<string, Chosen>>(() => chosenFrom(draft.responseTemplate));
  const [leaves, setLeaves] = useState<Leaf[]>([]);
  const [pingState, setPingState] = useState<CatalogState>({});
  const [pinging, setPinging] = useState(false);
  const [pinged, setPinged] = useState(false);
  const [errorRules, setErrorRules] = useState<ErrorRule[]>(draft.errorRules);
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
        <label className="text-sm text-foreground">
          Assinatura
          <input name={nameOf("subscription_name")} defaultValue={draft.subscriptionName} maxLength={120} placeholder="Plano RapidAPI" className={fieldClass} />
        </label>
        <label className="text-sm text-foreground">
          Valor mensal
          <input name={nameOf("subscription_price")} type="number" min={0} step="0.01" defaultValue={draft.subscriptionPrice ?? ""} className={fieldClass} />
        </label>
      </div>
      <p className="text-xs text-muted">Tokens no mês e requisições por minuto só comparam. Não limitam a chamada. O gasto é o valor mensal dividido pelos tokens do mês e multiplicado pelas chamadas do período no painel. Rotas com o mesmo nome de assinatura somam o gasto, mesmo em barricadas diferentes. Chamadas desta rota: {draft.calls}.</p>
      {prefix ? <input type="hidden" name="source_index" value={pingSource} /> : null}
      {draft.apiId ? <input type="hidden" name={nameOf("api_id")} value={draft.apiId} /> : null}
      <input type="hidden" name={nameOf("response_template")} value={template} />
      <label className="text-sm text-foreground">
        URL da API
          <input name={nameOf("api_url")} required value={apiUrl} placeholder="https://instagram-scraper-stable-api.p.rapidapi.com/ig_get_fb_profile.php" className={fieldClass} onChange={(event) => {
          const nextUrl = event.target.value;
          setApiUrl(nextUrl);
          setQueryFields((current) => [...pathChoices(nextUrl, current), ...queryChoices(nextUrl, current)]);
        }} />
      </label>
      {queryFields.some((field) => field.path) ? (
        <div>
          <p className="text-sm text-foreground">Pedaços do caminho</p>
          <p className="mt-1 text-xs text-muted">Cada trecho depois do domínio pode virar parâmetro. Em /lookup/8.8.8.8, escreva ip no trecho 8.8.8.8 e marque “Quem chama informa”. O trecho lookup fica fixo. Esse parâmetro entra na chamada de toda URL desse tipo, mesmo com um valor de exemplo no caminho.</p>
          <div className="mt-3 flex flex-col gap-2">
            {queryFields.filter((field) => field.path).map((field) => (
              <div key={`path-${field.index}`} className="grid items-center gap-2 sm:grid-cols-[1fr_1fr_1fr_auto]">
                <span className="truncate font-mono text-xs text-foreground" title={field.value || field.name}>{field.value || field.name || "trecho"}</span>
                <input value={field.name} placeholder="ip" aria-label={`Nome do parâmetro para ${field.value || "trecho"}`} className={fieldClass} onChange={(event) => setQueryFields((current) => current.map((item) => item.path && item.index === field.index ? { ...item, name: event.target.value } : item))} />
                <input value={field.value} placeholder="sem padrão" aria-label={`Padrão de ${field.name || field.value || "trecho"}`} className={fieldClass} onChange={(event) => {
                  const value = event.target.value;
                  setQueryFields((current) => current.map((item) => item.path && item.index === field.index ? { ...item, value } : item));
                  if (field.index != null) setApiUrl((current) => replacePathValue(current, field.index ?? -1, value));
                }} />
                {field.open ? <input type="hidden" name={nameOf("path_slot")} value={`${field.index}|${field.name}=${field.value}`} /> : null}
                <label className="flex items-center gap-2 text-xs text-muted">
                  <input type="checkbox" name={nameOf("query_open_name")} value={field.name} checked={field.open} onChange={(event) => setQueryFields((current) => current.map((item) => item.path && item.index === field.index ? { ...item, open: event.target.checked } : item))} />
                  Quem chama informa
                </label>
              </div>
            ))}
          </div>
        </div>
      ) : null}
      {queryFields.some((field) => !field.path) ? (
        <div>
          <p className="text-sm text-foreground">Parâmetros da URL</p>
          <p className="mt-1 text-xs text-muted">O campo do meio é o padrão. Com um valor preenchido, nenhuma API da barricada pede esse parâmetro. Com o padrão vazio e “quem chama informa” marcado, o parâmetro entra na chamada de todas.</p>
          <div className="mt-3 flex flex-col gap-2">
            {queryFields.filter((field) => !field.path).map((field) => (
              <div key={`query-${field.name}`} className="grid items-center gap-2 sm:grid-cols-[1fr_1fr_auto]">
                <span className="truncate font-mono text-xs text-muted">{field.name}</span>
                <input value={field.value} placeholder="sem padrão" aria-label={`Padrão de ${field.name}`} className={fieldClass} onChange={(event) => {
                  const value = event.target.value;
                  setQueryFields((current) => current.map((item) => !item.path && item.name === field.name ? { ...item, value } : item));
                  setApiUrl((current) => replaceQueryValue(current, field.name, value));
                }} />
                <input type="hidden" name={nameOf("query_default")} value={`${field.name}=${field.value}`} />
                <label className="flex items-center gap-2 text-xs text-muted">
                  <input type="checkbox" name={nameOf("query_open_name")} value={field.name} checked={field.open} onChange={(event) => setQueryFields((current) => current.map((item) => !item.path && item.name === field.name ? { ...item, open: event.target.checked } : item))} />
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
      <ErrorRules prefix={prefix} rules={errorRules} onChange={setErrorRules} />
    </section>
  );
}

function ErrorRules({ prefix, rules, onChange }: { prefix: string; rules: ErrorRule[]; onChange: (rules: ErrorRule[]) => void }) {
  const nameOf = (field: string) => `${prefix}${field}`;
  function update(index: number, patch: Partial<ErrorRule>) {
    onChange(rules.map((rule, ruleIndex) => ruleIndex === index ? { ...rule, ...patch } : rule));
  }
  return (
    <div>
      <p className="text-sm text-foreground">Quando esta API falhar</p>
      <p className="mt-1 text-xs text-muted">A primeira linha que combinar é a que vale. Pode ser um erro 4xx, um erro 5xx ou um campo da resposta, como message igual a limite atingido.</p>
      <div className="mt-3 flex flex-col gap-3">
        {rules.map((rule, index) => (
          <div key={index} className="flex flex-col gap-3 rounded-[12px] border border-line p-3">
            <div className="grid gap-3 md:grid-cols-2">
              <label className="text-sm text-foreground">
                Quando
                <select name={nameOf("error_kind")} value={rule.kind} onChange={(event) => update(index, { kind: event.target.value as ErrorKind })} className={fieldClass}>
                  <option value="http_4xx">Erro 4xx</option>
                  <option value="http_5xx">Erro 5xx</option>
                  <option value="field">Campo da resposta</option>
                </select>
              </label>
              <label className="text-sm text-foreground">
                Fazer
                <select name={nameOf("error_action")} value={rule.action} onChange={(event) => update(index, { action: event.target.value as ErrorAction })} className={fieldClass}>
                  <option value="retry">Tentar de novo</option>
                  <option value="fallback">Ativar a barricada reserva</option>
                  <option value="partial">Enviar o JSON sem esta API</option>
                </select>
              </label>
            </div>
            {rule.kind === "field" ? (
              <div className="grid gap-3 md:grid-cols-2">
                <label className="text-sm text-foreground">
                  Campo
                  <input name={nameOf("error_field")} value={rule.field} onChange={(event) => update(index, { field: event.target.value })} placeholder="message" className={fieldClass} />
                </label>
                <label className="text-sm text-foreground">
                  Mensagem
                  <input name={nameOf("error_message")} value={rule.message} onChange={(event) => update(index, { message: event.target.value })} placeholder="limite atingido" className={fieldClass} />
                </label>
              </div>
            ) : (
              <>
                <input type="hidden" name={nameOf("error_field")} value="" />
                <input type="hidden" name={nameOf("error_message")} value="" />
              </>
            )}
            {rule.action === "retry" ? (
              <label className="text-sm text-foreground">
                Esperar (segundos)
                <input name={nameOf("error_wait")} type="number" min={1} max={ERROR_WAIT_MAX} value={rule.waitSeconds} onChange={(event) => update(index, { waitSeconds: Number(event.target.value) })} className={fieldClass} />
              </label>
            ) : (
              <input type="hidden" name={nameOf("error_wait")} value="1" />
            )}
            <button type="button" className="self-start text-sm text-muted" onClick={() => onChange(rules.filter((_, ruleIndex) => ruleIndex !== index))}>
              Remover este erro
            </button>
          </div>
        ))}
      </div>
      <button
        type="button"
        className="mt-3 text-sm text-accent disabled:opacity-60"
        disabled={rules.length >= 8}
        onClick={() => onChange([...rules, { kind: "http_4xx", field: "", message: "", action: "partial", waitSeconds: 5 }])}
      >
        Adicionar erro
      </button>
      <p className="mt-2 text-xs text-muted">Tentar de novo espera esse tempo e chama esta API outra vez. Se continuar falhando, a resposta sai sem ela. Ativar a reserva troca a resposta inteira pela barricada escolhida em “Se falhar, usar”. Enviar o JSON sem esta API devolve o que as outras conseguiram.</p>
    </div>
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
    errorRules: [],
    monthlyTokens: null,
    requestsPerMinute: null,
    subscriptionName: "",
    subscriptionPrice: null,
    calls: 0,
  };
}
