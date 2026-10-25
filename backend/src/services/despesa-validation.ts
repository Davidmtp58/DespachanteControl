import { invalid, requiredText, money } from './validation.js';

export interface DespesaInput {
  id_servico: number;
  descricao: string;
  valor: string;
  data_despesa: string;
  observacoes: string | null;
}
export interface Despesa extends DespesaInput { id_despesa: number }

export function validateDespesa(body: unknown): DespesaInput {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return invalid('Envie um objeto JSON de despesa.');
  const data = body as Record<string, unknown>;
  if (Object.keys(data).some(key => !['id_servico', 'descricao', 'valor', 'data_despesa', 'observacoes'].includes(key))) {
    return invalid('O corpo contém campos não permitidos.');
  }
  const id = data.id_servico;
  if (typeof id !== 'number' || !Number.isInteger(id) || id < 1 || id > 2147483647) return invalid('id_servico deve ser um inteiro positivo válido.');
  const date = data.data_despesa;
  if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date) || date < '0001-01-01') return invalid('data_despesa deve usar YYYY-MM-DD.');
  const parsed = new Date(`${date}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date) return invalid('data_despesa inválida.');
  return { id_servico: id, descricao: requiredText(data.descricao, 'descricao', 150), valor: money(data.valor, 'valor', true),
    data_despesa: date, observacoes: data.observacoes == null || data.observacoes === '' ? null : requiredText(data.observacoes, 'observacoes', 300) };
}
