import { test } from "node:test";
import assert from "node:assert/strict";
import {
  createDashboardClient,
  dashboardFromApi,
  financeiroFromApi,
  moedaFinanceira,
  decimalFinanceiro,
  contarStatus,
} from "../src/services/dashboard";
const resumo = {
  receita_total: "150.10",
  custos_totais: "160.20",
  resultado_liquido: "-10.10",
  quantidade_servicos: 3,
  servicos_em_andamento: 1,
};
const row = {
  id_servico: 7,
  cliente: "Solicitante",
  placa: "ABC1D23",
  tipo_servico: "Transferência",
  status: "EM_ANDAMENTO",
  data_inicio: "2026-10-19T23:59:59.1234567",
  data_conclusao: null,
  valor_recebido: "150.10",
  custo_total: "0.00",
  resultado_liquido: "150.10",
};
test("preserva DECIMAL(38,2), negativos e centavos sem ponto flutuante", () => {
  assert.equal(moedaFinanceira("9007199254740993.01"), "R$ 9.007.199.254.740.993,01");
  assert.equal(moedaFinanceira("-0.01"), "-R$ 0,01");
  assert.equal(moedaFinanceira("0.00"), "R$ 0,00");
  assert.equal(moedaFinanceira("350.5"), "R$ 350,50");
  assert.equal(decimalFinanceiro("9".repeat(36) + ".99"), "9".repeat(36) + ".99");
  for (const value of [0.1, "NaN", "1e3", "0.001", "9".repeat(37), null])
    assert.throws(() => decimalFinanceiro(value));
});
test("totais são os da API, sem recalcular a receita ou excluir cancelados", () => {
  assert.deepEqual(dashboardFromApi(resumo), {
    receita: "150.10",
    custos: "160.20",
    resultado: "-10.10",
    quantidade: 3,
    andamento: 1,
  });
  const rows = [
    row,
    { ...row, id_servico: 8, status: "CONCLUIDO" },
    {
      ...row,
      id_servico: 9,
      status: "CANCELADO",
      custo_total: "180.10",
      resultado_liquido: "-30.00",
    },
  ].map(financeiroFromApi);
  assert.deepEqual(contarStatus(rows), { EM_ANDAMENTO: 1, CONCLUIDO: 1, CANCELADO: 1 });
  assert.equal(rows[0].custo, "0.00");
  assert.equal(rows[0].inicio, "2026-10-19");
  assert.equal(rows[2].resultado, "-30.00");
});
test("vazio é válido somente quando retornado pela API", () => {
  assert.equal(
    dashboardFromApi({
      ...resumo,
      receita_total: "0.00",
      custos_totais: "0.00",
      resultado_liquido: "0.00",
      quantidade_servicos: 0,
      servicos_em_andamento: 0,
    }).quantidade,
    0,
  );
  assert.deepEqual(contarStatus([]), { EM_ANDAMENTO: 0, CONCLUIDO: 0, CANCELADO: 0 });
  for (const value of [
    null,
    {},
    { ...resumo, quantidade_servicos: -1 },
    { ...resumo, servicos_em_andamento: 4 },
    { ...resumo, receita_total: 150.1 },
  ])
    assert.throws(() => dashboardFromApi(value));
  assert.throws(() => financeiroFromApi({ ...row, status: "OUTRO" }));
});
test("consulta somente os dois endpoints em lote com cookies", async () => {
  const calls: string[] = [];
  const api = createDashboardClient(
    { getCsrfToken: () => "", expireSession: () => assert.fail() },
    async (url, init) => {
      calls.push(String(url));
      assert.equal(init?.credentials, "include");
      assert.equal(init?.cache, "no-store");
      assert.equal(init?.body, undefined);
      return Response.json(String(url).endsWith("resumo") ? resumo : [row]);
    },
  );
  await Promise.all([api.resumo(), api.servicos()]);
  assert.deepEqual(calls, ["/api/dashboard/resumo", "/api/financeiro/servicos"]);
});
test("401 expira sessão, erros não expõem SQL, duplicatas e falhas não viram zeros", async () => {
  for (const status of [401, 403, 500]) {
    let expired = 0;
    const api = createDashboardClient(
      {
        getCsrfToken: () => "",
        expireSession: () => {
          expired++;
        },
      },
      async () => Response.json({ message: "SQL password" }, { status }),
    );
    await assert.rejects(api.resumo(), (e: Error) => !/SQL|password/.test(e.message));
    assert.equal(expired, status === 401 ? 1 : 0);
  }
  const auth = { getCsrfToken: () => "", expireSession: () => {} };
  const duplicate = createDashboardClient(auth, async () => Response.json([row, row]));
  await assert.rejects(duplicate.servicos(), /duplicados/);
  const offline = createDashboardClient(auth, async () => {
    throw new Error();
  });
  await assert.rejects(offline.resumo(), /conectar/);
  const malformed = createDashboardClient(auth, async () => new Response("<html>"));
  await assert.rejects(malformed.resumo(), /inválida/);
});
