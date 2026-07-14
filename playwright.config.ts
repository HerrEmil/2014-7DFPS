import { defineConfig, devices } from "@playwright/test";

// The game is a static site with index.html at the repo root, so the webServer
// just serves the repo root. Headless Chromium provides WebGL via SwiftShader,
// which is enough for THREE.WebGLRenderer to construct and for init()/animate()
// to run; pointer lock is ungrantable headless (that is the state the input
// gating regression test deliberately exercises).
const PORT = 4507;

export default defineConfig({
  testDir: "./tests/playtest",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: "list",
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "on-first-retry",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: `python3 -m http.server ${PORT}`,
    url: `http://localhost:${PORT}/index.html`,
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
  },
});
