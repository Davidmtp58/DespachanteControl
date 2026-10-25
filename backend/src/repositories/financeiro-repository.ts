import sql from 'mssql';
import type { QueryExecutor } from '../database/connection.js';

export interface DashboardResumo {
  receita_total: string; custos_totais: string; resultado_liquido: string;
  quantidade_servicos: number; servicos_em_andamento: number;
}
export interface ResumoFinanceiro {
  id_servico: number; cliente: string; placa: string; tipo_servico: string; status: string;
  valor_recebido: string; custo_total: string; resultado_liquido: string;
}
export interface FinanceiroServico extends ResumoFinanceiro { data_inicio: string; data_conclusao: string | null }
export interface FinanceiroRepository {
  dashboard(): Promise<DashboardResumo | undefined>;
  list(): Promise<FinanceiroServico[]>;
  find(id: number): Promise<ResumoFinanceiro | undefined>;
}
// Somente representação decimal; os cálculos continuam nos objetos existentes.
const decimal = (column: string) => `CONVERT(varchar(41), CAST(${column} AS decimal(38,2))) AS ${column}`;
const identity = 'id_servico, cliente, placa, tipo_servico, status';
const amounts = ['valor_recebido', 'custo_total', 'resultado_liquido'].map(decimal).join(', ');

export class SqlFinanceiroRepository implements FinanceiroRepository {
  constructor(private readonly database: QueryExecutor) {}
  async dashboard() {
    return (await this.database.query<DashboardResumo>(`SELECT ${['receita_total', 'custos_totais', 'resultado_liquido'].map(decimal).join(', ')},
      quantidade_servicos, servicos_em_andamento FROM dbo.vw_DashboardResumo`))[0];
  }
  list() {
    return this.database.query<FinanceiroServico>(`SELECT ${identity},
      CONVERT(varchar(27), data_inicio, 126) AS data_inicio,
      CONVERT(varchar(27), data_conclusao, 126) AS data_conclusao,
      ${amounts} FROM dbo.vw_ResumoFinanceiroServico ORDER BY id_servico`);
  }
  async find(id: number) {
    // Captura local ao batch para formatar DECIMAL antes de chegar ao driver.
    // Não grava em nenhuma tabela persistente nem reproduz cálculos da procedure.
    return (await this.database.query<ResumoFinanceiro>(`DECLARE @resumo TABLE (
      id_servico int, cliente varchar(150), placa varchar(7), tipo_servico varchar(100), status varchar(20),
      valor_recebido decimal(38,2), custo_total decimal(38,2), resultado_liquido decimal(38,2)
    );
    INSERT INTO @resumo EXEC dbo.sp_ResumoFinanceiroServico @id_servico = @id;
    SELECT ${identity}, ${amounts} FROM @resumo;`, [{ name: 'id', type: sql.Int(), value: id }]))[0];
  }
}
