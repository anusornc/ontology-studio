import { expect, test } from "@playwright/test";
import {
  addClass,
  clearOntologies,
  connectNodes,
  createOntologyFromEmptyState,
  gotoApp,
  uniqueName,
  waitForSaved
} from "./helpers";

test.describe("Ontology Designer", () => {
  test.beforeEach(async ({ request }) => {
    await clearOntologies(request);
  });

  test("cold start: creates an ontology, adds classes and inspects them", async ({ page }) => {
    await gotoApp(page);
    await expect(page.getByTestId("empty-state")).toBeVisible();
    await expect(page.getByTestId("canvas")).toHaveCount(0);

    const name = uniqueName("University");
    await createOntologyFromEmptyState(page, name);

    await expect(page.getByTestId("topbar")).toBeVisible();
    await expect(page.getByTestId("status-classes")).toContainText("0");
    await expect(page.getByTestId("empty-canvas-hint")).toBeVisible();

    const personId = await addClass(page, "Person");
    await expect(page.getByTestId(`node-${personId}`)).toContainText("Person");
    await expect(page.getByTestId("status-classes")).toContainText("1");
    await expect(page.getByTestId("class-tree").getByTestId(`tree-node-${personId}`)).toBeVisible();

    await page.getByTestId("btn-add-attribute").click();
    const attributeRow = page.locator('[data-testid^="attr-row-"]').first();
    await attributeRow.waitFor();
    await attributeRow.locator("input").first().fill("fullName");
    await waitForSaved(page);

    // Inspector shows the class form for the selected class (label is an input value).
    await expect(page.getByTestId("field-class-label")).toHaveValue("Person");
    await expect(page.getByTestId("field-class-description")).toBeVisible();
  });

  test("creates a relation by dragging between node handles", async ({ page }) => {
    await gotoApp(page);
    await createOntologyFromEmptyState(page, uniqueName("Relations"));

    const personId = await addClass(page, "Person");
    const courseId = await addClass(page, "Course");
    await connectNodes(page, personId, courseId);

    await expect(page.getByTestId("status-relations")).toContainText("1");
    await expect(page.getByTestId("canvas")).toContainText("relates to");
    await expect(page.getByTestId("sidebar-tab-relations")).toBeVisible();
    await page.getByTestId("sidebar-tab-relations").click();
    await expect(page.locator('[data-testid^="relation-item-"]')).toHaveCount(1);
    await waitForSaved(page);
  });

  test("validates an ontology and reports duplicate class names", async ({ page }) => {
    await gotoApp(page);
    await createOntologyFromEmptyState(page, uniqueName("Validation"));

    const firstId = await addClass(page, "Person");
    const secondId = await addClass(page, "Course");

    await page.getByTestId(`node-${firstId}`).click();
    await page.getByTestId("field-class-name").fill("Person");
    await page.getByTestId(`node-${secondId}`).click();
    await page.getByTestId("field-class-name").fill("Person");

    await page.getByTestId("btn-validate").click();
    await expect(page.getByTestId("issues-panel")).toBeVisible();
    await expect(page.getByTestId("issue-0")).toContainText(/duplicate/i);
    await expect(page.getByTestId("issue-0")).toContainText("Person");
    await expect(page.getByTestId("status-errors")).toContainText("1");

    // Clicking the issue selects the offending class.
    await page.getByTestId("issue-0").click();
    await expect(page.getByTestId("field-class-name")).toBeVisible();
  });

  test("persists classes and positions across a page reload", async ({ page, request }) => {
    await gotoApp(page);
    const ontologyName = uniqueName("Persisted");
    await createOntologyFromEmptyState(page, ontologyName);
    await addClass(page, "PersistentEntity");
    await waitForSaved(page);

    const summaries = await (await request.get("/api/ontologies")).json();
    expect(summaries.ontologies).toHaveLength(1);
    expect(summaries.ontologies[0].name).toBe(ontologyName);
    expect(summaries.ontologies[0].classCount).toBe(1);

    await page.reload();
    await page.getByTestId("topbar").waitFor();
    await expect(page.locator('[data-testid^="node-"]')).toHaveCount(1);
    await expect(page.locator('[data-testid^="node-"]').first()).toContainText("PersistentEntity");
    await expect(page.getByTestId("ontology-select")).toContainText(ontologyName);
  });

  test("exports Turtle and JSON-LD downloads from the menu", async ({ page, request }) => {
    await gotoApp(page);
    await createOntologyFromEmptyState(page, uniqueName("Export"));
    const bookId = await addClass(page, "Book");
    await page.getByTestId(`node-${bookId}`).click();
    await page.getByTestId("field-class-name").fill("Book");
    await waitForSaved(page);

    await page.getByTestId("btn-export").click();
    await expect(page.getByTestId("export-menu")).toBeVisible();

    const turtleDownload = page.waitForEvent("download");
    await page.getByTestId("export-turtle").click();
    const turtle = await turtleDownload;
    expect(turtle.suggestedFilename()).toMatch(/\.ttl$/);

    const summaries = await (await request.get("/api/ontologies")).json();
    const id = summaries.ontologies[0].id as string;
    const turtleResponse = await request.get(`/api/ontologies/${id}/export?format=turtle`);
    expect(turtleResponse.ok()).toBeTruthy();
    expect(turtleResponse.headers()["content-type"]).toContain("text/turtle");
    const turtleBody = await turtleResponse.text();
    expect(turtleBody).toContain("owl:Class");
    expect(turtleBody).toContain(":Book");

    const jsonLdResponse = await request.get(`/api/ontologies/${id}/export?format=jsonld`);
    expect(jsonLdResponse.ok()).toBeTruthy();
    expect(jsonLdResponse.headers()["content-type"]).toContain("application/ld+json");
    const jsonLd = (await jsonLdResponse.json()) as { "@graph": Array<{ "@type": string }> };
    expect(jsonLd["@graph"].some((node) => node["@type"] === "owl:Class")).toBeTruthy();
  });

  test("loads the sample ontology and validates it without errors", async ({ page }) => {
    await gotoApp(page);
    await expect(page.getByTestId("empty-state")).toBeVisible();
    await page.getByTestId("btn-load-sample").click();
    await page.getByTestId("canvas").waitFor();

    const nodes = page.locator('[data-testid^="node-"]');
    await expect(nodes).not.toHaveCount(0);
    await expect(page.getByTestId("status-classes")).toContainText(/[1-9]/);
    await waitForSaved(page);

    await page.getByTestId("btn-validate").click();
    await expect(page.getByTestId("issues-panel")).toBeVisible();
    await expect(page.getByTestId("status-errors")).toContainText("0");
  });

  test("switches between ontologies using the picker and the new dialog", async ({ page }) => {
    await gotoApp(page);
    const firstName = uniqueName("Ontology A");
    const secondName = uniqueName("Ontology B");
    await createOntologyFromEmptyState(page, firstName);
    await addClass(page, "AlphaThing");
    await waitForSaved(page);

    await page.getByTestId("btn-new-ontology").click();
    await expect(page.getByTestId("new-ontology-dialog")).toBeVisible();
    await page.getByTestId("input-ontology-name").fill(secondName);
    await page.getByTestId("btn-create-ontology").click();
    await expect(page.getByTestId("new-ontology-dialog")).toBeHidden();
    await addClass(page, "BetaThing");
    await waitForSaved(page);

    await page.getByTestId("ontology-select").selectOption({ label: firstName });
    await expect(page.locator('[data-testid^="node-"]').filter({ hasText: "AlphaThing" })).toBeVisible();
    await expect(page.locator('[data-testid^="node-"]').filter({ hasText: "BetaThing" })).toHaveCount(0);

    await page.getByTestId("ontology-select").selectOption({ label: secondName });
    await expect(page.locator('[data-testid^="node-"]').filter({ hasText: "BetaThing" })).toBeVisible();
  });
});
