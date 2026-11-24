// Personal notes and journal (#46): a daily entry and a unit note are kept across a reload, and can be removed.
import { expect, test, type Page } from "@playwright/test";
import { mockOllama } from "./mockAi";

test.beforeEach(async ({ page }) => { await mockOllama(page); });

/** First run: create a profile learning Spanish, then save the (mocked) local Ollama model. */
async function onboard(page: Page) {
  await page.goto("/");
  await page.getByLabel("Name").fill("Ada");
  await page.getByLabel("First course").selectOption("es");
  await page.getByRole("button", { name: "Create profile" }).click();
  const sheet = page.getByRole("dialog");
  await sheet.getByRole("radio", { name: /Ollama/ }).click();
  await sheet.getByRole("button", { name: "Save", exact: true }).click();
  await sheet.getByRole("button", { name: "Cancel" }).click();
}

const JOURNAL = "Hoy he estudiado español con mi amiga.";
const NOTE = "Usar «hola» al llegar.";

test("a journal entry and a unit note survive a reload and can be deleted", async ({ page }) => {
  await onboard(page);
  await page.getByRole("button", { name: "Notes", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Notes & journal" })).toBeVisible();

  await page.getByLabel("Today's journal entry").fill(JOURNAL);
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByRole("status")).toHaveText("Saved");

  await page.getByRole("tab", { name: "Unit notes" }).click();
  await page.getByRole("button", { name: /Greetings & Introductions/ }).click();
  const sheet = page.getByRole("dialog");
  await sheet.getByLabel("Note on Greetings & Introductions").fill(NOTE);
  await sheet.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByRole("button", { name: /Greetings & Introductions/ })).toContainText(NOTE);

  await page.reload();
  await page.getByRole("button", { name: "Notes", exact: true }).click();
  await expect(page.getByLabel("Today's journal entry")).toHaveValue(JOURNAL);
  await page.getByRole("tab", { name: "Unit notes" }).click();
  await expect(page.getByRole("button", { name: /Greetings & Introductions/ })).toContainText(NOTE);

  await page.getByRole("button", { name: /Greetings & Introductions/ }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Delete", exact: true }).click();
  await expect(page.getByRole("button", { name: /Greetings & Introductions/ })).toContainText("No note yet");
});
