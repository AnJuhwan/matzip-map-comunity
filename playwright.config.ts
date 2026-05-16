import { defineConfig, devices } from "@playwright/test";

const isDatabaseMode = process.env.E2E_BACKEND === "supabase";
const e2ePort = process.env.E2E_PORT ?? (isDatabaseMode ? "3108" : "3107");
const baseURL = `http://localhost:${e2ePort}`;
const devServerCommand = isDatabaseMode
  ? `npm run dev -- -p ${e2ePort}`
  : `NEXT_PUBLIC_SUPABASE_URL= NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY= NEXT_PUBLIC_NAVER_MAP_CLIENT_ID= NAVER_MAP_CLIENT_ID= NAVER_MAP_CLIENT_SECRET= npm run dev -- -p ${e2ePort}`;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  reporter: [["list"], ["html", { open: "never" }]],
  timeout: 30_000,
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
