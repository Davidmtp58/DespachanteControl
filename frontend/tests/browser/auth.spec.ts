import { test, expect } from "@playwright/test";
import { mockAuth, fillLogin } from "./auth-mock";
test("login, cookie HttpOnly, restauração e logout com CSRF", async ({ page }) => {
  const state = await mockAuth(page);
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Tudo sob controle." })).toHaveCount(0);
  await fillLogin(page);
  await expect(page.getByText("Pessoa de Teste")).toBeVisible();
  expect(
    await page.evaluate(() => ({
      local: localStorage.length,
      session: sessionStorage.length,
      cookies: document.cookie,
    })),
  ).toEqual({ local: 0, session: 0, cookies: "" });
  await page.reload();
  await expect(page.getByText("Pessoa de Teste")).toBeVisible();
  await page.getByRole("button", { name: "Sair", exact: true }).click();
  await expect(page.getByRole("button", { name: "Entrar", exact: true })).toBeVisible();
  expect(state.logoutTokens).toEqual([state.csrf]);
  expect(state.active).toBe(false);
  await page.reload();
  await expect(page.getByRole("button", { name: "Entrar", exact: true })).toBeVisible();
});
test("credenciais inválidas e limite de tentativas não liberam páginas", async ({ page }) => {
  const state = await mockAuth(page);
  state.loginStatus = 401;
  await page.goto("/");
  await fillLogin(page);
  await expect(page.getByRole("alert")).toContainText("E-mail ou senha inválidos");
  await expect(page.getByLabel("Senha", { exact: true })).toHaveValue("");
  state.loginStatus = 429;
  await fillLogin(page);
  await expect(page.getByRole("alert")).toContainText("Muitas tentativas");
  await expect(page.locator(".app-shell")).toHaveCount(0);
});
test("sessão expirada ao voltar à aba bloqueia os módulos", async ({ page }) => {
  const state = await mockAuth(page, true);
  await page.goto("/");
  await expect(page.locator(".app-shell")).toBeVisible();
  state.active = false;
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(page.getByRole("alert")).toContainText("Sua sessão expirou");
  await expect(page.locator(".app-shell")).toHaveCount(0);
});
test("falha ao verificar sessão exige nova verificação", async ({ page }) => {
  const state = await mockAuth(page, true);
  state.meStatus = 500;
  await page.goto("/");
  await expect(page.getByRole("alert")).toBeVisible();
  await expect(page.locator(".app-shell")).toHaveCount(0);
  state.meStatus = 200;
  await page.getByRole("button", { name: "Tentar novamente" }).click();
  await expect(page.locator(".app-shell")).toBeVisible();
});
test("logout com falha mantém sessão e permite tentar novamente", async ({ page }) => {
  const state = await mockAuth(page);
  state.logoutStatus = 500;
  await page.goto("/");
  await fillLogin(page);
  await page.getByRole("button", { name: "Sair", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("Sua sessão pode continuar ativa");
  await expect(page.locator(".app-shell")).toBeVisible();
  state.logoutStatus = 204;
  state.csrf = "b".repeat(64);
  await page.getByRole("button", { name: "Sair", exact: true }).click();
  await expect(page.getByRole("button", { name: "Entrar", exact: true })).toBeVisible();
  expect(state.logoutTokens).toEqual(["a".repeat(64), "a".repeat(64), "b".repeat(64)]);
});
