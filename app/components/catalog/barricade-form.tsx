"use client";

import Link from "next/link";
import { useActionState } from "react";
import { previewBarricade, renewToken, saveBarricade } from "@/app/actions/catalog";
import { HeaderAllowList, ParamList, fieldClass } from "@/app/components/catalog/fields";
import { alertClass, submitClass, successClass } from "@/app/components/text-field";
import { HTTP_METHODS, type BarricadeFormValues, type CatalogState } from "@/lib/catalog";

const initial: CatalogState = {};

export function BarricadeForm({
  barricade,
  apis,
  alternatives,
  endpoint,
}: {
  barricade?: BarricadeFormValues;
  apis: { id: number; name: string }[];
  alternatives: { id: number; name: string }[];
  endpoint: string;
}) {
  const [state, action, pending] = useActionState(saveBarricade, initial);
  const [tokenState, tokenAction, renewing] = useActionState(renewToken, initial);
  const [previewState, previewAction, previewing] = useActionState(previewBarricade, initial);
  const issued = state.token ?? tokenState.token;

  return (
    <div className="flex flex-col gap-5">
      <form action={action} className="flex flex-col gap-4">
        {barricade ? <input type="hidden" name="id" value={barricade.id} /> : null}
        {state.error ? <p className={alertClass}>{state.error}</p> : null}
        {state.success ? <p className={successClass}>{state.success}</p> : null}
        {issued ? (
          <p className="rounded-[12px] border border-warning/30 bg-warning/10 px-3 py-2 text-sm text-warning">
            Token: <span className="font-mono text-foreground">{issued}</span>
          </p>
        ) : null}
        {state.createdId ? (
          <Link href={`/barricadas/${state.createdId}`} className="text-sm text-accent">
            Abrir a barricada
          </Link>
        ) : null}
        <div className="grid gap-4 md:grid-cols-2">
          <label className="text-sm text-foreground">
            Nome
            <input name="name" required maxLength={120} defaultValue={barricade?.name ?? ""} className={fieldClass} />
          </label>
          <label className="text-sm text-foreground">
            Identificador
            <input name="slug" required defaultValue={barricade?.slug ?? ""} placeholder="instagram/perfil" className={fieldClass} />
          </label>
        </div>
        <label className="text-sm text-foreground">
          Descrição
          <textarea name="description" maxLength={500} defaultValue={barricade?.description ?? ""} className={fieldClass} rows={2} />
        </label>
        <div className="grid gap-4 md:grid-cols-2">
          <label className="text-sm text-foreground">
            API externa
            <select name="api_id" defaultValue={barricade?.apiId ?? ""} required className={fieldClass}>
              <option value="">Selecione</option>
              {apis.map((api) => (
                <option key={api.id} value={api.id}>{api.name}</option>
              ))}
            </select>
          </label>
          <label className="text-sm text-foreground">
            Método permitido
            <select name="method" defaultValue={barricade?.method ?? "GET"} className={fieldClass}>
              {HTTP_METHODS.map((method) => (
                <option key={method}>{method}</option>
              ))}
            </select>
          </label>
        </div>
        {barricade ? (
          <p className="text-sm text-muted">
            Endpoint: <span className="break-all text-foreground">{endpoint}</span>
            <span className="mt-1 block">Token atual: {barricade.tokenPrefix}••••</span>
          </p>
        ) : (
          <p className="text-sm text-muted">O endpoint protegido é gerado ao salvar, em /api/barricada/identificador.</p>
        )}
        <label className="text-sm text-foreground">
          Origens autorizadas
          <textarea name="origins" defaultValue={barricade?.origins.join("\n") ?? ""} rows={4} placeholder={"https://app.exemplo.com\n203.0.113.10"} className={fieldClass} />
        </label>
        <p className="text-xs leading-5 text-muted">
          Uma origem http(s) exige o cabeçalho Origin com essa URL. Um IP restringe chamadas de servidor. O token continua obrigatório: a origem sozinha não autentica.
        </p>
        <div className="grid gap-4 md:grid-cols-2">
          <label className="text-sm text-foreground">
            Limite diário
            <input name="daily_limit" type="number" min={0} defaultValue={barricade?.dailyLimit ?? 1000} className={fieldClass} />
          </label>
          <label className="text-sm text-foreground">
            Limite por minuto
            <input name="minute_limit" type="number" min={0} defaultValue={barricade?.minuteLimit ?? 60} className={fieldClass} />
          </label>
        </div>
        <p className="text-xs text-muted">Zero remove o limite. O contador diário reinicia à meia-noite de Brasília. Ao estourar, a chamada é bloqueada e o provedor não é consultado.</p>
        <ParamList rows={barricade?.params ?? []} />
        <HeaderAllowList rows={barricade?.allowedHeaders ?? []} />
        <label className="text-sm text-foreground">
          Resposta personalizada
          <textarea name="response_template" defaultValue={barricade?.responseTemplate ?? ""} rows={8} placeholder={'{\n  "id": "{{data.user.id}}",\n  "usuario": "{{data.user.username|sem-nome}}"\n}'} className={`${fieldClass} font-mono`} />
        </label>
        <p className="text-xs leading-5 text-muted">Um placeholder sozinho preserva número e booleano. Use |valor para o padrão quando o campo vier vazio.</p>
        <div className="grid gap-4 md:grid-cols-2">
          <label className="text-sm text-foreground">
            Barricada alternativa
            <select name="fallback_id" defaultValue={barricade?.fallbackId ?? ""} className={fieldClass}>
              <option value="">Nenhuma</option>
              {alternatives.filter((item) => item.id !== barricade?.id).map((item) => (
                <option key={item.id} value={item.id}>{item.name}</option>
              ))}
            </select>
          </label>
          <div className="text-sm text-foreground">
            Acionar fallback em
            {["timeout", "conexao", "http_5xx", "cota"].map((item) => (
              <label key={item} className="mt-2 flex items-center gap-2 text-muted">
                <input type="checkbox" name="fallback_on" value={item} defaultChecked={barricade ? barricade.fallbackOn.includes(item) : true} />
                {item}
              </label>
            ))}
          </div>
        </div>
        <label className="flex items-center gap-2 text-sm text-muted">
          <input type="checkbox" name="idempotent" value="1" defaultChecked={barricade?.idempotent ?? false} />
          Esta operação pode ser repetida com segurança (necessário para fallback de POST, PUT, PATCH ou DELETE)
        </label>
        <label className="flex items-center gap-2 text-sm text-foreground">
          <input type="checkbox" name="active" value="1" defaultChecked={barricade?.active ?? true} />
          Barricada ativa
        </label>
        <button type="submit" disabled={pending} className={submitClass}>
          {pending ? "Salvando..." : "Salvar barricada"}
        </button>
      </form>
      <form action={previewAction} className="rounded-[14px] border border-line bg-card/80 p-4">
        <h2 className="text-sm font-medium">Prévia da resposta</h2>
        <input type="hidden" name="api_id" value={barricade?.apiId ?? ""} />
        <label className="mt-3 block text-sm">
          JSON personalizado
          <textarea name="response_template" defaultValue={barricade?.responseTemplate ?? ""} rows={5} className={`${fieldClass} font-mono`} />
        </label>
        <label className="mt-3 block text-sm">
          Amostra do consumidor
          <textarea name="sample" rows={3} placeholder='{"query":{},"path":{},"body":{}}' className={`${fieldClass} font-mono`} />
        </label>
        <button type="submit" disabled={previewing || !barricade} className={`${submitClass} mt-3`}>
          {previewing ? "Consultando..." : "Testar e pré-visualizar"}
        </button>
        {!barricade ? <p className="mt-2 text-xs text-muted">Salve a barricada e a API antes da prévia ao vivo.</p> : null}
        {previewState.error ? <p className={`${alertClass} mt-3`}>{previewState.error}</p> : null}
        {previewState.preview ? (
          <div className="mt-3 grid gap-3 text-xs md:grid-cols-2">
            <pre className="overflow-auto rounded-[12px] border border-line p-3 text-muted">{previewState.preview.responseBody}</pre>
            <pre className="overflow-auto rounded-[12px] border border-line p-3 text-foreground">{previewState.preview.transformed}</pre>
          </div>
        ) : null}
      </form>
      {barricade ? (
        <form action={tokenAction}>
          <input type="hidden" name="id" value={barricade.id} />
          <button type="submit" disabled={renewing} className="rounded-[12px] border border-line px-4 py-2 text-sm text-foreground hover:border-accent">
            {renewing ? "Renovando..." : "Renovar token"}
          </button>
          {tokenState.error ? <p className={`${alertClass} mt-3`}>{tokenState.error}</p> : null}
        </form>
      ) : null}
    </div>
  );
}
