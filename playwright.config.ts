import { defineConfig } from '@playwright/test';

// `firebase emulators:exec` (npm run test:cloud) sets this; only then is the
// cloud build served and the cloud tests runnable.
const emulators = Boolean(process.env.FIRESTORE_EMULATOR_HOST);

export default defineConfig({
  testDir: 'e2e',
  timeout: 30_000,
  use: {
    viewport: { width: 1400, height: 900 },
  },
  projects: [
    {
      name: 'app',
      testIgnore: /cloud\.spec\.ts/,
      use: { baseURL: 'http://localhost:5199' },
    },
    {
      name: 'cloud',
      testMatch: /cloud\.spec\.ts/,
      timeout: 60_000,
      use: { baseURL: 'http://localhost:5198' },
    },
  ],
  webServer: [
    {
      command: 'npx vite --port 5199 --strictPort',
      url: 'http://localhost:5199',
      reuseExistingServer: true,
      timeout: 60_000,
    },
    ...(emulators
      ? [
          {
            command: 'npx vite --mode emulator --port 5198 --strictPort',
            url: 'http://localhost:5198',
            reuseExistingServer: true,
            timeout: 60_000,
          },
        ]
      : []),
  ],
});
