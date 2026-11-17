import { expect, test } from "@playwright/test";
import { clearOntologies, gotoApp, waitForSaved } from "./helpers";

/**
 * Visual regression / documentation captures. Not pixel-compared: these produce
 * the screenshots linked from the README and the final delivery.
 */
test.describe("Visual captures", () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test.beforeEach(async ({ request }) => {
    await clearOntologies(request);
  });

  test("captures the empty state", async ({ page }) => {
    await gotoApp(page);
    await expect(page.getByTestId("empty-state")).toBeVisible();
    await page.screenshot({ path: "docs/screenshots/empty-state.png", fullPage: true });
  });

  test("captures the sample ontology studio and validation panel", async ({ page }) => {
    await gotoApp(page);
    await page.getByTestId("btn-load-sample").click();
    await expect(page.getByTestId("canvas")).toBeVisible();
    await page.locator('[data-testid^="node-"]').first().waitFor();
    await waitForSaved(page);

    // Select a class so the inspector shows a fully populated form.
    await page.locator('[data-testid^="node-"]').first().click();
    await page.waitForTimeout(300);
    await page.screenshot({ path: "docs/screenshots/studio.png", fullPage: true });

    await page.getByTestId("btn-validate").click();
    await expect(page.getByTestId("issues-panel")).toBeVisible();
    await page.waitForTimeout(300);
    await page.screenshot({ path: "docs/screenshots/validation.png", fullPage: true });
  });
});
