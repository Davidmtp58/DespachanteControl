import { test, expect, type Page } from "@playwright/test";
import { mockAuth } from "./auth-mock";
import { mockClientes } from "./clientes-mock";
import { mockVeiculos } from "./veiculos-mock";
import { mockServicos } from "./servicos-mock";
async function setup(page: Page) {
  await mockAuth(page, true);
  const owners = await mockClientes(page);
  const vehicles = await mockVeiculos(page);
  await mockServicos(page);
  await page.goto("/");
  await page.getByRole("button", { name: "Veículos", exact: true }).click();
  return { owners, vehicles };
}
test("lista, pesquisa por proprietário, consulta detalhes e isola Serviços", async ({ page }) => {
  await setup(page);
  await expect(page.locator("tbody tr")).toHaveCount(1);
  await expect(page.locator("tbody")).toContainText("Cliente API");
  await page.getByLabel("Buscar placa, modelo, RENAVAM ou proprietário").fill("Cliente API");
  await page.getByRole("button", { name: "Visualizar API1A23", exact: true }).click();
  await expect(page.getByLabel("Modelo *")).toHaveValue("Gol");
  await expect(page.getByLabel("Proprietário *", { exact: true })).toHaveValue("9");
  await expect(page.getByLabel("RENAVAM *")).toHaveValue("00123456789");
  await expect(page.getByLabel("Modelo *")).toBeDisabled();
  await expect(page.getByRole("dialog")).not.toContainText("Dados demonstrativos");
  await page.getByRole("button", { name: "Fechar", exact: true }).last().click();
  await page.getByRole("button", { name: "Serviços", exact: true }).click();
  await page.getByRole("button", { name: "Novo serviço", exact: true }).click();
  await expect(page.getByLabel("Veículo *", { exact: true })).toContainText("API1A23");
  await expect(page.getByLabel("Cliente solicitante *", { exact: true })).toContainText(
    "Cliente API",
  );
});
test("cadastra e edita com proprietário real, ano nulo e RENAVAM preservado", async ({ page }) => {
  const { vehicles, owners } = await setup(page);
  await expect(page.locator("tbody")).toContainText("API1A23");
  owners.rows.push({ ...owners.rows[0], id_cliente: 10, nome_razao_social: "Outro cliente API" });
  await page.getByRole("button", { name: "Novo veículo", exact: true }).click();
  await expect(page.getByLabel("Proprietário *", { exact: true })).toContainText(
    "Outro cliente API",
  );
  await expect(page.getByLabel("Proprietário *", { exact: true })).not.toContainText(
    "João da Silva",
  );
  await page.getByLabel("Proprietário *", { exact: true }).selectOption("9");
  await page.getByLabel("Placa *", { exact: true }).fill("tst-1234");
  await page.getByLabel("Tipo de veículo *", { exact: true }).fill("Automóvel");
  await page.getByLabel("Marca *").fill("Volkswagen");
  await page.getByLabel("Modelo *").fill("Gol");
  await page.getByLabel("RENAVAM *").fill("00987654321");
  await page.getByRole("button", { name: "Salvar", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.locator("tbody")).toContainText("TST1234");
  expect(vehicles.writes[0]).toMatchObject({
    method: "POST",
    body: { id_cliente_proprietario: 9, placa: "TST1234", ano: null, renavam: "00987654321" },
  });
  await page.getByRole("button", { name: "Editar TST1234", exact: true }).click();
  await page.getByLabel("Proprietário *", { exact: true }).selectOption("10");
  await page.getByLabel("Ano (opcional)").fill("2020");
  await page.getByRole("button", { name: "Salvar", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.locator("tbody tr").filter({ hasText: "TST1234" })).toContainText(
    "Outro cliente API",
  );
  expect(vehicles.writes[1]).toMatchObject({
    method: "PUT",
    body: { id_cliente_proprietario: 10, ano: 2020 },
  });
});
test("formulário bloqueia placa, RENAVAM, ano e obrigatórios inválidos", async ({ page }) => {
  const { vehicles } = await setup(page);
  await page.getByRole("button", { name: "Editar API1A23", exact: true }).click();
  for (const [label, value, restore] of [
    ["Placa *", "INVALID", "API1A23"],
    ["RENAVAM *", "123", "00123456789"],
    ["Ano (opcional)", "999", "2020"],
    ["Modelo *", "", "Gol"],
  ]) {
    await page.getByLabel(label, { exact: true }).fill(value);
    await page.getByRole("button", { name: "Salvar", exact: true }).click();
    expect(
      await page
        .getByLabel(label, { exact: true })
        .evaluate((el: HTMLInputElement) => el.validity.valid),
    ).toBe(false);
    expect(vehicles.writes).toHaveLength(0);
    await page.getByLabel(label, { exact: true }).fill(restore);
  }
});
test("duplicidade, proprietário inexistente e validação mantêm formulário", async ({ page }) => {
  const { vehicles } = await setup(page);
  await page.getByRole("button", { name: "Editar API1A23", exact: true }).click();
  for (const [status, code, message] of [
    [409, "DUPLICATE_VEHICLE", "Placa ou RENAVAM já cadastrado"],
    [400, "OWNER_NOT_FOUND", "Cliente proprietário não encontrado"],
    [400, "VALIDATION_ERROR", "Dados inválidos"],
  ] as const) {
    vehicles.writeStatus = status;
    vehicles.code = code;
    await page.getByRole("button", { name: "Salvar", exact: true }).click();
    await expect(page.getByRole("alert")).toContainText(message);
    await expect(page.getByLabel("Modelo *")).toHaveValue("Gol");
    await expect(page.getByRole("alert")).not.toContainText("internal SQL");
  }
});

for (const editing of [false, true]) {
  test(`duplicidades junto aos campos no ${editing ? "PUT" : "POST"}`, async ({ page }) => {
    const { vehicles } = await setup(page);
    await page
      .getByRole("button", { name: editing ? "Editar API1A23" : "Novo veículo", exact: true })
      .click();
    if (!editing) {
      await page.getByLabel("Proprietário *", { exact: true }).selectOption("9");
      await page.getByLabel("Placa *", { exact: true }).fill("TST1A23");
      await page.getByLabel("RENAVAM *", { exact: true }).fill("00123456789");
      await page.getByLabel("Tipo de veículo *", { exact: true }).fill("Automóvel");
      await page.getByLabel("Marca *", { exact: true }).fill("Volkswagen");
      await page.getByLabel("Modelo *", { exact: true }).fill("Gol");
    }
    for (const code of ["DUPLICATE_PLATE", "DUPLICATE_RENAVAM", "DUPLICATE_PLATE_AND_RENAVAM"]) {
      vehicles.writeStatus = 409;
      vehicles.code = code;
      await page.getByRole("button", { name: "Salvar", exact: true }).click();
      const plate = code !== "DUPLICATE_RENAVAM";
      const renavam = code !== "DUPLICATE_PLATE";
      await expect(page.locator("#veiculo-placa-error")).toHaveCount(plate ? 1 : 0);
      await expect(page.locator("#veiculo-renavam-error")).toHaveCount(renavam ? 1 : 0);
      if (plate)
        await expect(page.locator('[name="placa"]')).toHaveAccessibleDescription(
          "Esta placa já está cadastrada em outro veículo.",
        );
      if (renavam)
        await expect(page.locator('[name="renavam"]')).toHaveAccessibleDescription(
          "Este RENAVAM já está cadastrado em outro veículo.",
        );
      await expect(page.getByLabel("Modelo *")).toHaveValue("Gol");
    }
    vehicles.writeStatus = 200;
    await page.getByRole("button", { name: "Salvar", exact: true }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    expect(vehicles.writes.at(-1)?.method).toBe(editing ? "PUT" : "POST");
  });
}
for (const source of ["veiculos", "clientes"] as const) {
  test(`falha de ${source} não usa mocks nem permite seleção fictícia`, async ({ page }) => {
    await mockAuth(page, true);
    const owners = await mockClientes(page);
    const vehicles = await mockVeiculos(page);
    if (source === "veiculos") vehicles.offline = true;
    else owners.offline = true;
    await page.goto("/");
    await page.getByRole("button", { name: "Veículos", exact: true }).click();
    await expect(page.getByRole("alert")).toContainText("conectar à API");
    await expect(page.locator("tbody tr")).toHaveCount(0);
    await page.getByRole("button", { name: "Novo veículo", exact: true }).click();
    if (source === "clientes") await expect(page.getByRole("dialog")).toHaveCount(0);
    else {
      await expect(page.getByLabel("Proprietário *", { exact: true })).not.toContainText(
        "João da Silva",
      );
      await page.getByRole("button", { name: "Cancelar", exact: true }).click();
    }
    vehicles.offline = false;
    owners.offline = false;
    // If opening cleared the original list error, navigate back to reload both lists.
    await page.getByRole("button", { name: "Dashboard", exact: true }).click();
    await page.getByRole("button", { name: "Veículos", exact: true }).click();
    await expect(page.locator("tbody")).toContainText("API1A23");
  });
}
test("HTTP 401 de Veículos retorna ao login", async ({ page }) => {
  const { vehicles } = await setup(page);
  await page.getByRole("button", { name: "Editar API1A23", exact: true }).click();
  vehicles.writeStatus = 401;
  await page.getByRole("button", { name: "Salvar", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("Sua sessão expirou");
  await expect(page.locator(".app-shell")).toHaveCount(0);
});
test("404 na consulta e falha na recarga após gravação são explícitos", async ({ page }) => {
  const { vehicles } = await setup(page);
  vehicles.detailStatus = 404;
  await page.getByRole("button", { name: "Visualizar API1A23", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("Veículo não encontrado");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  vehicles.detailStatus = 200;
  vehicles.failListAfterWrite = true;
  await page.getByRole("button", { name: "Editar API1A23", exact: true }).click();
  await page.getByRole("button", { name: "Salvar", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByText("Veículo salvo com sucesso.")).toBeVisible();
  await expect(page.getByRole("alert")).toBeVisible();
  expect(vehicles.writes).toHaveLength(1);
});
test("lista vazia de clientes orienta cadastro e não oferece mocks", async ({ page }) => {
  await mockAuth(page, true);
  const owners = await mockClientes(page);
  await mockVeiculos(page);
  owners.rows = [];
  await page.goto("/");
  await page.getByRole("button", { name: "Veículos", exact: true }).click();
  await expect(
    page.getByText("Cadastre um cliente em Clientes antes de cadastrar veículos."),
  ).toBeVisible();
  await page.getByRole("button", { name: "Novo veículo", exact: true }).click();
  await expect(page.getByLabel("Proprietário *", { exact: true }).locator("option")).toHaveCount(1);
});
