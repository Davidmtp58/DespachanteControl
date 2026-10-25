import { test, expect } from "@playwright/test";
import { mockAuth } from "./auth-mock";
import { mockDashboard } from "./dashboard-mock";

test("indicadores e tabela usam cálculos SQL, incluindo cancelados e custo zero", async ({
  page,
}) => {
  await mockAuth(page, true);
  const state = await mockDashboard(page);
  await page.goto("/");
  await expect(page.getByRole("article", { name: "Receita total", exact: true })).toContainText(
    "R$ 3.390,00",
  );
  await expect(page.getByRole("article", { name: "Custos totais", exact: true })).toContainText(
    "R$ 1.600,00",
  );
  await expect(page.getByRole("article", { name: "Resultado líquido", exact: true })).toContainText(
    "R$ 1.790,00",
  );
  await expect(
    page.getByRole("article", { name: "Total de serviços", exact: true }).locator("strong"),
  ).toHaveText("3");
  await expect(
    page.getByRole("article", { name: "Em andamento", exact: true }).locator("strong"),
  ).toHaveText("1");
  for (const status of ["Em andamento: 1", "Concluídos: 1", "Cancelados: 1"])
    await expect(page.getByLabel("Serviços por status")).toContainText(status);
  await expect(page.locator("tbody tr").filter({ hasText: "Cliente cancelado" })).toContainText(
    "-R$ 50,00",
  );
  await expect(
    page.locator("tbody tr").filter({ hasText: "Cliente financeiro API" }),
  ).toContainText("R$ 0,00");
  await expect(page.getByText(/não um fluxo de caixa por data de pagamento/)).toBeVisible();
  await expect(
    page.getByLabel("Indicadores financeiros e operacionais").getByRole("button"),
  ).toHaveCount(0);
  await expect(page.locator("tbody button")).toHaveCount(0);
  expect(new Set(state.reads)).toEqual(
    new Set(["/api/dashboard/resumo", "/api/financeiro/servicos"]),
  );
  await page.screenshot({ path: "test-results/dashboard-real.png", fullPage: true });
});
test("atualiza valores e mantém exatos centavos maiores que Number seguro", async ({ page }) => {
  await mockAuth(page, true);
  const state = await mockDashboard(page);
  await page.goto("/");
  await expect(page.getByLabel("Indicadores financeiros e operacionais")).toBeVisible();
  state.resumo = {
    receita_total: "9007199254740993.01",
    custos_totais: "0.00",
    resultado_liquido: "9007199254740993.01",
    quantidade_servicos: 1,
    servicos_em_andamento: 1,
  };
  state.rows = [
    {
      ...state.rows[0],
      valor_recebido: state.resumo.receita_total,
      resultado_liquido: state.resumo.resultado_liquido,
    },
  ];
  await page.getByRole("button", { name: "Atualizar Dashboard" }).click();
  await expect(page.getByRole("article", { name: "Receita total", exact: true })).toContainText(
    "9.007.199.254.740.993,01",
  );
  await expect(page.locator("tbody")).toContainText("9.007.199.254.740.993,01");
});
test("dados vazios mostram zeros reais e mensagem de ausência", async ({ page }) => {
  await mockAuth(page, true);
  const state = await mockDashboard(page);
  state.rows = [];
  state.resumo = {
    receita_total: "0.00",
    custos_totais: "0.00",
    resultado_liquido: "0.00",
    quantidade_servicos: 0,
    servicos_em_andamento: 0,
  };
  await page.goto("/");
  await expect(page.getByText("Nenhum serviço cadastrado.")).toBeVisible();
  await expect(page.getByRole("article", { name: "Receita total", exact: true })).toContainText(
    "R$ 0,00",
  );
  await expect(page.locator("tbody tr")).toHaveCount(0);
});
for (const source of ["resumo", "servicos", "rede"] as const) {
  test(`falha em ${source} não mantém indicadores antigos nem usa demonstração`, async ({
    page,
  }) => {
    await mockAuth(page, true);
    const state = await mockDashboard(page);
    await page.goto("/");
    await expect(page.getByLabel("Indicadores financeiros e operacionais")).toBeVisible();
    if (source === "resumo") state.resumoStatus = 500;
    else if (source === "servicos") state.rowsStatus = 500;
    else state.offline = true;
    await page.getByRole("button", { name: "Atualizar Dashboard" }).click();
    await expect(page.getByRole("alert")).toBeVisible();
    await expect(page.getByRole("alert")).not.toContainText("SQL internal");
    await expect(page.getByLabel("Indicadores financeiros e operacionais")).toHaveCount(0);
    await expect(page.locator("tbody tr")).toHaveCount(0);
    state.resumoStatus = 200;
    state.rowsStatus = 200;
    state.offline = false;
    await page.getByRole("button", { name: "Atualizar Dashboard" }).click();
    await expect(page.getByLabel("Indicadores financeiros e operacionais")).toBeVisible();
  });
}
test("401 financeiro solicita novo login", async ({ page }) => {
  await mockAuth(page, true);
  const state = await mockDashboard(page);
  state.resumoStatus = 401;
  await page.goto("/");
  await expect(page.getByRole("alert")).toContainText("Sua sessão expirou");
  await expect(page.locator(".app-shell")).toHaveCount(0);
});
test("carregamento não exibe zeros e layout móvel permanece utilizável", async ({ page }) => {
  await mockAuth(page, true);
  let release!: () => void;
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/api/dashboard/resumo", async (route) => {
    await pending;
    await route.fallback();
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await expect(page.getByText("Carregando indicadores financeiros…")).toBeVisible();
  await expect(page.getByRole("article")).toHaveCount(0);
  release();
  await expect(page.getByLabel("Indicadores financeiros e operacionais")).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await page.screenshot({ path: "test-results/dashboard-real-mobile.png", fullPage: true });
});
