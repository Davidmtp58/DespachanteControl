import { expect, type Page } from "@playwright/test";
import { mockDashboard } from "./dashboard-mock";
export async function mockAuth(page: Page, active = false) {
  const state = {
    active,
    loginStatus: 200,
    logoutStatus: 204,
    meStatus: 200,
    csrf: "a".repeat(64),
    logoutTokens: [] as string[],
  };
  const usuario = {
    id_usuario: 1,
    nome: "Pessoa de Teste",
    email: "teste@example.test",
    ativo: true,
    data_cadastro: "2026-01-01T00:00:00",
  };
  // Intercept every API request; tests must never reach the real backend.
  await page.route("**/api/**", async (route) => {
    const req = route.request();
    const path = new URL(req.url()).pathname;
    if (path === "/api/auth/login" && req.method() === "POST") {
      expect(req.headers()["x-requested-with"]).toBe("DespachanteControl");
      if (state.loginStatus !== 200) return route.fulfill({ status: state.loginStatus, json: {} });
      state.active = true;
      return route.fulfill({
        json: { usuario, csrfToken: state.csrf },
        headers: { "Set-Cookie": "dc.sid=mock-only; HttpOnly; SameSite=Strict; Path=/" },
      });
    }
    if (path === "/api/auth/me")
      return route.fulfill({
        status: state.active ? state.meStatus : 401,
        json: { usuario, csrfToken: state.csrf },
      });
    if (path === "/api/auth/logout" && req.method() === "POST") {
      const token = req.headers()["x-csrf-token"];
      state.logoutTokens.push(token);
      if (token !== state.csrf) return route.fulfill({ status: 403, json: {} });
      if (state.logoutStatus !== 204)
        return route.fulfill({ status: state.logoutStatus, json: {} });
      expect(req.headers().cookie).toContain("dc.sid=mock-only");
      state.active = false;
      return route.fulfill({
        status: 204,
        headers: { "Set-Cookie": "dc.sid=; Max-Age=0; HttpOnly; SameSite=Strict; Path=/" },
      });
    }
    await route.abort();
    throw new Error("Unexpected API request in mock-only test");
  });
  await mockDashboard(page);
  return state;
}
export async function fillLogin(page: Page) {
  await page.getByLabel("E-mail", { exact: true }).fill("teste@example.test");
  await page.getByLabel("Senha", { exact: true }).fill("senha-apenas-do-mock");
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
}
