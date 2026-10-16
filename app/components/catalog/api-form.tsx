"use client";

import Link from "next/link";
import { useActionState } from "react";
import { saveApi, testApi } from "@/app/actions/catalog";
import { FieldList, fieldClass } from "@/app/components/catalog/fields";
import { alertClass, submitClass, successClass } from "@/app/components/text-field";
import { HTTP_METHODS, type ApiFormValues, type CatalogState } from "@/lib/catalog";

const initial: CatalogState = {};

export function ApiForm({ api }: { api?: ApiFormValues }) {
  const [state, action, pending] = useActionState(saveApi, initial);
  const [testState, testAction, testing] = useActionState(testApi, initial);

  return (
    <div className="flex flex-col gap-5">
      <form action={action} className="flex flex-col gap-4">
        {api ? <input type="hidden" name="id" value={api.id} /> : null}
        {state.error ? <p className={alertClass}>{state.error}</p> : null}
        {state.success ? <p className={successClass}>{state.success}</p> : null}
        {state.createdId ? (
          <Link href={`/apis/${state.createdId}`} className="text-sm text-accent">
            Abrir a API cadastrada
          </Link>
        ) : null}
        <label className="text-sm text-foreground">
          Nome
          <input name="name" required maxLength={120} defaultValue={api?.name ?? ""} className={fieldClass} />
        </label>
        <label className="text-sm text-foreground">
          Descrição
          <textarea name="description" maxLength={500} defaultValue={api?.description ?? ""} className={fieldClass} rows={2} />
        </label>
        <div className="grid gap-4 md:grid-cols-2">
          <label className="text-sm text-foreground">
            URL-base
            <input name="base_url" required defaultValue={api?.baseUrl ?? "https://"} className={fieldClass} />
          </label>
          <label className="text-sm text-foreground">
            Endpoint
            <input name="endpoint_path" defaultValue={api?.endpointPath ?? ""} placeholder="/v1/perfil/{{consumer.path.id}}" className={fieldClass} />
          </label>
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          <label className="text-sm text-foreground">
            Método
            <select name="method" defaultValue={api?.method ?? "GET"} className={fieldClass}>
              {HTTP_METHODS.map((method) => (
                <option key={method}>{method}</option>
              ))}
            </select>
          </label>
          <label className="text-sm text-foreground">
            Conteúdo da requisição
            <input name="request_content_type" defaultValue={api?.requestContentType ?? "application/json"} className={fieldClass} />
          </label>
          <label className="text-sm text-foreground">
            Conteúdo da resposta
            <input name="response_content_type" defaultValue={api?.responseContentType ?? "application/json"} className={fieldClass} />
          </label>
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          <label className="text-sm text-foreground">
            Autenticação externa
            <select name="auth_type" defaultValue={api?.authType ?? "none"} className={fieldClass}>
              <option value="none">Nenhuma</option>
              <option value="bearer">Bearer</option>
              <option value="basic">Basic (usuário:senha)</option>
              <option value="api_key">Chave em cabeçalho</option>
            </select>
          </label>
          <label className="text-sm text-foreground">
            Credencial
            <input name="credential" type="password" autoComplete="off" placeholder={api?.hasCredential ? "Preenchida. Deixe em branco para manter." : "Opcional"} className={fieldClass} />
          </label>
          <label className="text-sm text-foreground">
            Nome do cabeçalho da chave
            <input name="credential_header" defaultValue={api?.credentialHeader ?? "X-Api-Key"} className={fieldClass} />
          </label>
        </div>
        {api?.hasCredential ? (
          <label className="flex items-center gap-2 text-sm text-muted">
            <input type="checkbox" name="clear_credential" value="1" />
            Remover a credencial salva
          </label>
        ) : null}
        <FieldList title="Cabeçalhos" hint="Valores fixos ou variáveis, como {{consumer.header.x-cliente}}." prefix="header" rows={api?.headers ?? []} />
        <FieldList title="Query params" hint="Parâmetros enviados na URL externa." prefix="query" rows={api?.query ?? []} />
        <FieldList title="Parâmetros de rota" hint="Nomes usados no endpoint, por exemplo id em {{consumer.path.id}}." prefix="path" rows={api?.pathParams ?? []} />
        <label className="text-sm text-foreground">
          Corpo da requisição
          <textarea name="body_template" defaultValue={api?.bodyTemplate ?? ""} rows={6} placeholder='{"consulta":"{{consumer.body.consulta}}"}' className={`${fieldClass} font-mono`} />
        </label>
        <div className="grid gap-4 md:grid-cols-2">
          <label className="text-sm text-foreground">
            Timeout (ms)
            <input name="timeout_ms" type="number" min={1000} max={30000} defaultValue={api?.timeoutMs ?? 10000} className={fieldClass} />
          </label>
          <label className="mt-6 flex items-center gap-2 text-sm text-foreground">
            <input type="checkbox" name="active" value="1" defaultChecked={api?.active ?? true} />
            API ativa
          </label>
        </div>
        <p className="text-xs text-muted">Erros do provedor voltam como resposta padronizada, sem repassar credenciais ou o corpo original.</p>
        <button type="submit" disabled={pending} className={submitClass}>
          {pending ? "Salvando..." : "Salvar API"}
        </button>
      </form>
      {api ? (
        <form action={testAction} className="rounded-[14px] border border-line bg-card/80 p-4">
          <input type="hidden" name="id" value={api.id} />
          <h2 className="text-sm font-medium text-foreground">Testar configuração salva</h2>
          <p className="mt-1 text-xs leading-5 text-muted">A credencial fica no servidor e aparece mascarada neste resultado.</p>
          <label className="mt-3 block text-sm text-foreground">
            Amostra do consumidor (JSON opcional)
            <textarea name="sample" rows={4} placeholder='{"query":{},"header":{},"body":{},"path":{}}' className={`${fieldClass} font-mono`} />
          </label>
          <button type="submit" disabled={testing} className={`${submitClass} mt-3`}>
            {testing ? "Testando..." : "Testar API"}
          </button>
          <Preview data={testState} />
        </form>
      ) : null}
    </div>
  );
}

function Preview({ data }: { data: CatalogState }) {
  if (!data.preview && !data.error && !data.success) return null;
  return (
    <div className="mt-4 space-y-2 text-sm">
      {data.error ? <p className={alertClass}>{data.error}</p> : null}
      {data.success ? <p className={successClass}>{data.success}</p> : null}
      {data.preview ? (
        <dl className="grid gap-2 text-xs text-muted">
          <div><dt>URL</dt><dd className="break-all text-foreground">{data.preview.method} {data.preview.url}</dd></div>
          <div><dt>Status</dt><dd className="text-foreground">{data.preview.status ?? "sem resposta"} · {data.preview.durationMs} ms {data.preview.failure ? `· ${data.preview.failure}` : ""}</dd></div>
          <div><dt>Cabeçalhos enviados</dt><dd className="font-mono text-foreground">{JSON.stringify(data.preview.requestHeaders)}</dd></div>
          <div><dt>Corpo enviado</dt><dd className="font-mono whitespace-pre-wrap text-foreground">{data.preview.requestBody || "—"}</dd></div>
          <div><dt>Resposta original</dt><dd className="font-mono whitespace-pre-wrap text-foreground">{data.preview.responseBody || "—"}</dd></div>
        </dl>
      ) : null}
    </div>
  );
}
