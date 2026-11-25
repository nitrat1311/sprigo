// Blank-window regression: a render throw must show the error screen, never a blank page.
import { expect, test } from "@playwright/test";
import { mockOllama } from "./mockAi";

test.beforeEach(async ({ page }) => { await mockOllama(page); });

test("a render error shows the error screen with Reload and the details instead of a blank window", async ({ page }) => {
  await page.goto("/?crash=1"); // the dev-only hook in src/ErrorBoundary.tsx
  const alert = page.getByRole("alert");
  await expect(alert.getByRole("heading", { name: "Something went wrong" })).toBeVisible();
  await expect(alert.getByRole("button", { name: "Reload" })).toBeVisible();
  await expect(alert.getByRole("button", { name: "Copy details" })).toBeVisible();
  await expect(page.locator("#root")).not.toBeEmpty(); // something is drawn, not the blank background

  await alert.locator("summary", { hasText: "Technical details" }).click();
  await expect(alert.locator("pre")).toContainText("Forced render error");
});

test("the error screen follows the UI language", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("sprigo.uiLang", "tr"));
  await page.goto("/?crash=1");
  const alert = page.getByRole("alert");
  await expect(alert.getByRole("heading", { name: "Bir şeyler ters gitti" })).toBeVisible();
  await expect(alert.getByRole("button", { name: "Yeniden yükle" })).toBeVisible();
});
