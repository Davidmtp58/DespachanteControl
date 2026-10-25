import { test } from "node:test";
import assert from "node:assert/strict";
import {
  clienteFromApi,
  clientePayload,
  createClientesClient,
  ClientesError,
} from "../src/services/clientes";
const row = {
  id_cliente: 9,
  tipo_pessoa: "PF",
  nome_razao_social: "Cliente API",
  cpf_cnpj: "52998224725",
  telefone: "85999990000",
  email: null,
  data_nascimento: "1990-01-02",
  data_cadastro: "2026-10-01",
};
test("listagem preserva todos os clientes retornados além dos cinco iniciais", async () => {
  const rows = Array.from({ length: 12 }, (_, index) => ({
    ...row,
    id_cliente: index + 1,
    nome_razao_social: `Cliente ${index + 1}`,
  }));
  const client = createClientesClient(
    { getCsrfToken: () => "", expireSession: () => assert.fail() },
    async (url) => {
      assert.equal(url, "/api/clientes");
      return Response.json(rows);
    },
  );
  const result = await client.list();
  assert.equal(result.length, 12);
  assert.deepEqual(
    result.map((c) => c.id),
    rows.map((c) => String(c.id_cliente)),
  );
  assert.equal(result[11].nome, "Cliente 12");
});
test("mapeia snake_case, opcionais nulos e data sem conversão de fuso", () => {
  const cliente = clienteFromApi(row);
  assert.equal(cliente.id, "9");
  assert.equal(cliente.nascimento, "1990-01-02");
  assert.equal(cliente.email, "");
  assert.deepEqual(
    clientePayload({
      ...cliente,
      nascimento: "",
      tipoPessoa: "PJ",
      documento: "12.abc.345/01de-35",
    }),
    {
      tipo_pessoa: "PJ",
      nome_razao_social: "Cliente API",
      cpf_cnpj: "12ABC34501DE35",
      telefone: row.telefone,
      email: null,
      data_nascimento: null,
    },
  );
});
test("listagem, consulta, POST e PUT usam contrato, cookies e CSRF atual", async () => {
  const calls: { url: string; init: RequestInit }[] = [];
  let token = "a".repeat(64);
  const client = createClientesClient(
    { getCsrfToken: () => token, expireSession: () => assert.fail("unexpected 401") },
    async (url, init) => {
      calls.push({ url: String(url), init: init! });
      return Response.json(String(url) === "/api/clientes" && init?.method === "GET" ? [row] : row);
    },
  );
  const [item] = await client.list();
  await client.find(item.id);
  await client.create(item);
  token = "b".repeat(64);
  await client.update(item.id, item);
  assert.deepEqual(
    calls.map((c) => [c.url, c.init.method]),
    [
      ["/api/clientes", "GET"],
      ["/api/clientes/9", "GET"],
      ["/api/clientes", "POST"],
      ["/api/clientes/9", "PUT"],
    ],
  );
  for (const c of calls) assert.equal(c.init.credentials, "include");
  assert.equal(new Headers(calls[2].init.headers).get("X-CSRF-Token"), "a".repeat(64));
  assert.equal(new Headers(calls[3].init.headers).get("X-CSRF-Token"), token);
  assert.deepEqual(JSON.parse(calls[2].init.body as string), clientePayload(item));
  assert.ok(!("id_cliente" in JSON.parse(calls[2].init.body as string)));
});
test("HTTP 400, 409, 401 e falhas não retornam mocks nem expõem erros internos", async () => {
  for (const status of [400, 401, 403, 404, 409, 500]) {
    let expired = false;
    const client = createClientesClient(
      {
        getCsrfToken: () => "token",
        expireSession: () => {
          expired = true;
        },
      },
      async () => Response.json({ error: { message: "internal SQL password" } }, { status }),
    );
    await assert.rejects(
      client.create(clienteFromApi(row)),
      (e: unknown) =>
        e instanceof ClientesError && e.status === status && !e.message.includes("internal SQL"),
    );
    assert.equal(expired, status === 401);
  }
});
test("rede indisponível e payload inesperado falham explicitamente", async () => {
  const auth = { getCsrfToken: () => "token", expireSession: () => {} };
  const offline = createClientesClient(auth, async () => {
    throw new Error("offline");
  });
  await assert.rejects(offline.list(), /conectar à API/);
  await assert.rejects(offline.create(clienteFromApi(row)), /Confira a listagem/);
  await assert.rejects(
    createClientesClient(auth, async () => Response.json({})).list(),
    /lista inválida/,
  );
  assert.throws(() => clienteFromApi({}), /dados de cliente inválidos/);
});
