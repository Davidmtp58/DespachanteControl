import { expect, type Page } from "@playwright/test";
export async function mockServicos(page: Page) {
  const state = {
    rows: [
      {
        id_servico: 7,
        id_cliente: 9,
        id_veiculo: 5,
        id_tipo_servico: 2,
        data_inicio: "2026-10-16T23:59:59.1234567",
        data_conclusao: null as string | null,
        status: "EM_ANDAMENTO",
        valor_recebido: "150.10",
        observacoes: "Serviço da API" as string | null,
      },
    ],
    types: [{ id_tipo_servico: 2, nome: "Transferência API", descricao: null, ativo: true }],
    listStatus: 200,
    detailStatus: 200,
    typesStatus: 200,
    writeStatus: 200,
    code: "VALIDATION_ERROR",
    offline: false,
    failListAfterWrite: false,
    writes: [] as { method: string; body: Record<string, unknown> }[],
  };
  await page.route(/\/api\/(servicos(?:\/[^/?]+)?|tipos-servico)(?:\?.*)?$/, async (route) => {
    if (state.offline) return route.abort("failed");
    const req = route.request();
    const path = new URL(req.url()).pathname;
    if (path === "/api/tipos-servico")
      return route.fulfill({ status: state.typesStatus, json: state.types });
    if (req.method() === "GET") {
      if (path === "/api/servicos")
        return route.fulfill({ status: state.listStatus, json: state.rows });
      const row = state.rows.find((r) => String(r.id_servico) === path.split("/").pop());
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
        "id_cliente",
        "id_veiculo",
        "id_tipo_servico",
        "data_inicio",
        "data_conclusao",
        "status",
        "valor_recebido",
        "observacoes",
      ].sort(),
    );
    state.writes.push({ method: req.method(), body });
    if (state.writeStatus !== 200)
      return route.fulfill({
        status: state.writeStatus,
        json: { error: { code: state.code, message: "internal SQL" } },
      });
    const key = req.method() === "POST" ? 8 : Number(path.split("/").pop());
    const row = { ...body, id_servico: key };
    state.rows = [...state.rows.filter((r) => r.id_servico !== key), row];
    if (state.failListAfterWrite) state.listStatus = 500;
    return route.fulfill({ status: req.method() === "POST" ? 201 : 200, json: row });
  });
  return state;
}
