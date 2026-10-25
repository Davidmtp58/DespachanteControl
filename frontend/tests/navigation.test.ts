import { test } from "node:test";
import assert from "node:assert/strict";
import { paginaFromPath, loginDestination } from "../src/navigation";

test("rotas reconhecem somente as cinco seções, inclusive barra final", () => {
  for (const pagina of ["dashboard", "clientes", "veiculos", "servicos", "despesas"]) {
    assert.equal(paginaFromPath(`/${pagina}`), pagina);
    assert.equal(paginaFromPath(`/${pagina}/`), pagina);
  }
  for (const path of ["/", "/login", "/desconhecido", "/clientes/9"]) {
    assert.equal(paginaFromPath(path), undefined);
  }
});
test("retorno após login aceita apenas seções internas conhecidas", () => {
  assert.equal(loginDestination("next=/despesas"), "/despesas");
  for (const next of ["https://example.com", "//example.com", "/desconhecido", ""]) {
    assert.equal(loginDestination(`next=${encodeURIComponent(next)}`), "/dashboard");
  }
});
