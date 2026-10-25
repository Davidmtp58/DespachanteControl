import sql from 'mssql';
import type { QueryExecutor, SqlParameter } from '../database/connection.js';
import type { Despesa, DespesaInput } from '../services/despesa-validation.js';

export interface DespesaRepository {
  list(serviceId?: number): Promise<Despesa[]>;
  find(id: number): Promise<Despesa | undefined>;
  serviceExists(id: number): Promise<boolean>;
  create(data: DespesaInput): Promise<Despesa>;
  update(id: number, data: DespesaInput): Promise<Despesa | undefined>;
  delete(id: number): Promise<boolean>;
}
const projection = (p = '') => `${p}id_despesa, ${p}id_servico, ${p}descricao,
  CONVERT(varchar(13), ${p}valor) AS valor, CONVERT(char(10), ${p}data_despesa, 23) AS data_despesa, ${p}observacoes`;
const key = (id: number): SqlParameter => ({ name: 'id', type: sql.Int(), value: id });
function parameters(data: DespesaInput): SqlParameter[] {
  return [
    { name: 'servico', type: sql.Int(), value: data.id_servico },
    { name: 'descricao', type: sql.VarChar(150), value: data.descricao },
    { name: 'valor', type: sql.Decimal(10, 2), value: Number(data.valor) },
    { name: 'data', type: sql.Date(), value: new Date(`${data.data_despesa}T00:00:00.000Z`) },
    { name: 'observacoes', type: sql.VarChar(300), value: data.observacoes },
  ];
}
export class SqlDespesaRepository implements DespesaRepository {
  constructor(private readonly database: QueryExecutor) {}
  list(serviceId?: number) {
    return this.database.query<Despesa>(`SELECT ${projection()} FROM dbo.DespesaServico${serviceId === undefined ? '' : ' WHERE id_servico = @id'} ORDER BY id_despesa`, serviceId === undefined ? [] : [key(serviceId)]);
  }
  async find(id: number) {
    return (await this.database.query<Despesa>(`SELECT ${projection()} FROM dbo.DespesaServico WHERE id_despesa = @id`, [key(id)]))[0];
  }
  async serviceExists(id: number) {
    return (await this.database.query('SELECT id_servico FROM dbo.Servico WHERE id_servico = @id', [key(id)])).length > 0;
  }
  async create(data: DespesaInput) {
    const rows = await this.database.query<Despesa>(`INSERT INTO dbo.DespesaServico (id_servico, descricao, valor, data_despesa, observacoes)
      OUTPUT ${projection('INSERTED.')} VALUES (@servico, @descricao, @valor, @data, @observacoes)`, parameters(data));
    if (!rows[0]) throw new Error('Insert sem resultado.');
    return rows[0];
  }
  async update(id: number, data: DespesaInput) {
    return (await this.database.query<Despesa>(`UPDATE dbo.DespesaServico SET id_servico = @servico,
      descricao = @descricao, valor = @valor, data_despesa = @data, observacoes = @observacoes
      OUTPUT ${projection('INSERTED.')} WHERE id_despesa = @id`, [...parameters(data), key(id)]))[0];
  }
  async delete(id: number) {
    return (await this.database.query('DELETE FROM dbo.DespesaServico OUTPUT DELETED.id_despesa WHERE id_despesa = @id', [key(id)])).length > 0;
  }
}
