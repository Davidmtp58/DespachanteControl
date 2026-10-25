import { HttpError } from '../middleware/error-handler.js';

export const invalid = (message: string): never => { throw new HttpError(400, 'VALIDATION_ERROR', message); };

export function money(value: unknown, field: string, positive = false): string {
  if ((typeof value !== 'string' && typeof value !== 'number') || !/^(?:0|[1-9]\d{0,7})(?:\.\d{1,2})?$/.test(String(value))) {
    return invalid(`${field} deve estar entre ${positive ? '0.01' : '0'} e 99999999.99, com até duas casas decimais.`);
  }
  const [whole, fraction = ''] = String(value).split('.');
  const result = `${whole}.${fraction.padEnd(2, '0')}`;
  if (positive && result === '0.00') return invalid(`${field} deve ser maior que zero.`);
  return result;
}

export function routeId(value: unknown, entity: string): number {
  if (typeof value !== 'string' || !/^[1-9]\d*$/.test(value) || Number(value) > 2147483647) {
    return invalid(`ID de ${entity} inválido.`);
  }
  return Number(value);
}

export function requiredText(value: unknown, field: string, max: number): string {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > max || /[\x00-\x1f\x7f]/.test(value)) {
    return invalid(`Campo ${field} inválido (máximo ${max} caracteres).`);
  }
  return value.trim();
}
