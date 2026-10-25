import { expect, type Page } from "@playwright/test";

export async function mockDespesas(page: Page) {
  const state = {
    rows: [
      {
        id_despesa: 12,
        id_servico: 7,
        descricao: "Taxa API",
        valor: "350.50",
        data_despesa: "2026-10-19",
        observacoes: null as string | null,
      },
    ],
    listStatus: 200,
    detailStatus: 200,
    serviceStatus: 200,
    writeStatus: 200,
    code: "VALIDATION_ERROR",
    offline: false,
    failListAfterWrite: false,
    reads: [] as string[],
    writes: [] as { method: string; path: string; body?: Record<string, unknown> }[],
  };
  await page.route(
    /\/api\/(despesas(?:\/[^/?]+)?|servicos\/[^/?]+\/despesas)(?:\?.*)?$/,
    async (route) => {
      if (state.offline) return route.abort("failed");
      const req = route.request(),
        path = new URL(req.url()).pathname;
      const error = (status: number, code = state.code) =>
        route.fulfill({ status, json: { error: { code, message: "internal SQL credentials" } } });
      if (req.method() === "GET") {
        state.reads.push(path);
        if (path.startsWith("/api/servicos/")) {
          if (state.serviceStatus !== 200) return error(state.serviceStatus, "SERVICE_NOT_FOUND");
          return route.fulfill({
            json: state.rows.filter((r) => r.id_servico === Number(path.split("/")[3])),
          });
        }
        if (path === "/api/despesas") {
          if (state.listStatus !== 200) return error(state.listStatus);
          return route.fulfill({ json: state.rows });
        }
        const row = state.rows.find((r) => r.id_despesa === Number(path.split("/").pop()));
        if (state.detailStatus !== 200 || !row)
          return error(state.detailStatus !== 200 ? state.detailStatus : 404);
        return route.fulfill({ json: row });
      }
      expect(["POST", "PUT", "DELETE"]).toContain(req.method());
      expect(req.headers()["x-csrf-token"]).toBe("a".repeat(64));
      const body = req.method() === "DELETE" ? undefined : req.postDataJSON();
      if (body)
        expect(Object.keys(body).sort()).toEqual(
          ["id_servico", "descricao", "valor", "data_despesa", "observacoes"].sort(),
        );
      state.writes.push({ method: req.method(), path, body });
      if (state.writeStatus !== 200) return error(state.writeStatus);
      if (state.failListAfterWrite) state.listStatus = 500;
      if (req.method() === "DELETE") {
        state.rows = state.rows.filter((r) => r.id_despesa !== Number(path.split("/").pop()));
        return route.fulfill({ status: 204 });
      }
      const id = req.method() === "POST" ? 13 : Number(path.split("/").pop());
      const row = { ...body, id_despesa: id };
      state.rows = [...state.rows.filter((r) => r.id_despesa !== id), row];
      return route.fulfill({ status: req.method() === "POST" ? 201 : 200, json: row });
    },
  );
  return state;
}
