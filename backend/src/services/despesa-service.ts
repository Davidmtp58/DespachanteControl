import { HttpError } from '../middleware/error-handler.js';
import { unchanged, type InputNormalizer } from './unicode.js';
import type { DespesaRepository } from '../repositories/despesa-repository.js';
import { routeId } from './validation.js';
import { validateDespesa } from './despesa-validation.js';

export class DespesaService {
  constructor(private readonly repository: DespesaRepository, private readonly normalize: InputNormalizer = unchanged) {}
  list() { return this.repository.list(); }
  async byService(id: unknown) {
    const key = routeId(id, 'serviço');
    if (!await this.repository.serviceExists(key)) throw new HttpError(404, 'SERVICE_NOT_FOUND', 'Serviço não encontrado.');
    return this.repository.list(key);
  }
  async find(id: unknown) {
    const result = await this.repository.find(routeId(id, 'despesa'));
    if (!result) throw new HttpError(404, 'EXPENSE_NOT_FOUND', 'Despesa não encontrada.');
    return result;
  }
  private async checkService(id: number) {
    if (!await this.repository.serviceExists(id)) throw new HttpError(400, 'INVALID_REFERENCE', 'Serviço não encontrado.');
  }
  private async write<T>(operation: () => Promise<T>): Promise<T> {
    try { return await operation(); }
    catch (error) {
      const number = (error as { number?: number } | null)?.number;
      const pg = error as { code?: string; constraint?: string; table?: string } | null;
      if ((pg?.code === '23503' && pg.constraint === 'fk_despesa_servico') ||
          (pg?.code === '23514' && pg.constraint === 'ck_despesa_valor') ||
          (pg?.code === '23502' && pg.table === 'despesa_servico')) throw new HttpError(400, 'INTEGRITY_ERROR', 'Dados incompatíveis com as restrições da despesa.');
      if (pg?.code === '23505' && pg.constraint === 'despesa_servico_pkey') throw new HttpError(409, 'DUPLICATE_EXPENSE', 'Conflito de unicidade na despesa.');
      if (number === 547 || number === 515) throw new HttpError(400, 'INTEGRITY_ERROR', 'Dados incompatíveis com as restrições da despesa.');
      if (number === 2601 || number === 2627) throw new HttpError(409, 'DUPLICATE_EXPENSE', 'Conflito de unicidade na despesa.');
      throw error;
    }
  }
  async create(body: unknown) {
    const data = validateDespesa(this.normalize(body));
    await this.checkService(data.id_servico);
    return this.write(() => this.repository.create(data));
  }
  async update(id: unknown, body: unknown) {
    const key = routeId(id, 'despesa');
    const data = validateDespesa(this.normalize(body));
    await this.find(id);
    await this.checkService(data.id_servico);
    const result = await this.write(() => this.repository.update(key, data));
    if (!result) throw new HttpError(404, 'EXPENSE_NOT_FOUND', 'Despesa não encontrada.');
    return result;
  }
  async delete(id: unknown) {
    if (!await this.write(() => this.repository.delete(routeId(id, 'despesa')))) throw new HttpError(404, 'EXPENSE_NOT_FOUND', 'Despesa não encontrada.');
  }
}
