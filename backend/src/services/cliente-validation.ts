import { invalid, routeId, requiredText } from './validation.js';

export interface ClienteInput {
  tipo_pessoa: 'PF' | 'PJ';
  nome_razao_social: string;
  cpf_cnpj: string;
  telefone: string;
  email: string | null;
  data_nascimento: string | null;
}
export interface Cliente extends ClienteInput {
  id_cliente: number;
  data_cadastro: Date;
}

export function clienteId(value: unknown): number {
  return routeId(value, 'cliente');
}

function document(value: string, tipo: 'PF' | 'PJ'): string {
  const raw = value.trim().toUpperCase();
  const format = tipo === 'PF' ? /^(?:\d{11}|\d{3}\.\d{3}\.\d{3}-\d{2})$/
    : /^(?:[A-Z0-9]{12}\d{2}|[A-Z0-9]{2}\.[A-Z0-9]{3}\.[A-Z0-9]{3}\/[A-Z0-9]{4}-\d{2})$/;
  if (!format.test(raw)) return invalid('Formato de CPF/CNPJ inválido para o tipo de pessoa.');
  const normalized = raw.replace(/[.\/-]/g, '');
  if (/^(.)\1+$/.test(normalized)) return invalid('CPF/CNPJ inválido.');
  const baseLength = tipo === 'PF' ? 9 : 12;
  for (let position = baseLength; position < baseLength + 2; position++) {
    let sum = 0;
    for (let i = 0; i < position; i++) {
      const weight = tipo === 'PF' ? position + 1 - i : (position - 1 - i) % 8 + 2;
      sum += (normalized.charCodeAt(i) - 48) * weight;
    }
    const remainder = sum % 11;
    if (Number(normalized[position]) !== (remainder < 2 ? 0 : 11 - remainder)) return invalid('CPF/CNPJ inválido.');
  }
  return normalized;
}

export function validateCliente(body: unknown): ClienteInput {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return invalid('Envie um objeto JSON de cliente.');
  const data = body as Record<string, unknown>;
  const allowed = ['tipo_pessoa', 'nome_razao_social', 'cpf_cnpj', 'telefone', 'email', 'data_nascimento'];
  if (Object.keys(data).some(key => !allowed.includes(key))) return invalid('O corpo contém campos não permitidos.');
  function text(key: string, max: number, optional = false): string | null {
    const value = data[key];
    if (optional && (value === undefined || value === null || value === '')) return null;
    return requiredText(value, key, max);
  }
  if (data.tipo_pessoa !== 'PF' && data.tipo_pessoa !== 'PJ') return invalid('tipo_pessoa deve ser PF ou PJ.');
  const email = text('email', 150, true);
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return invalid('E-mail inválido.');
  const birth = text('data_nascimento', 10, true);
  if (birth) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(birth) || birth < '0001-01-01') return invalid('Data deve usar YYYY-MM-DD.');
    const date = new Date(`${birth}T00:00:00.000Z`);
    if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== birth) return invalid('Data de nascimento inválida.');
  }
  return {
    tipo_pessoa: data.tipo_pessoa,
    nome_razao_social: text('nome_razao_social', 150)!,
    cpf_cnpj: document(text('cpf_cnpj', 18)!, data.tipo_pessoa),
    telefone: text('telefone', 20)!,
    email,
    data_nascimento: birth,
  };
}
