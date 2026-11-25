import type { PostgresExecutor } from '../database/postgres.js';
import type { DashboardResumo, FinanceiroRepository, FinanceiroServico, ResumoFinanceiro } from './financeiro-repository.js';

// Representation only: all financial calculations belong to the existing views/function.
const decimal = (column: string) => `${column}::numeric(38,2)::text AS ${column}`;
const identity = 'id_servico,cliente,placa,tipo_servico,status';
const amounts = ['valor_recebido', 'custo_total', 'resultado_liquido'].map(decimal).join(',');
const timestamp = (column: string) => `rtrim(rtrim(to_char(${column}, 'YYYY-MM-DD"T"HH24:MI:SS.US'), '0'), '.') AS ${column}`;
export class PostgresFinanceiroRepository implements FinanceiroRepository {
  constructor(private readonly database: PostgresExecutor) {}
  async dashboard() {
    return (await this.database.query<DashboardResumo>(`SELECT
      ${['receita_total', 'custos_totais', 'resultado_liquido'].map(decimal).join(',')},
      quantidade_servicos::integer AS quantidade_servicos,servicos_em_andamento::integer AS servicos_em_andamento
      FROM app.vw_dashboard_resumo`))[0];
  }
  list() {
    return this.database.query<FinanceiroServico>(`SELECT ${identity},${timestamp('data_inicio')},${timestamp('data_conclusao')},
      ${amounts} FROM app.vw_resumo_financeiro_servico ORDER BY id_servico`);
  }
  async find(id: number) {
    return (await this.database.query<ResumoFinanceiro>(`SELECT ${identity},${amounts}
      FROM app.resumo_financeiro_servico($1::integer)`, [id]))[0];
  }
}
