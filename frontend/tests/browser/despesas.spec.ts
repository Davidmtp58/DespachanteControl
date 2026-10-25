import { test, expect, type Page } from "@playwright/test";
import { mockAuth } from "./auth-mock";
import { mockServicos } from "./servicos-mock";
import { mockDespesas } from "./despesas-mock";
import { mockClientes } from "./clientes-mock";
import { mockVeiculos } from "./veiculos-mock";

async function mocks(page: Page) {
  await mockAuth(page, true);
  const clientes = await mockClientes(page);
  const veiculos = await mockVeiculos(page);
  const servicos = await mockServicos(page);
  servicos.rows.push({ ...servicos.rows[0], id_servico: 8, status: "CANCELADO" });
  servicos.rows.push({
    ...servicos.rows[0],
    id_servico: 9,
    status: "CONCLUIDO",
    data_conclusao: "2026-10-19T00:00:00",
  });
  const despesas = await mockDespesas(page);
  return { servicos, despesas, clientes, veiculos };
}
async function navigate(page: Page) {
  await page.goto("/");
  await page.getByRole("button", { name: "Despesas", exact: true }).click();
}
async function setup(page: Page) {
  const state = await mocks(page);
  await navigate(page);
  await expect(page.locator("tbody")).toContainText("Taxa API");
  return state;
}
async function fill(page: Page) {
  await page.getByLabel("Serviço *", { exact: true }).selectOption("8");
  await page.getByLabel("Descrição *", { exact: true }).fill("Despesa real simulada");
  await page.getByLabel("Valor (R$) *", { exact: true }).fill("350,50");
  await page.getByLabel("Data da despesa *", { exact: true }).fill("2026-10-19");
}
test("lista, consulta por ID e filtra despesas pelo endpoint do serviço", async ({ page }) => {
  const { despesas } = await setup(page);
  await expect(page.locator("tbody")).toContainText("Serviço #7");
  await expect(page.locator("tbody")).toContainText("R$ 350,50");
  await page.getByRole("button", { name: "Visualizar despesa 12" }).click();
  await expect(page.getByRole("dialog")).toContainText("19/10/2026");
  await expect(page.getByRole("dialog")).toContainText("Nenhuma observação");
  expect(despesas.reads).toContain("/api/despesas/12");
  await page.getByRole("button", { name: "Fechar", exact: true }).last().click();
  await page.getByLabel("Filtrar por serviço").selectOption("7");
  await expect(page.locator("tbody tr")).toHaveCount(1);
  expect(despesas.reads).toContain("/api/servicos/7/despesas");
  await page.getByLabel("Filtrar por serviço").selectOption("8");
  await expect(page.getByText("Nenhuma despesa encontrada.")).toBeVisible();
  expect(despesas.reads).toContain("/api/servicos/8/despesas");
  await page.getByRole("button", { name: "Todos os serviços", exact: true }).click();
  await expect(page.locator("tbody tr")).toHaveCount(1);
});
test("cadastra em cancelado, edita para concluído e não altera Dashboard", async ({ page }) => {
  const { despesas } = await setup(page);
  await page.getByRole("button", { name: "Nova despesa", exact: true }).click();
  await expect(page.getByLabel("Serviço *", { exact: true }).locator("option")).toHaveCount(4);
  await expect(page.getByLabel("Data da despesa *")).toHaveAttribute("type", "date");
  await expect(page.getByLabel("Valor (R$) *")).toHaveValue("0,00");
  await fill(page);
  await page.getByRole("button", { name: "Salvar", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.locator("tbody")).toContainText("Despesa real simulada");
  expect(despesas.writes[0]).toMatchObject({
    method: "POST",
    body: {
      id_servico: 8,
      descricao: "Despesa real simulada",
      valor: "350.50",
      data_despesa: "2026-10-19",
      observacoes: null,
    },
  });
  await page.getByRole("button", { name: "Editar despesa 13", exact: true }).click();
  await expect(page.getByLabel("Valor (R$) *")).toHaveValue("350,50");
  await page.getByLabel("Serviço *", { exact: true }).selectOption("9");
  await page.getByLabel("Valor (R$) *").fill("0,01");
  await page.getByLabel("Observações", { exact: true }).fill("Centavo preservado");
  await page.getByRole("button", { name: "Salvar", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.locator("tbody")).toContainText("R$ 0,01");
  expect(despesas.writes[1]).toMatchObject({
    method: "PUT",
    body: { id_servico: 9, valor: "0.01", observacoes: "Centavo preservado" },
  });
  await page.getByRole("button", { name: "Dashboard", exact: true }).click();
  await expect(page.getByLabel("Indicadores financeiros e operacionais")).toContainText(
    "R$ 3.390,00",
  );
});
test("exclusão exige confirmação; cancelar e Escape não enviam DELETE", async ({ page }) => {
  const { despesas } = await setup(page);
  await page.getByRole("button", { name: "Excluir despesa 12", exact: true }).click();
  await expect(page.getByRole("dialog")).toContainText("Taxa API");
  expect(despesas.writes).toHaveLength(0);
  await page.getByRole("button", { name: "Cancelar", exact: true }).click();
  await page.getByRole("button", { name: "Excluir despesa 12", exact: true }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Escape");
  expect(despesas.writes).toHaveLength(0);
  await expect(page.locator("tbody tr")).toHaveCount(1);
  await page.getByRole("button", { name: "Excluir despesa 12", exact: true }).click();
  await page.getByRole("button", { name: "Confirmar exclusão", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByText("Despesa excluída com sucesso.")).toBeVisible();
  await expect(page.locator("tbody tr")).toHaveCount(0);
  expect(despesas.writes).toEqual([
    { method: "DELETE", path: "/api/despesas/12", body: undefined },
  ]);
});
test("valida obrigatórios e moeda; rejeita zero e mostra erro de serviço inexistente", async ({
  page,
}) => {
  const { despesas } = await setup(page);
  await page.getByRole("button", { name: "Nova despesa", exact: true }).click();
  await page.getByRole("button", { name: "Salvar", exact: true }).click();
  expect(despesas.writes).toHaveLength(0);
  await fill(page);
  const money = page.getByLabel("Valor (R$) *");
  for (const invalid of ["ffff", "-1", "10000000000"]) {
    await money.fill(invalid);
    await expect(money).toHaveValue("350,50");
  }
  await money.fill("");
  await expect(money).toHaveValue("0,00");
  await page.getByRole("button", { name: "Salvar", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("maior que zero");
  expect(despesas.writes).toHaveLength(0);
  await money.press("End");
  await money.pressSequentially("35050");
  await expect(money).toHaveValue("350,50");
  despesas.writeStatus = 400;
  despesas.code = "INVALID_REFERENCE";
  await page.getByRole("button", { name: "Salvar", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("Serviço não encontrado");
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page.getByLabel("Descrição *")).toHaveValue("Despesa real simulada");
});
test("erros na consulta, validação, conflito e exclusão não expõem SQL", async ({ page }) => {
  const { despesas } = await setup(page);
  despesas.detailStatus = 404;
  await page.getByRole("button", { name: "Visualizar despesa 12" }).click();
  await expect(page.getByRole("alert")).toContainText("Despesa não encontrada");
  despesas.detailStatus = 200;
  await page.getByRole("button", { name: "Editar despesa 12" }).click();
  despesas.writeStatus = 400;
  await page.getByRole("button", { name: "Salvar", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("Dados inválidos");
  despesas.writeStatus = 409;
  await page.getByRole("button", { name: "Salvar", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("Conflito");
  await page.getByRole("button", { name: "Cancelar", exact: true }).click();
  await page.getByRole("button", { name: "Excluir despesa 12" }).click();
  despesas.writeStatus = 500;
  await page.getByRole("button", { name: "Confirmar exclusão", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("Não foi possível concluir");
  await expect(page.getByRole("alert")).not.toContainText("internal SQL");
  await expect(page.getByRole("dialog")).toBeVisible();
  expect(despesas.rows).toHaveLength(1);
});
for (const action of ["list", "save", "delete"] as const) {
  test(`401 em ${action} expira a sessão`, async ({ page }) => {
    const { despesas } = await setup(page);
    if (action === "list") {
      despesas.listStatus = 401;
      await page.getByRole("button", { name: "Atualizar lista", exact: true }).click();
    } else {
      await page
        .getByRole("button", {
          name: action === "save" ? "Editar despesa 12" : "Excluir despesa 12",
          exact: true,
        })
        .click();
      despesas.writeStatus = 401;
      await page
        .getByRole("button", {
          name: action === "save" ? "Salvar" : "Confirmar exclusão",
          exact: true,
        })
        .click();
    }
    await expect(page.getByRole("alert")).toContainText("Sua sessão expirou");
    await expect(page.locator(".app-shell")).toHaveCount(0);
  });
}
test("falha de API ou serviços bloqueia dados, sem fallback, e permite recuperar", async ({
  page,
}) => {
  const { servicos, despesas } = await mocks(page);
  despesas.offline = true;
  await navigate(page);
  await expect(page.getByRole("alert")).toContainText("conectar à API");
  await expect(page.locator("tbody tr")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Nova despesa" })).toHaveCount(0);
  despesas.offline = false;
  servicos.listStatus = 500;
  await page.getByRole("button", { name: "Atualizar lista" }).click();
  await expect(page.getByRole("alert")).toContainText("Serviços");
  await expect(page.locator("tbody tr")).toHaveCount(0);
  servicos.listStatus = 200;
  await page.getByRole("button", { name: "Atualizar lista" }).click();
  await expect(page.locator("tbody")).toContainText("Taxa API");
  despesas.serviceStatus = 404;
  await page.getByLabel("Filtrar por serviço").selectOption("7");
  await expect(page.getByRole("alert")).toContainText("Serviço não encontrado");
  await page.getByRole("button", { name: "Todos os serviços", exact: true }).click();
  await expect(page.locator("tbody")).toContainText("Taxa API");
});
for (const action of ["save", "delete"] as const) {
  test(`recarga com falha após ${action} confirmado não mantém ação para repetir`, async ({
    page,
  }) => {
    const { despesas } = await setup(page);
    await page
      .getByRole("button", {
        name: action === "save" ? "Editar despesa 12" : "Excluir despesa 12",
        exact: true,
      })
      .click();
    despesas.failListAfterWrite = true;
    await page
      .getByRole("button", {
        name: action === "save" ? "Salvar" : "Confirmar exclusão",
        exact: true,
      })
      .click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(
      page.getByText(
        action === "save" ? "Despesa salva com sucesso." : "Despesa excluída com sucesso.",
      ),
    ).toBeVisible();
    await expect(page.getByRole("alert")).toBeVisible();
    expect(despesas.writes).toHaveLength(1);
  });
}
test("serviços vazios bloqueiam cadastro e opções são atualizadas ao abrir formulário", async ({
  page,
}) => {
  const { servicos, despesas } = await mocks(page);
  const rows = servicos.rows;
  servicos.rows = [];
  despesas.rows = [];
  await navigate(page);
  await expect(
    page.getByText("Cadastre um serviço real antes de adicionar despesas."),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Nova despesa" })).toHaveCount(0);
  servicos.rows = rows;
  await page.getByRole("button", { name: "Atualizar lista" }).click();
  await expect(page.getByRole("button", { name: "Nova despesa" })).toBeVisible();
  servicos.rows.push({ ...rows[0], id_servico: 20 });
  await page.getByRole("button", { name: "Nova despesa" }).click();
  await expect(page.getByLabel("Serviço *").locator('option[value="20"]')).toHaveText(
    /Serviço #20/,
  );
});
test("Despesas mantém layout móvel e modal de confirmação", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mocks(page);
  await page.goto("/");
  await page.getByRole("button", { name: "Abrir navegação" }).click();
  await page.getByRole("button", { name: "Despesas", exact: true }).click();
  await expect(page.locator("tbody")).toContainText("Taxa API");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await page.getByRole("button", { name: "Excluir despesa 12" }).click();
  await expect(page.getByRole("button", { name: "Confirmar exclusão", exact: true })).toBeVisible();
  await page.screenshot({ path: "test-results/despesas-confirmacao-mobile.png", fullPage: true });
  await page.getByRole("button", { name: "Cancelar", exact: true }).click();
});

test("identifica atendimentos distintos sem consultas individuais", async ({ page }) => {
  const { clientes, veiculos, servicos, despesas } = await mocks(page);
  clientes.rows.push({
    ...clientes.rows[0],
    id_cliente: 10,
    nome_razao_social: "Solicitante Maria",
  });
  veiculos.rows.push({
    ...veiculos.rows[0],
    id_veiculo: 6,
    marca: "Fiat",
    modelo: "Uno",
    placa: "XYZ9B12",
  });
  servicos.types.push({ ...servicos.types[0], id_tipo_servico: 3, nome: "Licenciamento" });
  servicos.rows[1] = { ...servicos.rows[1], id_cliente: 10, id_veiculo: 6, id_tipo_servico: 3 };
  despesas.rows.push({
    ...despesas.rows[0],
    id_despesa: 14,
    id_servico: 8,
    descricao: "Outra taxa",
  });
  const paths: string[] = [];
  page.on("request", (req) => {
    if (req.url().includes("/api/")) paths.push(new URL(req.url()).pathname);
  });
  await navigate(page);
  const first = page.locator("tbody tr").filter({ hasText: "Taxa API" });
  await expect(first).toContainText("Transferência API");
  await expect(first).toContainText("Cliente API");
  await expect(first).toContainText("Volkswagen Gol · API1A23");
  const second = page.locator("tbody tr").filter({ hasText: "Outra taxa" });
  for (const text of ["Solicitante Maria", "Fiat Uno · XYZ9B12", "Licenciamento", "Cancelado"])
    await expect(second).toContainText(text);
  await expect(second).not.toContainText("Cliente API");
  // StrictMode mounts effects twice in development. Each load still fetches
  // each reference collection once, never one request per expense.
  const loads = paths.filter((p) => p === "/api/despesas").length;
  expect(loads).toBeGreaterThan(0);
  expect(loads).toBeLessThanOrEqual(2);
  for (const path of ["/api/servicos", "/api/clientes", "/api/veiculos", "/api/tipos-servico"]) {
    expect(paths.filter((p) => p === path)).toHaveLength(loads);
    expect(paths.some((p) => p.startsWith(path + "/"))).toBe(false);
  }
  await expect(page.getByLabel("Filtrar por serviço").locator('option[value="8"]')).toHaveText(
    "Licenciamento · Solicitante Maria · Fiat Uno · XYZ9B12 · Cancelado · 16/10/2026 · Serviço #8",
  );
  await page.screenshot({
    path: "test-results/despesas-identificacao-desktop.png",
    fullPage: true,
  });
  await page.getByLabel("Filtrar por serviço").selectOption("8");
  await expect(page.locator("tbody tr")).toHaveCount(1);
  await expect(page.locator("tbody")).toContainText("Outra taxa");
});
test("relacionamentos ausentes são explícitos", async ({ page }) => {
  const { clientes, veiculos, servicos, despesas } = await mocks(page);
  clientes.rows = [];
  veiculos.rows = [];
  servicos.types = [];
  despesas.rows.push({
    ...despesas.rows[0],
    id_despesa: 15,
    id_servico: 99,
    descricao: "Serviço ausente",
  });
  await navigate(page);
  for (const text of [
    "Cliente solicitante #9 não encontrado",
    "Veículo #5 não encontrado",
    "Tipo de serviço #2 não encontrado",
    "Serviço #99 não encontrado",
  ])
    await expect(page.locator("tbody")).toContainText(text);
  await expect(page.locator("tbody")).not.toContainText("Cliente API");
});
test("falha de referência não é tratada como relacionamento inexistente", async ({ page }) => {
  const { clientes } = await mocks(page);
  clientes.offline = true;
  await navigate(page);
  await expect(page.getByRole("alert")).toBeVisible();
  await expect(page.locator("tbody tr")).toHaveCount(0);
});
