import type { PostgresExecutor } from '../database/postgres.js';
import type { DespesaRepository } from './despesa-repository.js';
import type { Despesa, DespesaInput } from '../services/despesa-validation.js';

const fields = `id_despesa,id_servico,descricao,valor::text AS valor,
  to_char(data_despesa,'YYYY-MM-DD') AS data_despesa,observacoes`;
const values = (data: DespesaInput) => [data.id_servico, data.descricao, data.valor, data.data_despesa, data.observacoes];
export class PostgresDespesaRepository implements DespesaRepository {
  constructor(private readonly database: PostgresExecutor) {}
  list(serviceId?: number) {
    return this.database.query<Despesa>(`SELECT ${fields} FROM app.despesa_servico${serviceId === undefined ? '' : ' WHERE id_servico=$1'} ORDER BY id_despesa`, serviceId === undefined ? [] : [serviceId]);
  }
  async find(id: number) { return (await this.database.query<Despesa>(`SELECT ${fields} FROM app.despesa_servico WHERE id_despesa=$1`, [id]))[0]; }
  async serviceExists(id: number) { return (await this.database.query('SELECT id_servico FROM app.servico WHERE id_servico=$1', [id])).length > 0; }
  async create(data: DespesaInput) {
    const rows = await this.database.query<Despesa>(`INSERT INTO app.despesa_servico(id_servico,descricao,valor,data_despesa,observacoes)
      VALUES ($1,$2,$3::numeric(10,2),$4::date,$5) RETURNING ${fields}`, values(data));
    if (!rows[0]) throw new Error('Insert sem resultado.');
    return rows[0];
  }
  async update(id: number, data: DespesaInput) {
    return (await this.database.query<Despesa>(`UPDATE app.despesa_servico SET id_servico=$1,descricao=$2,
      valor=$3::numeric(10,2),data_despesa=$4::date,observacoes=$5 WHERE id_despesa=$6 RETURNING ${fields}`, [...values(data), id]))[0];
  }
  async delete(id: number) {
    return (await this.database.query('DELETE FROM app.despesa_servico WHERE id_despesa=$1 RETURNING id_despesa', [id])).length > 0;
  }
}
