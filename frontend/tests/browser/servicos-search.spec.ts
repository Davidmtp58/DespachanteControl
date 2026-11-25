import { test, expect, type Page } from "@playwright/test";
import { mockAuth } from "./auth-mock";
import { mockClientes } from "./clientes-mock";
import { mockVeiculos } from "./veiculos-mock";
import { mockServicos } from "./servicos-mock";

async function setup(page: Page, large = false) {
  await mockAuth(page, true);
  const c = await mockClientes(page),
    v = await mockVeiculos(page),
    s = await mockServicos(page);
  c.rows.push({
    ...c.rows[0],
    id_cliente: 10,
    nome_razao_social: "Razão TESTE_HML",
    cpf_cnpj: "99000000000159",
  });
  v.rows.push({
    ...v.rows[0],
    id_veiculo: 6,
    id_cliente_proprietario: 10,
    placa: "HML1234",
    modelo: "Modelo TESTE_HML",
  });
  if (large)
    for (let i = 0; i < 1000; i++)
      c.rows.push({
        ...c.rows[0],
        id_cliente: i + 100,
        nome_razao_social: `TESTE_HML ${i}`,
        cpf_cnpj: String(i + 10000000000),
      });
  await page.goto("/servicos");
  await page.getByRole("button", { name: "Novo serviço", exact: true }).click();
  return { c, v, s };
}

test("search names/documents and plates/models, keyboard selection, priority without ownership mutation", async ({
  page,
}) => {
  const { v, s } = await setup(page);
  const client = page.getByRole("combobox", { name: "Cliente solicitante *", exact: true });
  const vehicle = page.getByRole("combobox", { name: "Veículo *", exact: true });
  await client.fill("razao");
  await expect(page.getByRole("listbox").getByRole("option")).toHaveCount(1);
  await client.fill("99.000.000/0001-59");
  await client.press("ArrowDown");
  await expect(client).toHaveAttribute("aria-activedescendant", /option-0$/);
  await client.press("Enter");
  await expect(page.locator('input[name="cliente"]')).toHaveValue("10");
  await vehicle.click();
  await expect(page.getByRole("listbox").getByRole("option").first()).toContainText("HML1234");
  await expect(page.getByRole("listbox").getByRole("option").first()).toContainText(
    "Do cliente solicitante",
  );
  await vehicle.fill("modelo teste");
  await expect(page.getByRole("listbox").getByRole("option")).toHaveCount(1);
  await vehicle.fill("api-1a23");
  await expect(page.getByRole("listbox").getByRole("option")).toContainText(
    "Proprietário: Cliente API",
  );
  await page.getByRole("listbox").getByRole("option").click();
  await expect(page.locator('input[name="veiculo"]')).toHaveValue("5");
  // Replacing the requester does not change the vehicle ID or owner.
  await client.fill("Cliente API");
  await client.press("ArrowDown");
  await client.press("Enter");
  await expect(page.locator('input[name="veiculo"]')).toHaveValue("5");
  await client.fill("razao");
  await page.getByRole("listbox").getByRole("option").click();
  await page.getByLabel("Tipo de serviço *", { exact: true }).selectOption("2");
  await page.getByRole("button", { name: "Salvar", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(s.writes[0].body).toMatchObject({ id_cliente: 10, id_veiculo: 5 });
  expect(v.writes).toHaveLength(0);
  expect(v.rows[0].id_cliente_proprietario).toBe(9);
});

test("unselected text invalidates previous ID, Escape/Tab never choose, empty results block saving", async ({
  page,
}) => {
  const { s } = await setup(page);
  await page.getByRole("button", { name: "Cancelar", exact: true }).click();
  await page.getByRole("button", { name: "Editar serviço 7", exact: true }).click();
  const client = page.getByRole("combobox", { name: "Cliente solicitante *", exact: true });
  await expect(client).toHaveValue(/Cliente API/);
  await expect(page.locator('input[name="cliente"]')).toHaveValue("9");
  await client.click();
  await client.press("ControlOrMeta+A");
  await client.pressSequentially("Cliente API"); // retyping even an exact label is not a selection
  await client.press("Tab");
  await expect(page.locator('input[name="cliente"]')).toHaveValue("");
  await page.getByRole("button", { name: "Salvar", exact: true }).click();
  expect(s.writes).toHaveLength(0);
  await client.fill("not-found");
  await expect(page.getByText(/Nenhum resultado encontrado/)).toBeVisible();
  await client.press("Enter");
  await client.press("Escape");
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(client).toHaveAttribute("aria-expanded", "false");
  await expect(client).toHaveAttribute("aria-invalid", "true");
  await expect(page.locator('input[name="cliente"]')).toHaveValue("");
  expect(s.writes).toHaveLength(0);
});

test("all loaded clients remain searchable beyond suggestion limit, including on mobile", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await setup(page, true);
  const client = page.getByRole("combobox", { name: "Cliente solicitante *", exact: true });
  await client.click();
  await expect(page.getByRole("listbox").getByRole("option")).toHaveCount(20);
  await expect(page.getByText(/registros carregados|sugestões exibidas/)).toHaveCount(0);
  await expect(page.getByText(/Refine a busca/)).toBeVisible();
  await page.screenshot({ path: "test-results/search-select-mobile.png", fullPage: true });
  await client.fill("TESTE_HML 999");
  await page.getByRole("listbox").getByRole("option").click();
  await expect(page.locator('input[name="cliente"]')).toHaveValue("1099");
  const dialog = page.getByRole("dialog");
  expect(await dialog.evaluate((el) => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
});

test("compact dropdown opens only on interaction and closes after mouse/keyboard selection", async ({
  page,
}) => {
  await setup(page);
  const client = page.getByRole("combobox", { name: "Cliente solicitante *", exact: true });
  const vehicle = page.getByRole("combobox", { name: "Veículo *", exact: true });
  await expect(page.getByRole("listbox")).toHaveCount(0);
  await client.fill("razao");
  await expect(client).toHaveAttribute("aria-expanded", "true");
  await page.screenshot({ path: "test-results/search-select-open.png", fullPage: true });
  await page.getByRole("listbox").getByRole("option").click();
  await expect(client).toHaveValue("Razão TESTE_HML");
  await expect(client).toHaveAttribute("aria-expanded", "false");
  await expect(page.getByRole("listbox")).toHaveCount(0);
  await expect(page.locator('input[name="cliente"]')).toHaveValue("10");
  await client.click();
  await expect(page.getByRole("listbox")).toBeVisible();
  await client.press("Escape");
  await expect(client).toHaveValue("Razão TESTE_HML");
  await client.press("Tab");
  await expect(vehicle).toBeFocused();
  await expect(page.getByRole("listbox")).toHaveCount(0);
  await vehicle.press("ArrowDown");
  await expect(page.getByRole("listbox").getByRole("option").first()).toHaveClass(/active/);
  await vehicle.press("Enter");
  await expect(vehicle).toHaveValue("HML1234 · Modelo TESTE_HML");
  await expect(page.getByRole("listbox")).toHaveCount(0);
  await expect(page.locator('input[name="veiculo"]')).toHaveValue("6");
  await vehicle.click();
  await vehicle.fill("API1A23");
  await page.getByRole("listbox").getByRole("option").click();
  await expect(vehicle).toHaveValue("API1A23 · Gol");
  await expect(page.locator('input[name="veiculo"]')).toHaveValue("5");
  await expect(page.locator('input[name="cliente"]')).toHaveValue("10");
  await expect(page.getByRole("listbox")).toHaveCount(0);
  await page.screenshot({ path: "test-results/search-select-compact.png", fullPage: true });
});

test("missing references in edit cannot become valid free text", async ({ page }) => {
  const { c, v, s } = await setup(page);
  await page.getByRole("button", { name: "Cancelar", exact: true }).click();
  c.rows = c.rows.filter((row) => row.id_cliente !== 9);
  v.rows = v.rows.filter((row) => row.id_veiculo !== 5);
  await page.getByRole("button", { name: "Editar serviço 7", exact: true }).click();
  await expect(page.getByText(/Registro anterior indisponível/)).toHaveCount(2);
  await page.getByRole("button", { name: "Salvar", exact: true }).click();
  expect(s.writes).toHaveLength(0);
});
