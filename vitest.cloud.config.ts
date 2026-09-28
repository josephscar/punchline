import { defineConfig } from 'vitest/config';

// Integration tests against the Firebase emulators; run with `npm run test:cloud`.
export default defineConfig({
  test: {
    include: ['src/**/*.emulator.test.ts'],
    environment: 'node',
    testTimeout: 30_000,
    hookTimeout: 30_000,
    fileParallelism: false,
  },
});
