import type { ClienteRepository } from '../repositories/cliente-repository.js';
import { HttpError } from '../middleware/error-handler.js';
import { clienteId, validateCliente } from './cliente-validation.js';

export class ClienteService {
  constructor(private readonly repository: ClienteRepository) {}
  list() { return this.repository.list(); }
  async find(id: unknown) {
    const result = await this.repository.find(clienteId(id));
    if (!result) throw new HttpError(404, 'CLIENT_NOT_FOUND', 'Cliente não encontrado.');
    return result;
  }
  private async write<T>(operation: () => Promise<T>): Promise<T> {
    try { return await operation(); }
    catch (error) {
      // A restrição UNIQUE arbitra inclusive requisições concorrentes.
      const number = (error as { number?: number } | null)?.number;
      if (number === 2601 || number === 2627) {
        throw new HttpError(409, 'DUPLICATE_DOCUMENT', 'CPF/CNPJ já cadastrado.');
      }
      throw error;
    }
  }
  create(body: unknown) {
    const data = validateCliente(body);
    return this.write(() => this.repository.create(data));
  }
  async update(id: unknown, body: unknown) {
    const key = clienteId(id);
    const data = validateCliente(body);
    const result = await this.write(() => this.repository.update(key, data));
    if (!result) throw new HttpError(404, 'CLIENT_NOT_FOUND', 'Cliente não encontrado.');
    return result;
  }
}
