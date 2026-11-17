import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: [["list"]],
  use: {
    baseURL: "http://127.0.0.1:5173",
    trace: "retain-on-failure",
    screenshot: "only-on-failure"
  },
  projects: [{ name: "chromium", use: { browserName: "chromium" } }],
  webServer: [
    {
      command: "pnpm --filter @onto/server dev",
      url: "http://127.0.0.1:5174/api/health",
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
      env: { ONTO_DATA_DIR: ".e2e-data", PORT: "5174" }
    },
    {
      command: "pnpm --filter @onto/web dev",
      url: "http://127.0.0.1:5173",
      reuseExistingServer: !process.env.CI,
      timeout: 120_000
    }
  ]
});
