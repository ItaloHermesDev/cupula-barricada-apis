export function combinePayloads(parts: unknown[]): unknown {
  const present = parts.filter((part) => part !== undefined);
  if (present.length === 0) return {};
  if (present.length === 1) return present[0];
  const merged: Record<string, unknown> = {};
  present.forEach((part, index) => {
    if (isPlain(part)) Object.assign(merged, part);
    else merged[`api${index + 1}`] = part;
  });
  return merged;
}

export function distinctOutputError(templates: string[]) {
  const seen = new Set<string>();
  for (const template of templates) {
    const trimmed = template.trim();
    if (!trimmed) continue;
    let parsed: unknown;
    try {
      parsed = JSON.parse(trimmed) as unknown;
    } catch {
      return "A resposta combinada precisa ser um JSON válido.";
    }
    if (!isPlain(parsed)) continue;
    for (const key of Object.keys(parsed)) {
      if (seen.has(key)) return `O campo “${key}” está em mais de uma API. Use um nome diferente em cada uma.`;
      seen.add(key);
    }
  }
  return null;
}

function isPlain(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
