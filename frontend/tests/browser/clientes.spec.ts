import { test, expect, type Page } from "@playwright/test";
import { mockAuth } from "./auth-mock";
import { mockClientes } from "./clientes-mock";
import { mockVeiculos } from "./veiculos-mock";
import { mockServicos } from "./servicos-mock";
async function setup(page: Page) {
  await mockAuth(page, true);
  const state = await mockClientes(page);
  await mockVeiculos(page);
  await mockServicos(page);
  await page.goto("/");
  await page.getByRole("button", { name: "Clientes", exact: true }).click();
  return state;
}
test("lista, pesquisa e consulta cliente real sem misturar mocks", async ({ page }) => {
  await setup(page);
  await expect(page.locator("tbody tr")).toHaveCount(1);
  await expect(page.locator("tbody")).toContainText("Cliente API");
  await expect(page.locator("tbody")).not.toContainText("João da Silva");
  await page.getByLabel("Buscar nome, CPF/CNPJ, telefone ou e-mail").fill("API");
  await page.getByRole("button", { name: "Visualizar Cliente API", exact: true }).click();
  await expect(page.getByLabel("Nome / Razão Social *")).toBeDisabled();
  await expect(page.getByLabel("Data de nascimento (opcional)")).toHaveValue("1990-01-02");
  await expect(page.getByRole("dialog")).not.toContainText("Dados demonstrativos");
  await page.getByRole("button", { name: "Fechar", exact: true }).last().click();
  await page.getByRole("button", { name: "Serviços", exact: true }).click();
  await page.getByRole("button", { name: "Novo serviço", exact: true }).click();
  await expect(page.getByLabel("Cliente solicitante *", { exact: true })).toContainText(
    "Cliente API",
  );
  await expect(page.getByLabel("Cliente solicitante *", { exact: true })).not.toContainText(
    "Cliente financeiro API",
  );
});
test("cadastra e atualiza com snake_case e atualiza listagem", async ({ page }) => {
  const state = await setup(page);
  await page.getByRole("button", { name: "Novo cliente", exact: true }).click();
  await page.getByLabel("CPF *", { exact: true }).fill("111.444.777-35");
  await page.getByLabel("Nome / Razão Social *").fill("Novo cliente API");
  await page.getByLabel("Telefone *").fill("85999990001");
  await page.getByRole("button", { name: "Salvar", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.locator("tbody")).toContainText("Novo cliente API");
  expect(state.writes[0].body).toMatchObject({
    cpf_cnpj: "11144477735",
    email: null,
    data_nascimento: null,
  });
  await page.getByRole("button", { name: "Editar Novo cliente API", exact: true }).click();
  await page.getByLabel("E-mail", { exact: true }).fill("cliente@example.test");
  await page.getByRole("button", { name: "Salvar", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.locator("tbody")).toContainText("cliente@example.test");
  expect(state.writes.map((w) => w.method)).toEqual(["POST", "PUT"]);
});
test("erros de validação e duplicidade preservam formulário", async ({ page }) => {
  const state = await setup(page);
  await page.getByRole("button", { name: "Editar Cliente API", exact: true }).click();
  state.writeStatus = 400;
  await page.getByRole("button", { name: "Salvar", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("Dados inválidos");
  await expect(page.getByLabel("Nome / Razão Social *")).toHaveValue("Cliente API");
  state.writeStatus = 409;
  await page.getByRole("button", { name: "Salvar", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("CPF/CNPJ já cadastrado");
  await expect(page.getByRole("alert")).not.toContainText("internal-details");
});
test("401 na gravação encerra a sessão na interface", async ({ page }) => {
  const state = await setup(page);
  await page.getByRole("button", { name: "Editar Cliente API", exact: true }).click();
  state.writeStatus = 401;
  await page.getByRole("button", { name: "Salvar", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("Sua sessão expirou");
  await expect(page.locator(".app-shell")).toHaveCount(0);
});
test("API indisponível não apresenta clientes simulados e permite recuperar", async ({ page }) => {
  await mockAuth(page, true);
  const state = await mockClientes(page);
  state.offline = true;
  await page.goto("/");
  await page.getByRole("button", { name: "Clientes", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("conectar à API");
  await expect(page.locator("tbody tr")).toHaveCount(0);
  state.offline = false;
  await page.getByRole("button", { name: "Atualizar lista" }).click();
  await expect(page.locator("tbody")).toContainText("Cliente API");
});
test("falha de recarga após gravação confirmada não incentiva novo POST", async ({ page }) => {
  const state = await setup(page);
  state.failListAfterWrite = true;
  await page.getByRole("button", { name: "Editar Cliente API", exact: true }).click();
  await page.getByRole("button", { name: "Salvar", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByText("Cliente salvo com sucesso.")).toBeVisible();
  await expect(page.getByRole("alert")).toBeVisible();
  expect(state.writes).toHaveLength(1);
});
