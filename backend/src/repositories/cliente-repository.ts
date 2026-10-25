import sql from 'mssql';
import type { QueryExecutor, SqlParameter } from '../database/connection.js';
import type { Cliente, ClienteInput } from '../services/cliente-validation.js';

export interface ClienteRepository {
  list(): Promise<Cliente[]>;
  find(id: number): Promise<Cliente | undefined>;
  create(data: ClienteInput): Promise<Cliente>;
  update(id: number, data: ClienteInput): Promise<Cliente | undefined>;
}
const columns = ['id_cliente', 'tipo_pessoa', 'nome_razao_social', 'cpf_cnpj', 'telefone', 'email', 'data_nascimento', 'data_cadastro'];
const projection = (prefix = '') => columns.map(field => field === 'data_nascimento'
  ? `CONVERT(char(10), ${prefix}${field}, 23) AS data_nascimento` : `${prefix}${field}`).join(', ');
const fields = projection();
const output = projection('INSERTED.');
const idParameter = (id: number): SqlParameter => ({ name: 'id', type: sql.Int(), value: id });
function parameters(data: ClienteInput): SqlParameter[] {
  return [
    { name: 'tipo', type: sql.VarChar(2), value: data.tipo_pessoa },
    { name: 'nome', type: sql.VarChar(150), value: data.nome_razao_social },
    { name: 'documento', type: sql.VarChar(14), value: data.cpf_cnpj },
    { name: 'telefone', type: sql.VarChar(20), value: data.telefone },
    { name: 'email', type: sql.VarChar(150), value: data.email },
    { name: 'nascimento', type: sql.Date(), value: data.data_nascimento ? new Date(`${data.data_nascimento}T00:00:00.000Z`) : null },
  ];
}

export class SqlClienteRepository implements ClienteRepository {
  constructor(private readonly database: QueryExecutor) {}
  list() { return this.database.query<Cliente>(`SELECT ${fields} FROM dbo.Cliente ORDER BY id_cliente`); }
  async find(id: number) {
    return (await this.database.query<Cliente>(`SELECT ${fields} FROM dbo.Cliente WHERE id_cliente = @id`, [idParameter(id)]))[0];
  }
  async create(data: ClienteInput) {
    const rows = await this.database.query<Cliente>(`INSERT INTO dbo.Cliente
      (tipo_pessoa, nome_razao_social, cpf_cnpj, telefone, email, data_nascimento)
      OUTPUT ${output}
      VALUES (@tipo, @nome, @documento, @telefone, @email, @nascimento)`, parameters(data));
    if (!rows[0]) throw new Error('Insert sem resultado.');
    return rows[0];
  }
  async update(id: number, data: ClienteInput) {
    return (await this.database.query<Cliente>(`UPDATE dbo.Cliente SET
      tipo_pessoa = @tipo, nome_razao_social = @nome, cpf_cnpj = @documento,
      telefone = @telefone, email = @email, data_nascimento = @nascimento
      OUTPUT ${output} WHERE id_cliente = @id`, [...parameters(data), idParameter(id)]))[0];
  }
}
