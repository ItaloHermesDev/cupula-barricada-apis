"use client";

import Link from "next/link";
import { startTransition, useActionState, useState, type ChangeEvent, type FormEvent } from "react";
import { renewToken, saveSimpleBarricade } from "@/app/actions/catalog";
import { ApiBlock, emptyApiSlice, type ApiSlice } from "@/app/components/catalog/api-block";
import { fieldClass } from "@/app/components/catalog/fields";
import { alertClass, submitClass, successClass } from "@/app/components/text-field";
import { type CatalogState, type HttpMethod } from "@/lib/catalog";
import { type OpenField } from "@/lib/draft";

const initialState: CatalogState = {};

export type { ApiSlice };

export type SimpleDraft = {
  barricadeId?: number;
  apiId?: number;
  name: string;
  description: string;
  apiUrl: string;
  apiMethod: HttpMethod;
  bodyMode: "none" | "json" | "form";
  headers: ApiSlice["headers"];
  fields: OpenField[];
  queryFields: OpenField[];
  jsonBody: string;
  slug: string;
  origins: string;
  dailyLimit: number;
  responseTemplate: string;
  monthlyTokens: number | null;
  requestsPerMinute: number | null;
  calls: number;
  sources: ApiSlice[];
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
  const signature = draftSignature(draft);
  const [seen, setSeen] = useState(signature);
  const [slug, setSlug] = useState(draft.slug);
  const [sources, setSources] = useState(() => listed(draft.sources, "init"));
  if (seen !== signature) {
    setSeen(signature);
    setSlug(draft.slug);
    setSources(listed(draft.sources, signature));
  }
  const publicPath = `/api/barricada/${slug || "endereco"}`;
  const shownUrl = endpoint.includes("/api/barricada/") ? endpoint.replace(/\/api\/barricada\/.*$/, publicPath) : publicPath;

  function onSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    startTransition(() => {
      saveAction(data);
    });
  }

  return (
    <form onSubmit={onSave} className="flex flex-col gap-5">
      {draft.barricadeId ? <input type="hidden" name="id" value={draft.barricadeId} /> : null}
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

      <div key={seen} className="flex flex-col gap-5">
      <section className="flex flex-col gap-4 rounded-[14px] border border-line bg-card/90 p-5">
        <h2 className="text-sm font-medium">Barricada</h2>
        <label className="text-sm text-foreground">
          Nome
          <input name="name" required maxLength={120} defaultValue={draft.name} className={fieldClass} onChange={(event) => setSlug(slugify(event.target.value))} />
        </label>
        <label className="text-sm text-foreground">
          Observação
          <textarea name="description" maxLength={500} rows={3} defaultValue={draft.description} className={fieldClass} />
        </label>
        <LogoField barricadeId={draft.barricadeId} logoUpdatedAt={draft.logoUpdatedAt} />
      </section>
        <ApiBlock
          title="API"
          hint="Esta é a primeira API da barricada."
          prefix=""
          pingSource=""
          draft={{
            apiId: draft.apiId,
            apiUrl: draft.apiUrl,
            apiMethod: draft.apiMethod,
            bodyMode: draft.bodyMode,
            headers: draft.headers,
            fields: draft.fields,
            queryFields: draft.queryFields,
            jsonBody: draft.jsonBody,
            responseTemplate: draft.responseTemplate,
            monthlyTokens: draft.monthlyTokens,
            requestsPerMinute: draft.requestsPerMinute,
            calls: draft.calls,
          }}
        />
        {sources.map((source, index) => (
          <ApiBlock
            key={source.uid}
            title="API combinada"
            hint="A mesma chamada consulta esta API junto com as outras. A resposta junta os campos de todas."
            prefix={`s${index}_`}
            pingSource={String(index)}
            draft={source.draft}
            onRemove={() => setSources((current) => current.filter((item) => item.uid !== source.uid))}
          />
        ))}
        <div>
          <button
            type="button"
            className="text-sm text-accent disabled:opacity-60"
            disabled={sources.length >= 5}
            onClick={() => setSources((current) => [...current, { uid: `novo-${current.length}-${Date.now()}`, draft: emptyApiSlice() }])}
          >
            Combinar outra API
          </button>
          <p className="mt-1 text-xs text-muted">Até 5 APIs além da primeira. Quem chama continua usando um único endereço e um único token.</p>
        </div>
      <section className="flex flex-col gap-4 rounded-[14px] border border-line bg-card/90 p-5">
        <h2 className="text-sm font-medium">Quem pode chamar</h2>
        <label className="text-sm text-foreground">
          URL da barricada
          <input name="slug" required value={slug} onChange={(event) => setSlug(event.target.value)} placeholder="instagram/perfil" className={fieldClass} />
        </label>
        <p className="font-mono text-xs text-muted">{shownUrl}</p>
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
          <input name="daily_limit" type="number" min={-1} defaultValue={draft.dailyLimit} className={fieldClass} />
        </label>
        <p className="text-xs text-muted">-1 deixa o consumo sem limite. O contador reinicia à meia-noite de Brasília.</p>
        <label className="text-sm text-foreground">
          Se falhar, usar
          <select name="fallback_id" defaultValue={draft.fallbackId ?? ""} className={fieldClass}>
            <option value="">Nenhuma</option>
            {alternatives.filter((item) => item.id !== draft.barricadeId).map((item) => (
              <option key={item.id} value={item.id}>{item.name}</option>
            ))}
          </select>
        </label>
        <p className="text-xs text-muted">A reserva entra em timeout, falha de conexão, erro 5xx ou cota estourada (HTTP 429). Quem chama continua usando GET {publicPath} com Authorization: Bearer.</p>
        <label className="flex items-center gap-2 text-sm text-foreground">
          <input type="checkbox" name="active" value="1" defaultChecked={draft.active} />
          Barricada ativa
        </label>
        <button type="submit" disabled={saving} className={submitClass}>
          {saving ? "Salvando..." : "Salvar"}
        </button>
      </section>
      </div>
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

function draftSignature(draft: SimpleDraft) {
  return JSON.stringify({
    barricadeId: draft.barricadeId ?? null,
    apiId: draft.apiId ?? null,
    name: draft.name,
    description: draft.description,
    apiUrl: draft.apiUrl,
    apiMethod: draft.apiMethod,
    bodyMode: draft.bodyMode,
    headers: draft.headers,
    fields: draft.fields,
    queryFields: draft.queryFields,
    jsonBody: draft.jsonBody,
    slug: draft.slug,
    origins: draft.origins,
    dailyLimit: draft.dailyLimit,
    responseTemplate: draft.responseTemplate,
    monthlyTokens: draft.monthlyTokens,
    requestsPerMinute: draft.requestsPerMinute,
    calls: draft.calls,
    sources: draft.sources,
    fallbackId: draft.fallbackId,
    active: draft.active,
    tokenPrefix: draft.tokenPrefix ?? "",
    logoUpdatedAt: draft.logoUpdatedAt instanceof Date ? draft.logoUpdatedAt.toISOString() : draft.logoUpdatedAt ?? "",
  });
}

function listed(sources: ApiSlice[], stamp: string) {
  return sources.map((item, index) => ({ uid: `${stamp}-${index}`, draft: item }));
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
