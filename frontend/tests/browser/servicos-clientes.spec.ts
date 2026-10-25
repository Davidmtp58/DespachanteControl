import { test, expect, type Page } from "@playwright/test";
import { mockAuth } from "./auth-mock";
import { mockClientes } from "./clientes-mock";
import { mockVeiculos } from "./veiculos-mock";
import { mockServicos } from "./servicos-mock";
async function setup(page: Page) {
  await mockAuth(page, true);
  const clientes = await mockClientes(page);
  const base = clientes.rows[0];
  clientes.rows = Array.from({ length: 8 }, (_, i) => ({
    ...base,
    id_cliente: i + 9,
    nome_razao_social: `Cliente retornado ${i + 1}`,
  }));
  await mockVeiculos(page);
  await mockServicos(page);
  await page.goto("/");
  return clientes;
}
test("atalho do Dashboard abre formulário real com todos os oito clientes da API", async ({
  page,
}) => {
  const clientes = await setup(page);
  const response = page.waitForResponse((r) => new URL(r.url()).pathname === "/api/clientes");
  await page.getByRole("button", { name: "Novo serviço", exact: true }).click();
  await expect(
    page.getByLabel("Cliente solicitante *", { exact: true }).locator("option"),
  ).toHaveCount(9);
  expect((await (await response).json()).length).toBe(8);
  await expect(page.getByRole("dialog")).toContainText("Cadastro de Serviços");
  for (const c of clientes.rows)
    await expect(
      page
        .getByLabel("Cliente solicitante *", { exact: true })
        .locator(`option[value="${c.id_cliente}"]`),
    ).toHaveText(c.nome_razao_social);
  await page.getByLabel("Cliente solicitante *", { exact: true }).selectOption("16");
  await page.getByLabel("Veículo *", { exact: true }).selectOption("5");
  await expect(page.getByLabel("Cliente solicitante *", { exact: true })).toHaveValue("16");
});
test("cadastro e edição pelo menu incluem novos clientes após carregamento inicial", async ({
  page,
}) => {
  const clientes = await setup(page);
  await page.getByRole("button", { name: "Serviços", exact: true }).click();
  await expect(page.locator("tbody")).toContainText("Transferência API");
  clientes.rows.push({
    ...clientes.rows[0],
    id_cliente: 30,
    nome_razao_social: "Cliente adicionado depois",
  });
  await page.getByRole("button", { name: "Novo serviço", exact: true }).click();
  await expect(
    page.getByLabel("Cliente solicitante *", { exact: true }).locator("option"),
  ).toHaveCount(10);
  await page.getByRole("button", { name: "Cancelar", exact: true }).click();
  await page.getByRole("button", { name: "Editar serviço 7", exact: true }).click();
  await expect(
    page.getByLabel("Cliente solicitante *", { exact: true }).locator("option"),
  ).toHaveCount(10);
  await page.getByLabel("Cliente solicitante *", { exact: true }).selectOption("30");
  await page.getByRole("button", { name: "Salvar", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.locator("tbody")).toContainText("Cliente adicionado depois");
});
test("Dashboard encaminha à lista real sem abrir detalhes demonstrativos", async ({ page }) => {
  await setup(page);
  await expect(page.locator("tbody")).toContainText("Cliente financeiro API");
  await expect(page.locator("tbody button")).toHaveCount(0);
  await page.getByRole("button", { name: "Ver todos", exact: true }).click();
  await expect(page.locator("tbody")).toContainText("Transferência API");
  await expect(page.getByRole("dialog")).toHaveCount(0);
});
