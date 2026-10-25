import { test } from "node:test";
import assert from "node:assert/strict";
import {
  createServicosClient,
  servicoFromApi,
  servicoPayload,
  servicoDate,
  servicoMoney,
  moneyInput,
  moneyDigitsInput,
  moneyFromInput,
  formatServicoDate,
  formatServicoMoney,
} from "../src/services/servicos";
const row = {
  id_servico: 7,
  id_cliente: 10,
  id_veiculo: 5,
  id_tipo_servico: 2,
  data_inicio: "2026-10-16T23:59:59.1234567",
  data_conclusao: null,
  status: "EM_ANDAMENTO",
  valor_recebido: "150.10",
  observacoes: null,
};
const item = servicoFromApi(row);
test("adapta DATETIME2 para data civil e envia meia-noite sem fuso", () => {
  assert.equal(item.inicio, "2026-10-16");
  assert.equal(item.valorRecebido, "150.10");
  assert.deepEqual(servicoPayload(item), {
    id_cliente: 10,
    id_veiculo: 5,
    id_tipo_servico: 2,
    data_inicio: "2026-10-16T00:00:00",
    data_conclusao: null,
    status: "EM_ANDAMENTO",
    valor_recebido: "150.10",
    observacoes: null,
  });
  assert.equal(formatServicoDate(item.inicio), "16/10/2026");
  assert.equal(formatServicoMoney("99999999.99"), "R$ 99.999.999,99");
  assert.equal(servicoMoney("0"), "0.00");
});
test("valida calendário, horário, ordem, status, valores e referências", () => {
  for (const date of [
    "2026-02-29T12:00:00",
    "2026-10-16T24:00:00",
    "2026-10-16T12:00:00Z",
    "2026-02-29",
    "2026-10-16T12:00:00.12345678",
  ])
    assert.throws(() => servicoDate(date));
  assert.equal(servicoDate("2024-02-29"), "2024-02-29");
  for (const valor of ["-1", "1.001", "100000000.00", "1e2", "NaN"])
    assert.throws(() => servicoMoney(valor));
  assert.throws(() => servicoPayload({ ...item, conclusao: "2026-10-15" }));
  assert.throws(() => servicoPayload({ ...item, clienteId: "c1" }));
  assert.throws(() => servicoFromApi({ ...row, status: "OUTRO" }));
  for (const status of ["EM_ANDAMENTO", "CONCLUIDO", "CANCELADO"] as const)
    assert.equal(servicoPayload({ ...item, status, conclusao: "2026-10-16" }).status, status);
});
test("endpoints, cookies, CSRF e tipos seguem contrato real", async () => {
  const calls: { url: string; init: RequestInit }[] = [];
  const api = createServicosClient(
    { getCsrfToken: () => "csrf", expireSession: () => assert.fail() },
    async (url, init) => {
      calls.push({ url: String(url), init: init! });
      return Response.json(
        String(url).endsWith("tipos-servico")
          ? [{ id_tipo_servico: 2, nome: "Transferência", ativo: false, descricao: null }]
          : String(url).endsWith("servicos") && init?.method === "GET"
            ? [row]
            : row,
      );
    },
  );
  assert.deepEqual(await api.list(), [item]);
  await api.find("7");
  await api.create(item);
  await api.update("7", item);
  assert.equal((await api.types())[0].ativo, false);
  assert.deepEqual(
    calls.map((c) => c.url),
    ["/api/servicos", "/api/servicos/7", "/api/servicos", "/api/servicos/7", "/api/tipos-servico"],
  );
  calls.forEach((c) => assert.equal(c.init.credentials, "include"));
  assert.equal(new Headers(calls[2].init.headers).get("X-CSRF-Token"), "csrf");
  assert.equal(JSON.parse(calls[3].init.body as string).valor_recebido, "150.10");
});
test("trata 401, relacionamentos, erros e rede sem mocks ou detalhes internos", async () => {
  for (const status of [400, 401, 403, 404, 409, 500]) {
    let expired = false;
    const api = createServicosClient(
      {
        getCsrfToken: () => "csrf",
        expireSession: () => {
          expired = true;
        },
      },
      async () =>
        Response.json(
          { error: { code: "INVALID_REFERENCE", message: "internal SQL" } },
          { status },
        ),
    );
    await assert.rejects(api.create(item), (e: Error) => !e.message.includes("internal SQL"));
    assert.equal(expired, status === 401);
  }
  const api = createServicosClient(
    { getCsrfToken: () => "csrf", expireSession: () => {} },
    async () => {
      throw new Error();
    },
  );
  await assert.rejects(api.list(), /conectar à API/);
  await assert.rejects(api.create(item), /Confira a listagem/);
});

test("conclusão obrigatória na escrita e legado permanece legível", () => {
  assert.throws(() => servicoPayload({ ...item, status: "CONCLUIDO" }), /data de conclusão/);
  assert.equal(servicoFromApi({ ...row, status: "CONCLUIDO" }).conclusao, "");
  assert.equal(servicoPayload({ ...item, status: "EM_ANDAMENTO" }).data_conclusao, null);
});
test("moeda pt-BR sem aritmética de ponto flutuante", () => {
  for (const value of ["350.5", "350.50"]) assert.equal(moneyInput(value), "350,50");
  assert.equal(moneyInput("0"), "0,00");
  assert.equal(moneyInput("420.00"), "420,00");
  assert.equal(moneyFromInput("350,50"), "350.50");
  assert.equal(moneyFromInput(""), "0.00");
  assert.equal(moneyFromInput("99999999,99"), "99999999.99");
  for (const value of ["ffff", "-1", "-0,01", "1,001", "1e2"])
    assert.throws(() => moneyFromInput(value));
});

test("máscara mantém duas casas até durante edição e limpeza", () => {
  assert.equal(moneyDigitsInput(""), "0,00");
  assert.equal(moneyDigitsInput("35050"), "350,50");
  assert.equal(moneyDigitsInput("350,50"), "350,50");
  assert.equal(moneyDigitsInput("0,001"), "0,01");
  assert.equal(moneyDigitsInput("-1"), null);
  assert.equal(moneyDigitsInput("ffff"), null);
  assert.equal(moneyDigitsInput("10000000000"), null);
});
