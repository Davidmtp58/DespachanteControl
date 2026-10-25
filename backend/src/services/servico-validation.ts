import { invalid, requiredText, money } from './validation.js';

export interface ServicoInput {
  id_cliente: number;
  id_veiculo: number;
  id_tipo_servico: number;
  data_inicio: string;
  data_conclusao: string | null;
  status: 'EM_ANDAMENTO' | 'CONCLUIDO' | 'CANCELADO';
  valor_recebido: string;
  observacoes: string | null;
}
export interface Servico extends ServicoInput { id_servico: number; data_cadastro: string }
export interface TipoServico { id_tipo_servico: number; nome: string; descricao: string | null; ativo: boolean }

// DATETIME2 não contém fuso. Preserva até sete casas, sem conversão via Date do JS.
function dateTime(value: unknown, field: string): string {
  if (typeof value !== 'string') return invalid(`${field} deve ser uma data/hora sem fuso.`);
  const match = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,7}))?$/.exec(value);
  if (!match || match[1] < '0001-01-01' || Number(match[2]) > 23 || Number(match[3]) > 59 || Number(match[4]) > 59) {
    return invalid(`${field} deve usar YYYY-MM-DDTHH:mm:ss, com fração opcional de até 7 casas, sem fuso.`);
  }
  const date = new Date(`${match[1]}T00:00:00Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== match[1]) return invalid(`${field} contém data inválida.`);
  return `${match[1]}T${match[2]}:${match[3]}:${match[4]}.${(match[5] ?? '').padEnd(7, '0')}`;
}

export function validateServico(body: unknown): ServicoInput {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return invalid('Envie um objeto JSON de serviço.');
  const data = body as Record<string, unknown>;
  const allowed = ['id_cliente', 'id_veiculo', 'id_tipo_servico', 'data_inicio', 'data_conclusao', 'status', 'valor_recebido', 'observacoes'];
  if (Object.keys(data).some(key => !allowed.includes(key))) return invalid('O corpo contém campos não permitidos.');
  function id(key: string): number {
    const value = data[key];
    if (typeof value !== 'number' || !Number.isInteger(value) || value < 1 || value > 2147483647) return invalid(`${key} deve ser um inteiro positivo válido.`);
    return value;
  }
  const status = data.status;
  if (status !== 'EM_ANDAMENTO' && status !== 'CONCLUIDO' && status !== 'CANCELADO') return invalid('Status de serviço inválido.');
  const start = dateTime(data.data_inicio, 'data_inicio');
  const end = data.data_conclusao == null ? null : dateTime(data.data_conclusao, 'data_conclusao');
  if (status === 'CONCLUIDO' && end === null) return invalid('Data de conclusão é obrigatória para serviço concluído.');
  if (end !== null && end < start) return invalid('Data de conclusão não pode ser anterior à data de início.');
  const amount = money(data.valor_recebido, 'valor_recebido');
  const notes = data.observacoes == null || data.observacoes === '' ? null : requiredText(data.observacoes, 'observacoes', 500);
  return { id_cliente: id('id_cliente'), id_veiculo: id('id_veiculo'), id_tipo_servico: id('id_tipo_servico'),
    data_inicio: start, data_conclusao: end, status, valor_recebido: amount, observacoes: notes };
}
