import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: ".",
  testMatch: "form.spec.ts",
  outputDir: "generated/test-results",
  workers: 1,
  reporter: "list",
  use: { baseURL: "http://127.0.0.1:4177", channel: process.env.CI ? undefined : "chrome", trace: "retain-on-failure", screenshot: "on" },
  projects: [
    { name: "desktop", use: { viewport: { width: 1100, height: 900 } } },
    { name: "mobile", use: { ...devices["iPhone 13"], defaultBrowserType: "chromium" } },
  ],
  webServer: {
    command: "node examples/react-hook-form/serve.mjs",
    cwd: new URL("../..", import.meta.url).pathname,
    url: "http://127.0.0.1:4177",
    reuseExistingServer: !process.env.CI,
  },
});
