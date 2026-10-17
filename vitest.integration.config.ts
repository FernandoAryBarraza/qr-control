import { defineConfig } from 'vitest/config';

// Node-env integration layer (design §8): DB-, API-, and authz-facing tests run
// against a per-test-FILE temp SQLite DB via src/server/testing/integration-harness.ts.
// Unit tests (jsdom) stay under `ng test --watch=false` and exclude src/server/**.
export default defineConfig({
  test: {
    include: ['src/server/**/*.int.spec.ts'],
    environment: 'node',
    pool: 'forks', // vitest isolates test files in separate workers
    testTimeout: 20_000,
  },
});
