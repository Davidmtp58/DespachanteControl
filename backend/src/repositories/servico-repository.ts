import sql from 'mssql';
import type { QueryExecutor, SqlParameter } from '../database/connection.js';
import type { Servico, ServicoInput, TipoServico } from '../services/servico-validation.js';

export interface ServicoRepository {
  list(): Promise<Servico[]>;
  find(id: number): Promise<Servico | undefined>;
  types(): Promise<TipoServico[]>;
  missingReference(data: ServicoInput): Promise<string | undefined>;
  create(data: ServicoInput): Promise<Servico>;
  update(id: number, data: ServicoInput): Promise<Servico | undefined>;
}
const columns = ['id_servico', 'id_cliente', 'id_veiculo', 'id_tipo_servico', 'data_inicio', 'data_conclusao', 'status', 'valor_recebido', 'observacoes', 'data_cadastro'];
const projection = (prefix = '') => columns.map(column => {
  if (column.startsWith('data_')) return `CONVERT(varchar(27), ${prefix}${column}, 126) AS ${column}`;
  if (column === 'valor_recebido') return `CONVERT(varchar(13), ${prefix}${column}) AS ${column}`;
  return `${prefix}${column}`;
}).join(', ');
const idParameter = (id: number): SqlParameter => ({ name: 'id', type: sql.Int(), value: id });
function parameters(data: ServicoInput): SqlParameter[] {
  return [
    { name: 'cliente', type: sql.Int(), value: data.id_cliente },
    { name: 'veiculo', type: sql.Int(), value: data.id_veiculo },
    { name: 'tipo', type: sql.Int(), value: data.id_tipo_servico },
    { name: 'inicio', type: sql.VarChar(27), value: data.data_inicio },
    { name: 'conclusao', type: sql.VarChar(27), value: data.data_conclusao },
    { name: 'status', type: sql.VarChar(20), value: data.status },
    { name: 'valor', type: sql.Decimal(10, 2), value: Number(data.valor_recebido) },
    { name: 'observacoes', type: sql.VarChar(500), value: data.observacoes },
  ];
}
export class SqlServicoRepository implements ServicoRepository {
  constructor(private readonly database: QueryExecutor) {}
  list() { return this.database.query<Servico>(`SELECT ${projection()} FROM dbo.Servico ORDER BY id_servico`); }
  async find(id: number) {
    return (await this.database.query<Servico>(`SELECT ${projection()} FROM dbo.Servico WHERE id_servico = @id`, [idParameter(id)]))[0];
  }
  types() { return this.database.query<TipoServico>('SELECT id_tipo_servico, nome, descricao, ativo FROM dbo.TipoServico ORDER BY id_tipo_servico'); }
  async missingReference(data: ServicoInput) {
    // Tabelas e colunas são constantes internas, nunca entrada do usuário.
    for (const [table, column, id] of [
      ['Cliente', 'id_cliente', data.id_cliente], ['Veiculo', 'id_veiculo', data.id_veiculo],
      ['TipoServico', 'id_tipo_servico', data.id_tipo_servico],
    ] as const) {
      if (!(await this.database.query(`SELECT ${column} FROM dbo.${table} WHERE ${column} = @id`, [idParameter(id)])).length) return column;
    }
  }
  async create(data: ServicoInput) {
    const rows = await this.database.query<Servico>(`INSERT INTO dbo.Servico
      (id_cliente, id_veiculo, id_tipo_servico, data_inicio, data_conclusao, status, valor_recebido, observacoes)
      OUTPUT ${projection('INSERTED.')}
      VALUES (@cliente, @veiculo, @tipo, CONVERT(datetime2(7), @inicio, 126), CONVERT(datetime2(7), @conclusao, 126), @status, @valor, @observacoes)`, parameters(data));
    if (!rows[0]) throw new Error('Insert sem resultado.');
    return rows[0];
  }
  async update(id: number, data: ServicoInput) {
    return (await this.database.query<Servico>(`UPDATE dbo.Servico SET
      id_cliente = @cliente, id_veiculo = @veiculo, id_tipo_servico = @tipo,
      data_inicio = CONVERT(datetime2(7), @inicio, 126), data_conclusao = CONVERT(datetime2(7), @conclusao, 126),
      status = @status, valor_recebido = @valor, observacoes = @observacoes
      OUTPUT ${projection('INSERTED.')} WHERE id_servico = @id`, [...parameters(data), idParameter(id)]))[0];
  }
}
