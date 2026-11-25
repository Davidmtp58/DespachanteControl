import { validateServico } from './servico-validation.js';
import { normalizeServico } from './unicode.js';
import { invalid } from './validation.js';

export function validatePostgresServico(body: unknown) {
  const normalized = normalizeServico(body);
  if (normalized && typeof normalized === 'object' && !Array.isArray(normalized)) {
    const input = normalized as Record<string, unknown>;
    for (const field of ['data_inicio', 'data_conclusao']) {
      const value = input[field];
      if (typeof value === 'string' && /\.\d{7,}/.test(value)) {
        return invalid(`${field} aceita no máximo 6 casas decimais no PostgreSQL; não há arredondamento automático.`);
      }
    }
  }
  // Reuse all business/calendar/money rules, but bind original timestamps to
  // parse_timestamp: never pass the SQL Server validator's seven-digit padding.
  const validated = validateServico(normalized);
  const input = normalized as Record<string, unknown>;
  return { ...validated, data_inicio: input.data_inicio as string,
    data_conclusao: input.data_conclusao == null ? null : input.data_conclusao as string };
}
