import { expect, type Page } from "@playwright/test";
export async function mockClientes(page: Page) {
  const state = {
    rows: [
      {
        id_cliente: 9,
        tipo_pessoa: "PF",
        nome_razao_social: "Cliente API",
        cpf_cnpj: "52998224725",
        telefone: "85999990000",
        email: null as string | null,
        data_nascimento: "1990-01-02" as string | null,
        data_cadastro: "2026-10-01",
      },
    ],
    listStatus: 200,
    writeStatus: 200,
    offline: false,
    failListAfterWrite: false,
    writes: [] as { method: string; body: Record<string, unknown> }[],
  };
  await page.route("**/api/clientes**", async (route) => {
    if (state.offline) return route.abort("failed");
    const req = route.request();
    const path = new URL(req.url()).pathname;
    if (req.method() === "GET") {
      if (path === "/api/clientes")
        return route.fulfill({ status: state.listStatus, json: state.rows });
      const row = state.rows.find((r) => String(r.id_cliente) === path.split("/").pop());
      return route.fulfill({ status: row ? 200 : 404, json: row ?? {} });
    }
    expect(["POST", "PUT"]).toContain(req.method());
    expect(req.headers()["x-csrf-token"]).toBe("a".repeat(64));
    const body = req.postDataJSON();
    expect(Object.keys(body).sort()).toEqual(
      [
        "tipo_pessoa",
        "nome_razao_social",
        "cpf_cnpj",
        "telefone",
        "email",
        "data_nascimento",
      ].sort(),
    );
    state.writes.push({ method: req.method(), body });
    if (state.writeStatus !== 200)
      return route.fulfill({
        status: state.writeStatus,
        json: { error: { message: "internal-details" } },
      });
    const id = req.method() === "POST" ? 10 : Number(path.split("/").pop());
    const row = { ...body, id_cliente: id, data_cadastro: "2026-10-01" };
    state.rows = [...state.rows.filter((r) => r.id_cliente !== id), row];
    if (state.failListAfterWrite) state.listStatus = 500;
    return route.fulfill({ status: req.method() === "POST" ? 201 : 200, json: row });
  });
  return state;
}
