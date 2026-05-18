import { defineConfig, devices } from "@playwright/test";

const isDatabaseMode = process.env.E2E_BACKEND !== "local";
const e2ePort = process.env.E2E_PORT ?? "3108";
const baseURL = `http://localhost:${e2ePort}`;
const devServerCommand = `npm run dev -- -p ${e2ePort}`;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  reporter: [["list"], ["html", { open: "never" }]],
  timeout: 30_000,
  workers: 1,
  expect: {
    timeout: 10_000,
  },
  use: {
    baseURL,
    trace: "on-first-retry",
  },
  webServer: {
    command: devServerCommand,
    url: baseURL,
    reuseExistingServer: !process.env.CI && !isDatabaseMode,
    timeout: 120_000,
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
