import { invalid, requiredText } from './validation.js';

export interface VeiculoInput {
  id_cliente_proprietario: number;
  placa: string;
  tipo_veiculo: string;
  marca: string;
  modelo: string;
  ano: number | null;
  renavam: string;
}
export interface Veiculo extends VeiculoInput {
  id_veiculo: number;
  data_cadastro: Date;
}

export const tiposVeiculo = ['Automóvel', 'Motocicleta', 'Motoneta', 'Caminhonete', 'Camioneta', 'Caminhão', 'Ônibus', 'Reboque / Semirreboque', 'Outros'] as const;
export function validateTipoVeiculo(value: string, existing?: string): void {
  if (!(tiposVeiculo as readonly string[]).includes(value) && value !== existing) {
    return invalid('Selecione um tipo de veículo da lista. Um valor anterior só pode ser mantido no próprio veículo.');
  }
}

export function validateVeiculo(body: unknown, deferTypeCheck = false): VeiculoInput {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return invalid('Envie um objeto JSON de veículo.');
  const data = body as Record<string, unknown>;
  const allowed = ['id_cliente_proprietario', 'placa', 'tipo_veiculo', 'marca', 'modelo', 'ano', 'renavam'];
  if (Object.keys(data).some(key => !allowed.includes(key))) return invalid('O corpo contém campos não permitidos.');
  const owner = data.id_cliente_proprietario;
  if (typeof owner !== 'number' || !Number.isInteger(owner) || owner < 1 || owner > 2147483647) {
    return invalid('id_cliente_proprietario deve ser um inteiro positivo válido.');
  }
  const placa = requiredText(data.placa, 'placa', 8).toUpperCase();
  if (!/^(?:[A-Z]{3}-?\d{4}|[A-Z]{3}\d[A-Z]\d{2})$/.test(placa)) return invalid('Placa brasileira inválida.');
  const renavam = requiredText(data.renavam, 'renavam', 11);
  if (!/^\d{11}$/.test(renavam)) return invalid('RENAVAM deve conter exatamente 11 dígitos.');
  const ano = data.ano ?? null;
  if (ano !== null && (typeof ano !== 'number' || !Number.isInteger(ano) || ano < 1000 || ano > 9999)) {
    return invalid('ano deve ser um inteiro de quatro dígitos ou null.');
  }
  const tipo = requiredText(data.tipo_veiculo, 'tipo_veiculo', 30);
  if (!deferTypeCheck) validateTipoVeiculo(tipo);
  return {
    id_cliente_proprietario: owner,
    placa: placa.replace('-', ''),
    tipo_veiculo: tipo,
    marca: requiredText(data.marca, 'marca', 50),
    modelo: requiredText(data.modelo, 'modelo', 80),
    ano: ano as number | null,
    renavam,
  };
}
