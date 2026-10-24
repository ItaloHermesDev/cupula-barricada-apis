const CODE_LABEL: Record<string, string> = {
  nao_encontrada: "Barricada não encontrada.",
  nao_autorizado: "Token ausente ou inválido.",
  origem_negada: "Origem ausente ou não autorizada.",
  inativa: "Esta barricada está desativada.",
  metodo_invalido: "Método não permitido nesta barricada.",
  limite_diario: "O limite diário desta barricada foi atingido.",
  limite_minuto: "O limite de requisições por minuto foi atingido.",
  parametro_obrigatorio: "Faltam parâmetros obrigatórios.",
  parametro_desconhecido: "A requisição enviou um parâmetro que esta barricada não aceita.",
  parametro_invalido: "Um parâmetro da requisição é inválido.",
  payload_invalido: "O corpo da requisição não é um JSON válido.",
  payload_grande: "O corpo da requisição excede o tamanho permitido.",
  limite_entrada: "Muitas requisições em sequência.",
  destino_bloqueado: "O destino configurado não pode ser chamado.",
  indisponivel: "O serviço externo não respondeu.",
  tempo_esgotado: "O serviço externo excedeu o tempo limite.",
  cota: "A cota do provedor foi atingida.",
  provedor: "A chamada foi recusada pelo serviço externo.",
  http_4xx: "A API recusou a chamada.",
  http_5xx: "A API falhou.",
  conexao: "Sem conexão com a API.",
  redirecionamento: "A API tentou redirecionar.",
  resposta_grande: "A resposta da API passou de 1 MB.",
  regra: "Uma regra de erro disparou.",
};

const TONE = {
  success: "border-success/40 bg-success/10 text-success",
  warning: "border-warning/40 bg-warning/10 text-warning",
  danger: "border-danger/40 bg-danger/10 text-danger",
  accent: "border-accent/40 bg-accent/10 text-accent",
  muted: "border-line bg-field text-muted",
};

export function logResult(outcome: string, failure?: string | null) {
  if (outcome === "sucesso") return { label: "Funcionou", className: TONE.success };
  if (outcome === "fallback") return { label: "Funcionou pela reserva", className: TONE.accent };
  if (outcome === "falha" && failure?.startsWith("As reservas falharam")) {
    return { label: "A cascata falhou", className: TONE.danger };
  }
  if (outcome === "falha" && failure?.startsWith("As duas falharam")) {
    return { label: "As duas falharam", className: TONE.danger };
  }
  if (outcome === "falha") return { label: "Não funcionou", className: TONE.danger };
  if (outcome === "rejeitada") return { label: "Recusada", className: TONE.warning };
  return { label: "Verificação", className: TONE.muted };
}

export function readableFailure(raw: string | null | undefined) {
  const text = raw?.replace(/\s+/g, " ").trim();
  if (!text) return "";
  return text.split(" · ").map(translatePart).join(" · ");
}

export function logDetail(row: {
  outcome: string;
  failure_reason: string | null;
  fallback_reason: string | null;
}) {
  const failure = readableFailure(row.failure_reason);
  if (row.outcome === "fallback") {
    if (failure) return `${failure} A reserva respondeu no lugar.`;
    const why = readableFailure(row.fallback_reason);
    if (why) return `A reserva respondeu no lugar. Motivo: ${why}`;
    return "A reserva respondeu no lugar da API principal.";
  }
  if (row.outcome === "sucesso") return failure;
  if (failure) return failure;
  if (row.outcome === "falha") return "A API não devolveu o motivo da falha.";
  if (row.outcome === "rejeitada") return "A barricada recusou a chamada antes de falar com a API.";
  return "";
}

export function httpLabel(status: number | null | undefined) {
  if (status == null || status <= 0) return "—";
  return String(status);
}

function translatePart(part: string) {
  const piece = part.trim();
  if (!piece) return "";
  if (piece.startsWith("reserva:")) {
    const rest = piece.slice("reserva:".length).trim();
    return rest ? `A reserva não assumiu. ${rest}` : "A reserva não assumiu.";
  }
  if (piece.startsWith("Ficou de fora:")) return piece;
  const http = piece.match(/^http_(\d{3})$/);
  if (http) return `HTTP ${http[1]}`;
  if (CODE_LABEL[piece]) return CODE_LABEL[piece];
  const prefixed = piece.match(/^([a-z0-9_]+):\s*(.+)$/i);
  if (prefixed && CODE_LABEL[prefixed[1]]) {
    return `${CODE_LABEL[prefixed[1]].replace(/\.$/, "")}: ${prefixed[2]}`;
  }
  return piece;
}
