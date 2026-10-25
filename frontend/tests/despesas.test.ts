import { test } from "node:test";
import assert from "node:assert/strict";
import { createDespesasClient, despesaFromApi, despesaPayload } from "../src/services/despesas";
import { moneyFromInput, moneyInput } from "../src/services/servicos";

const row = {
  id_despesa: 12,
  id_servico: 7,
  descricao: "Taxa de teste",
  valor: "350.50",
  data_despesa: "2026-10-19",
  observacoes: null,
};
const item = despesaFromApi(row);
test("despesa mapeia campos SQL, data DATE e decimal sem arredondamento", () => {
  assert.deepEqual(item, {
    id: "12",
    servicoId: "7",
    descricao: "Taxa de teste",
    valor: "350.50",
    data: "2026-10-19",
    observacoes: "",
  });
  assert.deepEqual(despesaPayload(item), {
    id_servico: 7,
    descricao: "Taxa de teste",
    valor: "350.50",
    data_despesa: "2026-10-19",
    observacoes: null,
  });
  assert.equal(moneyInput(despesaFromApi({ ...row, valor: "350.5" }).valor), "350,50");
  for (const value of ["0,01", "350,50", "99999999,99"]) {
    assert.equal(
      despesaPayload({ ...item, valor: moneyFromInput(value) }).valor,
      value.replace(",", "."),
    );
  }
});
test("valida obrigatórios, precisão, limites, datas e relacionamento antes de enviar", () => {
  for (const patch of [
    { servicoId: "" },
    { servicoId: "s1" },
    { servicoId: "2147483648" },
    { descricao: "  " },
    { descricao: "x".repeat(151) },
    { descricao: "taxa\ninterna" },
    { valor: "0.00" },
    { valor: "-1" },
    { valor: "1.001" },
    { valor: "100000000.00" },
    { valor: "NaN" },
    { data: "2026-02-29" },
    { data: "2026-10-19T00:00:00" },
    { data: "0000-01-01" },
    { observacoes: "x".repeat(301) },
    { observacoes: "\t" },
  ])
    assert.throws(() => despesaPayload({ ...item, ...patch }));
  assert.equal(despesaPayload({ ...item, data: "2024-02-29" }).data_despesa, "2024-02-29");
});
test("todas as rotas usam cookies e alterações enviam CSRF, inclusive DELETE sem corpo", async () => {
  const calls: { url: string; init: RequestInit }[] = [];
  const api = createDespesasClient(
    { getCsrfToken: () => "csrf-mock", expireSession: () => assert.fail() },
    async (url, init) => {
      calls.push({ url: String(url), init: init! });
      if (init?.method === "DELETE") return new Response(null, { status: 204 });
      return Response.json(init?.method === "GET" && !String(url).endsWith("/12") ? [row] : row);
    },
  );
  assert.deepEqual(await api.list(), [item]);
  assert.deepEqual(await api.byService("7"), [item]);
  assert.deepEqual(await api.find("12"), item);
  await api.create(item);
  await api.update("12", item);
  await api.remove("12");
  assert.deepEqual(
    calls.map((c) => [c.url, c.init.method]),
    [
      ["/api/despesas", "GET"],
      ["/api/servicos/7/despesas", "GET"],
      ["/api/despesas/12", "GET"],
      ["/api/despesas", "POST"],
      ["/api/despesas/12", "PUT"],
      ["/api/despesas/12", "DELETE"],
    ],
  );
  calls.forEach((c) => assert.equal(c.init.credentials, "include"));
  calls
    .slice(3)
    .forEach((c) => assert.equal(new Headers(c.init.headers).get("X-CSRF-Token"), "csrf-mock"));
  assert.equal(calls[5].init.body, undefined);
  assert.equal(JSON.parse(calls[3].init.body as string).valor, "350.50");
});
test("falhas HTTP são seguras e 401 expira a sessão em qualquer operação", async () => {
  for (const status of [400, 401, 403, 404, 409, 500]) {
    let expired = 0;
    const api = createDespesasClient(
      {
        getCsrfToken: () => "csrf",
        expireSession: () => {
          expired++;
        },
      },
      async () =>
        Response.json(
          { error: { code: "INVALID_REFERENCE", message: "SQL password hash" } },
          { status },
        ),
    );
    for (const operation of [
      () => api.list(),
      () => api.byService("7"),
      () => api.find("12"),
      () => api.create(item),
      () => api.update("12", item),
      () => api.remove("12"),
    ])
      await assert.rejects(operation(), (e: Error) => !/SQL|password|hash/.test(e.message));
    assert.equal(expired, status === 401 ? 6 : 0);
  }
});
test("serviço inexistente, lista vazia e respostas inválidas não usam fallback", async () => {
  const auth = { getCsrfToken: () => "csrf", expireSession: () => {} };
  const empty = createDespesasClient(auth, async () => Response.json([]));
  assert.deepEqual(await empty.byService("7"), []);
  const missing = createDespesasClient(auth, async () =>
    Response.json({ error: { code: "SERVICE_NOT_FOUND" } }, { status: 404 }),
  );
  await assert.rejects(missing.byService("7"), /Serviço não encontrado/);
  for (const response of [
    { rows: [row] },
    [{ ...row, valor: "0.00" }],
    [{ ...row, id_servico: "7" }],
  ]) {
    const api = createDespesasClient(auth, async () => Response.json(response));
    await assert.rejects(api.list(), /inválida/);
  }
  const offline = createDespesasClient(auth, async () => {
    throw new Error("network");
  });
  await assert.rejects(offline.list(), /conectar à API/);
  await assert.rejects(offline.remove("12"), /Confira a listagem/);
  const malformed = createDespesasClient(auth, async () => new Response("<html>"));
  await assert.rejects(malformed.find("12"), /Resposta inválida/);
});
