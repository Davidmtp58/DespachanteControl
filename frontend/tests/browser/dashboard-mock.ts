import { expect, type Page } from "@playwright/test";
export async function mockDashboard(page: Page) {
  const base = {
    id_servico: 7,
    cliente: "Cliente financeiro API",
    placa: "API1A23",
    tipo_servico: "Transferência",
    status: "EM_ANDAMENTO",
    data_inicio: "2026-10-19T13:15:00",
    data_conclusao: null as string | null,
    valor_recebido: "150.10",
    custo_total: "0.00",
    resultado_liquido: "150.10",
  };
  const state = {
    resumo: {
      receita_total: "3390.00",
      custos_totais: "1600.00",
      resultado_liquido: "1790.00",
      quantidade_servicos: 3,
      servicos_em_andamento: 1,
    },
    rows: [
      base,
      {
        ...base,
        id_servico: 8,
        cliente: "Cliente cancelado",
        status: "CANCELADO",
        valor_recebido: "100.00",
        custo_total: "150.00",
        resultado_liquido: "-50.00",
      },
      {
        ...base,
        id_servico: 9,
        cliente: "Cliente concluído",
        status: "CONCLUIDO",
        data_conclusao: "2026-10-19T00:00:00",
        valor_recebido: "3139.90",
        custo_total: "1450.00",
        resultado_liquido: "1689.90",
      },
    ],
    resumoStatus: 200,
    rowsStatus: 200,
    offline: false,
    reads: [] as string[],
  };
  await page.route(/\/api\/(dashboard\/resumo|financeiro\/servicos)$/, async (route) => {
    expect(route.request().method()).toBe("GET");
    const path = new URL(route.request().url()).pathname;
    state.reads.push(path);
    if (state.offline) return route.abort("failed");
    const summary = path.endsWith("resumo");
    const status = summary ? state.resumoStatus : state.rowsStatus;
    return route.fulfill({
      status,
      json:
        status === 200
          ? summary
            ? state.resumo
            : state.rows
          : { error: { message: "SQL internal credentials" } },
    });
  });
  return state;
}
