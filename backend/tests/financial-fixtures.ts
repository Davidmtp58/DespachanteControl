// Fixed synthetic expectations shared by SQL Server mocked HTTP and real PostgreSQL.
// No monetary calculations in JavaScript, and no claim that mocks execute T-SQL.
export const financialScenarios = [
  { status: 'EM_ANDAMENTO', amount: '150.01', expenses: ['10.02', '0.03'], cost: '10.05', net: '139.96' },
  { status: 'CONCLUIDO', amount: '0.00', expenses: ['1.01'], cost: '1.01', net: '-1.01' },
  { status: 'CANCELADO', amount: '20.02', expenses: ['2.02'], cost: '2.02', net: '18.00' },
  { status: 'EM_ANDAMENTO', amount: '0.00', expenses: [], cost: '0.00', net: '0.00' },
] as const;
export const financialEmpty = { receita_total: '0.00', custos_totais: '0.00', resultado_liquido: '0.00', quantidade_servicos: 0, servicos_em_andamento: 0 };
export const financialExpected = { receita_total: '170.03', custos_totais: '13.08', resultado_liquido: '156.95', quantidade_servicos: 4, servicos_em_andamento: 2 };
export const financialRows = financialScenarios.map((scenario, index) => ({
  id_servico: index + 1, cliente: 'Solicitante sintético', placa: 'FIN1A23', tipo_servico: 'Tipo sintético',
  status: scenario.status, valor_recebido: scenario.amount, custo_total: scenario.cost, resultado_liquido: scenario.net,
  data_inicio: '2026-10-28T12:34:56.123456', data_conclusao: scenario.status === 'CONCLUIDO' ? '2026-10-28T12:34:56.123456' : null,
}));
export const financialSummary = (row: typeof financialRows[number]) => {
  const { data_inicio: _start, data_conclusao: _end, ...summary } = row;
  return summary;
};
