import { test, expect } from "@playwright/test";
import { mockAuth, fillLogin } from "./auth-mock";
import { mockClientes } from "./clientes-mock";
import { mockVeiculos } from "./veiculos-mock";
import { mockDespesas } from "./despesas-mock";
import { mockServicos } from "./servicos-mock";
test.beforeEach(async ({ page }) => {
  await mockAuth(page);
  await mockClientes(page);
  await mockVeiculos(page);
  await mockServicos(page);
  await mockDespesas(page);
});
test("percorre login, cadastros, filtros, serviço e despesas", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Bem-vindo ao seu escritório" })).toBeVisible();
  await page.screenshot({ path: "test-results/01-login.png", fullPage: true });
  await fillLogin(page);
  await expect(page.getByRole("heading", { name: "Tudo sob controle." })).toBeVisible();
  await expect(page.getByLabel("Indicadores financeiros e operacionais")).toContainText(
    "R$ 1.790,00",
  );
  await page.screenshot({ path: "test-results/02-dashboard.png", fullPage: true });
  await page.getByRole("button", { name: "Clientes", exact: true }).click();
  await page.getByRole("button", { name: "Novo cliente", exact: true }).click();
  await page.getByLabel("CPF *", { exact: true }).fill("11144477735");
  await page.getByLabel("Nome / Razão Social *").fill("Cliente de Teste");
  await page.getByLabel("Telefone *").fill("83999990000");
  await page.getByRole("button", { name: "Salvar", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.getByLabel("Buscar nome, CPF/CNPJ, telefone ou e-mail").fill("Cliente de Teste");
  await expect(page.locator("tbody tr")).toHaveCount(1);
  await page.getByRole("button", { name: "Editar Cliente de Teste", exact: true }).click();
  await page.getByLabel("E-mail", { exact: true }).fill("teste@example.com");
  await page.getByRole("button", { name: "Salvar", exact: true }).click();
  await expect(page.getByText("teste@example.com", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Visualizar Cliente de Teste", exact: true }).click();
  await expect(page.getByLabel("Nome / Razão Social *")).toBeDisabled();
  await page.getByRole("button", { name: "Fechar", exact: true }).last().click();
  await page.getByLabel("Buscar nome, CPF/CNPJ, telefone ou e-mail").fill("");
  await page.screenshot({ path: "test-results/03-clientes.png", fullPage: true });
  await page.getByRole("button", { name: "Veículos", exact: true }).click();
  await page.getByRole("button", { name: "Novo veículo", exact: true }).click();
  await page.getByLabel("Proprietário *", { exact: true }).selectOption("9");
  await page.getByLabel("Placa *", { exact: true }).fill("TST1A23");
  await page.getByLabel("Tipo de veículo *", { exact: true }).fill("Automóvel");
  await page.getByLabel("Marca *", { exact: true }).fill("Fiat");
  await page.getByLabel("Modelo *", { exact: true }).fill("Argo");
  await page.getByLabel("RENAVAM *", { exact: true }).fill("11111111111");
  await page.getByRole("button", { name: "Salvar", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByText("TST1A23", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Editar TST1A23", exact: true }).click();
  await page.getByLabel("Ano (opcional)").fill("2024");
  await page.getByRole("button", { name: "Salvar", exact: true }).click();
  await page.getByRole("button", { name: "Visualizar TST1A23", exact: true }).click();
  await expect(page.getByLabel("Ano (opcional)")).toHaveValue("2024");
  await page.getByRole("button", { name: "Fechar", exact: true }).last().click();
  await page.screenshot({ path: "test-results/04-veiculos.png", fullPage: true });
  await page.getByRole("button", { name: "Dashboard", exact: true }).click();
  await expect(page.getByLabel("Indicadores financeiros e operacionais")).toContainText(
    "R$ 3.390,00",
  );
  await page.getByRole("button", { name: "Despesas", exact: true }).click();
  await expect(page.locator("tbody")).toContainText("Taxa API");
  await page.getByRole("button", { name: "Excluir despesa 12" }).click();
  await page.getByRole("button", { name: "Cancelar", exact: true }).click();
  await expect(page.locator("tbody")).toContainText("Taxa API");
  await page.reload();
  await expect(page).toHaveURL(/\/despesas$/);
  await expect(page.locator("tbody")).toContainText("Taxa API");
  expect(errors).toEqual([]);
});
test("layout móvel e navegação acessível", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await fillLogin(page);
  await expect(page.getByRole("heading", { name: "Tudo sob controle." })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await page.screenshot({ path: "test-results/08-mobile.png", fullPage: true });
  await page.getByRole("button", { name: "Abrir navegação" }).click();
  await page.getByRole("button", { name: "Serviços", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Serviços", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Novo serviço", exact: true }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.screenshot({ path: "test-results/09-mobile-form.png", fullPage: true });
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
});
