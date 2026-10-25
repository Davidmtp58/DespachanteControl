import { test } from "node:test";
import assert from "node:assert/strict";
import { createAuthClient, AuthError } from "../src/services/auth";
const session = {
  usuario: {
    id_usuario: 1,
    nome: "Teste",
    email: "teste@example.test",
    ativo: true,
    data_cadastro: "2026-01-01",
  },
  csrfToken: "a".repeat(64),
};
test("contrato de login, me e logout usa cookies e CSRF", async () => {
  const calls: { url: unknown; init?: RequestInit }[] = [];
  const client = createAuthClient(async (url, init) => {
    calls.push({ url, init });
    return String(url).endsWith("logout")
      ? new Response(null, { status: 204 })
      : Response.json(session);
  });
  assert.deepEqual(await client.login("teste@example.test", "mock-only"), session);
  assert.deepEqual(await client.me(), session);
  await client.logout(session.csrfToken);
  assert.deepEqual(
    calls.map((c) => c.url),
    ["/api/auth/login", "/api/auth/me", "/api/auth/logout"],
  );
  for (const call of calls) assert.equal(call.init?.credentials, "include");
  assert.equal(new Headers(calls[0].init?.headers).get("X-Requested-With"), "DespachanteControl");
  assert.deepEqual(JSON.parse(calls[0].init?.body as string), {
    email: "teste@example.test",
    senha: "mock-only",
  });
  assert.equal(new Headers(calls[2].init?.headers).get("X-CSRF-Token"), session.csrfToken);
});
test("erros HTTP não expõem detalhes internos", async () => {
  for (const status of [400, 401, 403, 429, 500]) {
    const client = createAuthClient(async () =>
      Response.json({ secret: "internal-details" }, { status }),
    );
    await assert.rejects(
      client.login("x", "y"),
      (e: unknown) =>
        e instanceof AuthError && e.status === status && !e.message.includes("internal-details"),
    );
  }
});
test("falhas de rede e respostas inválidas não viram sessão", async () => {
  const offline = createAuthClient(async () => {
    throw new Error("internal-details");
  });
  await assert.rejects(
    offline.me(),
    (e: unknown) =>
      e instanceof AuthError && e.status === 0 && !e.message.includes("internal-details"),
  );
  const invalid = createAuthClient(async () => Response.json({ usuario: session.usuario }));
  await assert.rejects(invalid.me(), (e: unknown) => e instanceof AuthError && e.status === 502);
});
