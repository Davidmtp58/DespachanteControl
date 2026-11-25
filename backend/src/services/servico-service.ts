import { HttpError } from '../middleware/error-handler.js';
import type { ServicoRepository } from '../repositories/servico-repository.js';
import { routeId } from './validation.js';
import { validateServico, type ServicoInput } from './servico-validation.js';

export class ServicoService {
  constructor(private readonly repository: ServicoRepository, private readonly validate = validateServico) {}
  list() { return this.repository.list(); }
  types() { return this.repository.types(); }
  async find(id: unknown) {
    const result = await this.repository.find(routeId(id, 'serviço'));
    if (!result) throw new HttpError(404, 'SERVICE_NOT_FOUND', 'Serviço não encontrado.');
    return result;
  }
  private async references(data: ServicoInput) {
    if (await this.repository.missingReference(data)) throw new HttpError(400, 'INVALID_REFERENCE', 'Cliente, veículo ou tipo de serviço não encontrado.');
  }
  private async write<T>(operation: () => Promise<T>): Promise<T> {
    try { return await operation(); }
    catch (error) {
      const number = (error as { number?: number } | null)?.number;
      const pg = error as { code?: string; constraint?: string; table?: string } | null;
      if (pg?.code === '23505' && pg.constraint === 'servico_pkey') throw new HttpError(409, 'DUPLICATE_SERVICE', 'Conflito de unicidade no serviço.');
      if ((pg?.code === '23503' && ['fk_servico_cliente', 'fk_servico_veiculo', 'fk_servico_tipo'].includes(pg.constraint ?? '')) ||
          (pg?.code === '23514' && ['ck_servico_status', 'ck_servico_valor', 'ck_servico_conclusao'].includes(pg.constraint ?? '')) ||
          (pg?.code === '23502' && pg.table === 'servico')) throw new HttpError(400, 'INTEGRITY_ERROR', 'Dados incompatíveis com as restrições do serviço.');
      if (pg?.code === '22007') throw new HttpError(400, 'VALIDATION_ERROR', 'Data/hora inválida para PostgreSQL (máximo de 6 casas, sem fuso).');
      if (number === 2601 || number === 2627) throw new HttpError(409, 'DUPLICATE_SERVICE', 'Conflito de unicidade no serviço.');
      if (number === 547 || number === 515) throw new HttpError(400, 'INTEGRITY_ERROR', 'Dados incompatíveis com as restrições do serviço.');
      throw error;
    }
  }
  async create(body: unknown) {
    const data = this.validate(body);
    await this.references(data);
    return this.write(() => this.repository.create(data));
  }
  async update(id: unknown, body: unknown) {
    const key = routeId(id, 'serviço');
    const data = this.validate(body);
    await this.find(id);
    await this.references(data);
    const result = await this.write(() => this.repository.update(key, data));
    if (!result) throw new HttpError(404, 'SERVICE_NOT_FOUND', 'Serviço não encontrado.');
    return result;
  }
}
