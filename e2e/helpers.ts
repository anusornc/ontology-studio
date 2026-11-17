import type { APIRequestContext, Page } from "@playwright/test";

/** The web app is served at Playwright's baseURL and proxies /api to the server. */
export async function listOntologies(request: APIRequestContext): Promise<Array<{ id: string; name: string }>> {
  const response = await request.get("/api/ontologies");
  if (!response.ok()) {
    throw new Error(`GET /api/ontologies failed: ${response.status()} ${await response.text()}`);
  }
  const body = (await response.json()) as { ontologies: Array<{ id: string; name: string }> };
  return body.ontologies;
}

/** Remove every stored ontology so each test starts from the cold-start state. */
export async function clearOntologies(request: APIRequestContext): Promise<void> {
  for (const ontology of await listOntologies(request)) {
    const response = await request.delete(`/api/ontologies/${ontology.id}`);
    if (!response.ok() && response.status() !== 404) {
      throw new Error(`DELETE /api/ontologies/${ontology.id} failed: ${response.status()}`);
    }
  }
}

let sequence = 0;

/** Unique, human-readable ontology names so parallel/rerun tests never collide. */
export function uniqueName(prefix: string): string {
  sequence += 1;
  return `${prefix} ${Date.now().toString(36)}-${sequence}`;
}

export async function waitForSaved(page: Page): Promise<void> {
  await page.getByTestId("save-status").filter({ hasText: "Saved" }).waitFor({ timeout: 15_000 });
  // "Unsaved changes" also contains "saved"; make sure we are on the settled label.
  await page.waitForFunction(() => {
    const el = document.querySelector('[data-testid="save-status"]');
    return el?.textContent?.trim() === "Saved";
  });
}

export async function gotoApp(page: Page): Promise<void> {
  await page.goto("/");
  await page.getByTestId("topbar").waitFor();
}

export async function createOntologyFromEmptyState(page: Page, name: string): Promise<void> {
  await page.getByTestId("empty-state").waitFor();
  await page.getByTestId("input-ontology-name").fill(name);
  await page.getByTestId("btn-create-ontology").click();
  await page.getByTestId("empty-state").waitFor({ state: "detached" });
  await page.getByTestId("canvas").waitFor();
}

export async function addClass(page: Page, label: string): Promise<string> {
  await page.getByTestId("btn-add-class").click();
  await page.getByTestId("field-class-label").waitFor();
  await page.getByTestId("field-class-label").fill(label);
  const node = page.locator(`[data-testid^="node-"]`).filter({ hasText: label }).first();
  await node.waitFor();
  const testId = await node.getAttribute("data-testid");
  return testId!.replace("node-", "");
}

export async function connectNodes(page: Page, sourceNodeId: string, targetNodeId: string): Promise<void> {
  const sourceHandle = page.locator(
    `[data-testid="node-${sourceNodeId}"] .react-flow__handle.source`
  );
  const targetHandle = page.locator(
    `[data-testid="node-${targetNodeId}"] .react-flow__handle.target`
  );
  await sourceHandle.waitFor();
  await targetHandle.waitFor();
  const source = await sourceHandle.boundingBox();
  const target = await targetHandle.boundingBox();
  if (!source || !target) {
    throw new Error("Could not measure React Flow handles");
  }
  await page.mouse.move(source.x + source.width / 2, source.y + source.height / 2);
  await page.mouse.down();
  await page.mouse.move(target.x + target.width / 2, target.y + target.height / 2, { steps: 12 });
  await page.mouse.up();
}
