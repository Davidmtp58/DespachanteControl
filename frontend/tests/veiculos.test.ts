import { test } from "node:test";
import assert from "node:assert/strict";
import {
  createVeiculosClient,
  veiculoFromApi,
  veiculoPayload,
  VeiculosError,
} from "../src/services/veiculos";
const row = {
  id_veiculo: 5,
  id_cliente_proprietario: 9,
  placa: "API1A23",
  tipo_veiculo: "Automóvel",
  marca: "Volkswagen",
  modelo: "Gol",
  ano: null,
  renavam: "00123456789",
};
const item = veiculoFromApi(row);
test("mapeia IDs, ano nulo e RENAVAM sem perder zeros; normaliza placa", () => {
  assert.equal(item.id, "5");
  assert.equal(item.proprietarioId, "9");
  assert.equal(item.ano, null);
  assert.deepEqual(veiculoPayload({ ...item, placa: "abc-1234" }), {
    id_cliente_proprietario: 9,
    placa: "ABC1234",
    tipo_veiculo: "Automóvel",
    marca: "Volkswagen",
    modelo: "Gol",
    ano: null,
    renavam: "00123456789",
  });
  assert.equal(veiculoPayload({ ...item, placa: "abc1d23" }).placa, "ABC1D23");
  assert.throws(() => veiculoFromApi({}), VeiculosError);
});
test("valida proprietário, placa, RENAVAM, textos e ano conforme backend", () => {
  for (const patch of [
    { proprietarioId: "c1" },
    { proprietarioId: "0" },
    { proprietarioId: "2147483648" },
    { placa: "ABC!1234" },
    { placa: "1234567" },
    { renavam: "1234567890" },
    { renavam: "1234567890a" },
    { ano: 999 },
    { ano: 10000 },
    { ano: 2020.5 },
    { tipo: " " },
    { marca: "" },
    { modelo: "x".repeat(81) },
  ]) {
    assert.throws(() => veiculoPayload({ ...item, ...patch }), VeiculosError);
  }
  for (const ano of [1000, 2020, 9999, null])
    assert.equal(veiculoPayload({ ...item, ano }).ano, ano);
});
test("GET, detalhe, POST e PUT usam cookies e CSRF atual, sem campos extras", async () => {
  const calls: { url: string; init: RequestInit }[] = [];
  let csrf = "a".repeat(64);
  const client = createVeiculosClient(
    { getCsrfToken: () => csrf, expireSession: () => assert.fail("unexpected 401") },
    async (url, init) => {
      calls.push({ url: String(url), init: init! });
      return Response.json(String(url) === "/api/veiculos" && init?.method === "GET" ? [row] : row);
    },
  );
  assert.deepEqual(await client.list(), [item]);
  assert.deepEqual(await client.find("5"), item);
  await client.create(item);
  csrf = "b".repeat(64);
  await client.update("5", item);
  assert.deepEqual(
    calls.map((c) => [c.url, c.init.method]),
    [
      ["/api/veiculos", "GET"],
      ["/api/veiculos/5", "GET"],
      ["/api/veiculos", "POST"],
      ["/api/veiculos/5", "PUT"],
    ],
  );
  for (const c of calls) assert.equal(c.init.credentials, "include");
  assert.equal(new Headers(calls[2].init.headers).get("X-CSRF-Token"), "a".repeat(64));
  assert.equal(new Headers(calls[3].init.headers).get("X-CSRF-Token"), csrf);
  assert.deepEqual(JSON.parse(calls[2].init.body as string), veiculoPayload(item));
  await assert.rejects(client.find("v1"), /ID de veículo inválido/);
  assert.equal(calls.length, 4);
});
test("trata erros de proprietário, duplicidade, 401 e falhas sem fallback", async () => {
  for (const status of [400, 401, 403, 404, 409, 500]) {
    let expired = false;
    const client = createVeiculosClient(
      {
        getCsrfToken: () => "token",
        expireSession: () => {
          expired = true;
        },
      },
      async () =>
        Response.json({ error: { code: "OWNER_NOT_FOUND", message: "internal SQL" } }, { status }),
    );
    await assert.rejects(
      client.update("5", item),
      (e: unknown) =>
        e instanceof VeiculosError &&
        e.status === status &&
        !e.message.includes("internal SQL") &&
        (status !== 400 || e.message.includes("proprietário não encontrado")),
    );
    assert.equal(expired, status === 401);
  }
  const auth = { getCsrfToken: () => "token", expireSession: () => {} };
  const offline = createVeiculosClient(auth, async () => {
    throw new Error("network");
  });
  await assert.rejects(offline.list(), /conectar à API/);
  await assert.rejects(offline.create(item), /Confira a listagem/);
  await assert.rejects(
    createVeiculosClient(auth, async () => Response.json({})).list(),
    /lista inválida/,
  );
});

test("409 diferencia campos por código seguro e preserva fallback genérico", async () => {
  for (const [code, keys] of [
    ["DUPLICATE_PLATE", ["placa"]],
    ["DUPLICATE_RENAVAM", ["renavam"]],
    ["DUPLICATE_PLATE_AND_RENAVAM", ["placa", "renavam"]],
    ["DUPLICATE_VEHICLE", []],
    ["UNKNOWN", []],
  ] as const) {
    const client = createVeiculosClient(
      { getCsrfToken: () => "csrf", expireSession: () => {} },
      async () => Response.json({ error: { code, message: "segredo SQL" } }, { status: 409 }),
    );
    for (const operation of [() => client.create(item), () => client.update("5", item)]) {
      await assert.rejects(operation, (error: unknown) => {
        assert.ok(error instanceof VeiculosError);
        assert.equal(error.status, 409);
        assert.deepEqual(Object.keys(error.fields), keys);
        assert.ok(!error.message.includes("segredo"));
        return true;
      });
    }
  }
});
