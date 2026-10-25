import { expect, type Page } from "@playwright/test";
export async function mockVeiculos(page: Page) {
  const state = {
    rows: [
      {
        id_veiculo: 5,
        id_cliente_proprietario: 9,
        placa: "API1A23",
        tipo_veiculo: "Automóvel",
        marca: "Volkswagen",
        modelo: "Gol",
        ano: 2020 as number | null,
        renavam: "00123456789",
        data_cadastro: "2026-10-01",
      },
    ],
    status: 200,
    detailStatus: 200,
    writeStatus: 200,
    code: "VALIDATION_ERROR",
    offline: false,
    failListAfterWrite: false,
    writes: [] as { method: string; body: Record<string, unknown> }[],
  };
  await page.route("**/api/veiculos**", async (route) => {
    if (state.offline) return route.abort("failed");
    const req = route.request();
    const path = new URL(req.url()).pathname;
    if (req.method() === "GET") {
      if (path === "/api/veiculos")
        return route.fulfill({ status: state.status, json: state.rows });
      const row = state.rows.find((r) => String(r.id_veiculo) === path.split("/").pop());
      return route.fulfill({
        status: state.detailStatus === 200 ? (row ? 200 : 404) : state.detailStatus,
        json: row ?? {},
      });
    }
    expect(["POST", "PUT"]).toContain(req.method());
    expect(req.headers()["x-csrf-token"]).toBe("a".repeat(64));
    const body = req.postDataJSON();
    expect(Object.keys(body).sort()).toEqual(
      [
        "id_cliente_proprietario",
        "placa",
        "tipo_veiculo",
        "marca",
        "modelo",
        "ano",
        "renavam",
      ].sort(),
    );
    state.writes.push({ method: req.method(), body });
    if (state.writeStatus !== 200)
      return route.fulfill({
        status: state.writeStatus,
        json: { error: { code: state.code, message: "internal SQL details" } },
      });
    const id = req.method() === "POST" ? 6 : Number(path.split("/").pop());
    const row = { ...body, id_veiculo: id, data_cadastro: "2026-10-01" };
    state.rows = [...state.rows.filter((r) => r.id_veiculo !== id), row];
    if (state.failListAfterWrite) state.status = 500;
    return route.fulfill({ status: req.method() === "POST" ? 201 : 200, json: row });
  });
  return state;
}
