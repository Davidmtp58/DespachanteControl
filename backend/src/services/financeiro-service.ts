import { HttpError } from '../middleware/error-handler.js';
import type { FinanceiroRepository } from '../repositories/financeiro-repository.js';
import { routeId } from './validation.js';

export class FinanceiroService {
  constructor(private readonly repository: FinanceiroRepository) {}
  async dashboard() {
    const result = await this.repository.dashboard();
    if (!result) throw new Error('View de dashboard sem resultado.');
    return result;
  }
  list() { return this.repository.list(); }
  async find(id: unknown) {
    const result = await this.repository.find(routeId(id, 'serviço'));
    if (!result) throw new HttpError(404, 'SERVICE_NOT_FOUND', 'Serviço não encontrado.');
    return result;
  }
}
