import { test, expect, type Page } from "@playwright/test";
import { mockAuth, fillLogin } from "./auth-mock";
import { mockClientes } from "./clientes-mock";
import { mockVeiculos } from "./veiculos-mock";
import { mockServicos } from "./servicos-mock";
import { mockDespesas } from "./despesas-mock";

async function setup(page: Page, active = true) {
  const auth = await mockAuth(page, active);
  await mockClientes(page);
  await mockVeiculos(page);
  await mockServicos(page);
  await mockDespesas(page);
  return auth;
}
const sections = [
  ["dashboard", "Dashboard"],
  ["clientes", "Clientes"],
  ["veiculos", "Veículos"],
  ["servicos", "Serviços"],
  ["despesas", "Despesas"],
] as const;
for (const [path, label] of sections) {
  test(`URL direta e F5 preservam ${label} com sessão recuperada`, async ({ page }) => {
    await setup(page);
    await page.goto(`/${path}`);
    await expect(page.getByRole("button", { name: label, exact: true })).toHaveAttribute(
      "aria-current",
      "page",
    );
    await page.reload();
    await expect(page.getByRole("button", { name: label, exact: true })).toHaveAttribute(
      "aria-current",
      "page",
    );
    await expect(page).toHaveURL(new RegExp(`/${path}$`));
  });
}
test("menu, Voltar e Avançar seguem o histórico sem reabrir formulário", async ({ page }) => {
  await setup(page);
  await page.goto("/dashboard");
  await page.getByRole("button", { name: "Novo serviço", exact: true }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.goBack();
  await expect(page).toHaveURL(/\/dashboard$/);
  await page.goForward();
  await expect(page).toHaveURL(/\/servicos$/);
  await expect(page.getByRole("dialog")).toHaveCount(0);
  for (const [path, label] of sections) {
    await page.getByRole("button", { name: label, exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`/${path}$`));
  }
  await page.goBack();
  await expect(page).toHaveURL(/\/servicos$/);
  await page.goForward();
  await expect(page).toHaveURL(/\/despesas$/);
});
test("link protegido pede login, retorna à seção e logout bloqueia histórico", async ({ page }) => {
  await setup(page, false);
  await page.goto("/clientes");
  await expect(page).toHaveURL(/\/login\?next=\/clientes$/);
  await expect(page.locator(".app-shell")).toHaveCount(0);
  await fillLogin(page);
  await expect(page).toHaveURL(/\/clientes$/);
  await page.getByRole("button", { name: "Veículos", exact: true }).click();
  await page.getByRole("button", { name: "Sair", exact: true }).click();
  await expect(page).toHaveURL(/\/login$/);
  await page.goBack();
  await expect(page.getByRole("button", { name: "Entrar", exact: true })).toBeVisible();
  await expect(page.locator(".app-shell")).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole("button", { name: "Entrar", exact: true })).toBeVisible();
});
test("recuperação pendente não altera URL nem carrega módulo protegido", async ({ page }) => {
  await setup(page);
  let release!: () => void;
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/api/auth/me", async (route) => {
    await pending;
    await route.fallback();
  });
  await page.goto("/despesas");
  await expect(page.getByRole("status")).toContainText("Verificando sessão");
  await expect(page).toHaveURL(/\/despesas$/);
  await expect(page.locator(".app-shell")).toHaveCount(0);
  release();
  await expect(page.getByRole("button", { name: "Despesas", exact: true })).toHaveAttribute(
    "aria-current",
    "page",
  );
});
