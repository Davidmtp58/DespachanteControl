import type { PostgresExecutor } from '../database/postgres.js';
import type { ClienteRepository } from './cliente-repository.js';
import type { Cliente, ClienteInput } from '../services/cliente-validation.js';
import { HttpError } from '../middleware/error-handler.js';

const fields = `id_cliente, tipo_pessoa, nome_razao_social, cpf_cnpj, telefone, email,
  to_char(data_nascimento, 'YYYY-MM-DD') AS data_nascimento, data_cadastro`;
const values = (data: ClienteInput) => [data.tipo_pessoa, data.nome_razao_social, data.cpf_cnpj,
  data.telefone, data.email, data.data_nascimento];
export class PostgresClienteRepository implements ClienteRepository {
  constructor(private readonly database: PostgresExecutor) {}
  list() { return this.database.query<Cliente>(`SELECT ${fields} FROM app.cliente ORDER BY id_cliente`); }
  async find(id: number) { return (await this.database.query<Cliente>(`SELECT ${fields} FROM app.cliente WHERE id_cliente=$1`, [id]))[0]; }
  private async write(statement: string, parameters: unknown[]) {
    try { return await this.database.query<Cliente>(statement, parameters); }
    catch (error) {
      const pg = error as { code?: string; constraint?: string } | null;
      if (pg?.code === '23505' && pg.constraint === 'uq_cliente_cpf_cnpj') {
        throw new HttpError(409, 'DUPLICATE_DOCUMENT', 'CPF/CNPJ já cadastrado.');
      }
      // Unknown constraints, permission and connectivity errors remain internal.
      throw error;
    }
  }
  async create(data: ClienteInput) {
    const rows = await this.write(`INSERT INTO app.cliente
      (tipo_pessoa,nome_razao_social,cpf_cnpj,telefone,email,data_nascimento)
      VALUES ($1,$2,$3,$4,$5,$6::date) RETURNING ${fields}`, values(data));
    if (!rows[0]) throw new Error('Insert sem resultado.');
    return rows[0];
  }
  async update(id: number, data: ClienteInput) {
    return (await this.write(`UPDATE app.cliente SET tipo_pessoa=$1,nome_razao_social=$2,
      cpf_cnpj=$3,telefone=$4,email=$5,data_nascimento=$6::date WHERE id_cliente=$7 RETURNING ${fields}`, [...values(data), id]))[0];
  }
}
