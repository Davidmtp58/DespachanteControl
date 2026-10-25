import { HttpError } from '../middleware/error-handler.js';
import type { VeiculoRepository } from '../repositories/veiculo-repository.js';
import { routeId } from './validation.js';
import { validateVeiculo, type VeiculoInput } from './veiculo-validation.js';

export class VeiculoService {
  constructor(private readonly repository: VeiculoRepository) {}
  list() { return this.repository.list(); }
  async find(id: unknown) {
    const vehicle = await this.repository.find(routeId(id, 'veículo'));
    if (!vehicle) throw new HttpError(404, 'VEHICLE_NOT_FOUND', 'Veículo não encontrado.');
    return vehicle;
  }
  private async checkOwner(id: number) {
    if (!await this.repository.ownerExists(id)) throw new HttpError(400, 'OWNER_NOT_FOUND', 'Cliente proprietário não encontrado.');
  }
  private async conflictError(data: VeiculoInput, id?: number) {
    const { placa, renavam } = await this.repository.conflicts(data, id);
    if (placa && renavam) return new HttpError(409, 'DUPLICATE_PLATE_AND_RENAVAM', 'Esta placa já está cadastrada em outro veículo. Este RENAVAM já está cadastrado em outro veículo.');
    if (placa) return new HttpError(409, 'DUPLICATE_PLATE', 'Esta placa já está cadastrada em outro veículo.');
    if (renavam) return new HttpError(409, 'DUPLICATE_RENAVAM', 'Este RENAVAM já está cadastrado em outro veículo.');
    return undefined;
  }
  private async write<T>(data: VeiculoInput, id: number | undefined, operation: () => Promise<T>): Promise<T> {
    const conflict = await this.conflictError(data, id);
    if (conflict) throw conflict;
    try { return await operation(); }
    catch (error) {
      const number = (error as { number?: number } | null)?.number;
      if (number === 2601 || number === 2627) {
        // UNIQUE remains authoritative when another request wins the race.
        let identified: HttpError | undefined;
        try { identified = await this.conflictError(data, id); } catch { /* Safe fallback if lookup fails. */ }
        throw identified ?? new HttpError(409, 'DUPLICATE_VEHICLE', 'Placa ou RENAVAM já cadastrado.');
      }
      // A FK protege também contra remoção concorrente do proprietário após a consulta.
      if (number === 547) throw new HttpError(400, 'OWNER_NOT_FOUND', 'Cliente proprietário não encontrado.');
      throw error;
    }
  }
  async create(body: unknown) {
    const data = validateVeiculo(body);
    await this.checkOwner(data.id_cliente_proprietario);
    return this.write(data, undefined, () => this.repository.create(data));
  }
  async update(id: unknown, body: unknown) {
    const key = routeId(id, 'veículo');
    const data = validateVeiculo(body);
    await this.find(id);
    await this.checkOwner(data.id_cliente_proprietario);
    const vehicle = await this.write(data, key, () => this.repository.update(key, data));
    if (!vehicle) throw new HttpError(404, 'VEHICLE_NOT_FOUND', 'Veículo não encontrado.');
    return vehicle;
  }
}
