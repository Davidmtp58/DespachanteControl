import type { PostgresExecutor } from '../database/postgres.js';
import type { ServicoRepository } from './servico-repository.js';
import type { Servico, ServicoInput, TipoServico } from '../services/servico-validation.js';

// Text projections avoid pg/JS Date millisecond reduction and timezone conversion.
const timestamp = (expression: string) => `rtrim(rtrim(to_char(${expression}, 'YYYY-MM-DD"T"HH24:MI:SS.US'), '0'), '.')`;
const fields = `id_servico,id_cliente,id_veiculo,id_tipo_servico,
  ${timestamp('data_inicio')} AS data_inicio, ${timestamp('data_conclusao')} AS data_conclusao,
  status,valor_recebido::text AS valor_recebido,observacoes,
  ${timestamp("data_cadastro AT TIME ZONE 'UTC'")} AS data_cadastro`;
const values = (data: ServicoInput) => [data.id_cliente, data.id_veiculo, data.id_tipo_servico,
  data.data_inicio, data.data_conclusao, data.status, data.valor_recebido, data.observacoes];
export class PostgresServicoRepository implements ServicoRepository {
  constructor(private readonly database: PostgresExecutor) {}
  list() { return this.database.query<Servico>(`SELECT ${fields} FROM app.servico ORDER BY id_servico`); }
  async find(id: number) { return (await this.database.query<Servico>(`SELECT ${fields} FROM app.servico WHERE id_servico=$1`, [id]))[0]; }
  types() { return this.database.query<TipoServico>('SELECT id_tipo_servico,nome,descricao,ativo FROM app.tipo_servico ORDER BY id_tipo_servico'); }
  async missingReference(data: ServicoInput) {
    for (const [table, column, id] of [
      ['cliente', 'id_cliente', data.id_cliente], ['veiculo', 'id_veiculo', data.id_veiculo],
      ['tipo_servico', 'id_tipo_servico', data.id_tipo_servico],
    ] as const) {
      if (!(await this.database.query(`SELECT ${column} FROM app.${table} WHERE ${column}=$1`, [id])).length) return column;
    }
  }
  async create(data: ServicoInput) {
    const rows = await this.database.query<Servico>(`INSERT INTO app.servico
      (id_cliente,id_veiculo,id_tipo_servico,data_inicio,data_conclusao,status,valor_recebido,observacoes)
      VALUES ($1,$2,$3,app.parse_timestamp($4::text),app.parse_timestamp($5::text),$6,$7::numeric(10,2),$8)
      RETURNING ${fields}`, values(data));
    if (!rows[0]) throw new Error('Insert sem resultado.');
    return rows[0];
  }
  async update(id: number, data: ServicoInput) {
    return (await this.database.query<Servico>(`UPDATE app.servico SET id_cliente=$1,id_veiculo=$2,id_tipo_servico=$3,
      data_inicio=app.parse_timestamp($4::text),data_conclusao=app.parse_timestamp($5::text),
      status=$6,valor_recebido=$7::numeric(10,2),observacoes=$8 WHERE id_servico=$9 RETURNING ${fields}`, [...values(data), id]))[0];
  }
}
