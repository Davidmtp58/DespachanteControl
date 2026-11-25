import type { Page } from "@playwright/test";
export async function selectReference(page: Page, label: string, id: string) {
  await page.getByRole("combobox", { name: label, exact: true }).click();
  await page
    .getByRole("listbox", { name: label, exact: true })
    .locator(`[role="option"][data-value="${id}"]`)
    .click();
}
