import { test, expect, type Page } from "@playwright/test";
import { mockAuth } from "./auth-mock";
import { mockClientes } from "./clientes-mock";
import { mockVeiculos } from "./veiculos-mock";
import { mockServicos } from "./servicos-mock";
async function setup(page: Page) {
  await mockAuth(page, true);
  const clientes = await mockClientes(page);
  const veiculos = await mockVeiculos(page);
  const servicos = await mockServicos(page);
  clientes.rows.push({
    ...clientes.rows[0],
    id_cliente: 10,
    nome_razao_social: "Solicitante diferente",
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Serviços", exact: true }).click();
  return { clientes, veiculos, servicos };
}
test("lista e filtra todo o dia final; detalhes não usam despesas ou indicadores fictícios", async ({
  page,
}) => {
  await setup(page);
  await expect(page.locator("tbody")).toContainText("Transferência API");
  await page.getByLabel("Início até", { exact: true }).fill("2026-10-16");
  await expect(page.locator("tbody tr")).toHaveCount(1);
  await expect(page.getByRole("columnheader", { name: "Custo total" })).toHaveCount(0);
  await page.getByRole("button", { name: "Visualizar serviço 7", exact: true }).click();
  await expect(page.getByText("16/10/2026", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Adicionar despesa" })).toHaveCount(0);
  await expect(page.getByLabel("Resumo financeiro")).toHaveCount(0);
  await page.screenshot({ path: "test-results/servico-real.png", fullPage: true });
});
test("cadastra para solicitante diferente do proprietário e edita preservando precisão", async ({
  page,
}) => {
  const { servicos } = await setup(page);
  await page.getByRole("button", { name: "Novo serviço", exact: true }).click();
  await page.getByLabel("Cliente solicitante *", { exact: true }).selectOption("10");
  await expect(page.getByLabel("Veículo *", { exact: true })).toContainText(
    "Proprietário: Cliente API",
  );
  await page.getByLabel("Veículo *", { exact: true }).selectOption("5");
  await page.getByLabel("Tipo de serviço *", { exact: true }).selectOption("2");
  await expect(page.getByLabel("Valor recebido (R$) *")).toHaveValue("0,00");
  await expect(page.getByLabel("Data de início")).toHaveAttribute("type", "date");
  await expect(page.getByLabel("Data de conclusão")).toHaveAttribute("type", "date");
  await page.getByLabel("Data de início").fill("2026-10-17");
  await page.getByLabel("Valor recebido (R$) *").fill("350,50");
  await page.getByRole("button", { name: "Salvar", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.locator("tbody")).toContainText("Solicitante diferente");
  expect(servicos.writes[0].body).toMatchObject({
    id_cliente: 10,
    id_veiculo: 5,
    valor_recebido: "350.50",
    data_conclusao: null,
  });
  await page.getByRole("button", { name: "Editar serviço 8", exact: true }).click();
  await expect(page.getByLabel("Data de início")).toHaveValue("2026-10-17");
  await expect(page.getByLabel("Valor recebido (R$) *")).toHaveValue("350,50");
  await page.getByLabel("Status *", { exact: true }).selectOption("CONCLUIDO");
  await page.getByRole("button", { name: "Salvar", exact: true }).click();
  expect(servicos.writes).toHaveLength(1);
  expect(
    await page
      .getByLabel("Data de conclusão")
      .evaluate((el: HTMLInputElement) => el.validity.valueMissing),
  ).toBe(true);
  await page.getByLabel("Data de conclusão").fill("2026-10-17");
  await page.getByRole("button", { name: "Salvar", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(servicos.writes[1].body).toMatchObject({
    valor_recebido: "350.50",
    data_inicio: "2026-10-17T00:00:00",
    data_conclusao: "2026-10-17T00:00:00",
    status: "CONCLUIDO",
  });
  await page.getByRole("button", { name: "Editar serviço 8", exact: true }).click();
  await page.getByLabel("Status *", { exact: true }).selectOption("CANCELADO");
  await page.getByRole("button", { name: "Salvar", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.getByLabel("Status", { exact: true }).selectOption("CANCELADO");
  await expect(page.locator("tbody tr")).toHaveCount(1);
  await expect(page.locator("tbody")).toContainText("R$ 350,50");
  await page.getByRole("button", { name: "Dashboard", exact: true }).click();
  await expect(page.getByLabel("Indicadores financeiros e operacionais")).toContainText(
    "R$ 3.390,00",
  );
});
test("valida datas e valores antes da escrita e trata referências inválidas", async ({ page }) => {
  const { servicos } = await setup(page);
  await page.getByRole("button", { name: "Editar serviço 7", exact: true }).click();
  await page.getByLabel("Data de conclusão").fill("2026-10-15");
  await page.getByRole("button", { name: "Salvar", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("conclusão não pode ser anterior");
  await page.getByLabel("Data de conclusão").fill("");
  const money = page.getByLabel("Valor recebido (R$) *");
  await expect(money).toHaveValue("150,10");
  for (const invalid of ["ffff", "-1", "1.001"]) {
    await money.fill(invalid);
    await expect(money).toHaveValue("150,10");
  }
  expect(servicos.writes).toHaveLength(0);
  await money.fill("");
  await expect(money).toHaveValue("0,00");
  await money.press("End");
  await money.pressSequentially("35050");
  await expect(money).toHaveValue("350,50");
  await money.fill("");
  await money.blur();
  await expect(money).toHaveValue("0,00");
  servicos.writeStatus = 400;
  servicos.code = "INVALID_REFERENCE";
  await page.getByRole("button", { name: "Salvar", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText(
    "Cliente, veículo ou tipo de serviço não encontrado",
  );
  await expect(page.getByRole("dialog")).toBeVisible();
});
test("401 na escrita retorna ao login", async ({ page }) => {
  const { servicos } = await setup(page);
  await page.getByRole("button", { name: "Editar serviço 7", exact: true }).click();
  servicos.writeStatus = 401;
  await page.getByRole("button", { name: "Salvar", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("Sua sessão expirou");
  await expect(page.locator(".app-shell")).toHaveCount(0);
});
test("404 na consulta e recarga com falha após escrita confirmada", async ({ page }) => {
  const { servicos } = await setup(page);
  servicos.detailStatus = 404;
  await page.getByRole("button", { name: "Visualizar serviço 7", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("Serviço não encontrado");
  servicos.detailStatus = 200;
  servicos.failListAfterWrite = true;
  await page.getByRole("button", { name: "Editar serviço 7", exact: true }).click();
  await page.getByRole("button", { name: "Salvar", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByText("Serviço salvo com sucesso.")).toBeVisible();
  await expect(page.getByRole("alert")).toBeVisible();
  expect(servicos.writes).toHaveLength(1);
});
for (const source of ["servicos", "clientes", "veiculos", "tipos"] as const) {
  test(`falha de ${source} bloqueia lista sem fallback`, async ({ page }) => {
    await mockAuth(page, true);
    const c = await mockClientes(page);
    const v = await mockVeiculos(page);
    const s = await mockServicos(page);
    if (source === "clientes") c.offline = true;
    else if (source === "veiculos") v.offline = true;
    else if (source === "tipos") s.typesStatus = 500;
    else s.offline = true;
    await page.goto("/");
    await page.getByRole("button", { name: "Serviços", exact: true }).click();
    await expect(page.getByRole("alert")).toBeVisible();
    await expect(page.locator("tbody tr")).toHaveCount(0);
    c.offline = false;
    v.offline = false;
    s.offline = false;
    s.typesStatus = 200;
    await page.getByRole("button", { name: "Atualizar lista" }).click();
    await expect(page.locator("tbody")).toContainText("Transferência API");
  });
}
