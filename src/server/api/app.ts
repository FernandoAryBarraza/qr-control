import express, { type Express } from 'express';
import { apiRouter } from './index';

// Composable API app (1a.12 remediation, approved decision: option a — standalone
// Node process outside Angular's bundler). This is the ONE composition of the REST
// API, shared by:
//   - src/server/api/main.ts (dev + prod standalone process, `npm run api:start`)
//   - src/server/testing/integration-harness.ts (per-test temp SQLite)
// It must never be imported from Angular's SSR entry (src/server.ts) — the Angular
// esbuild pipeline converts better-sqlite3's CJS bindings loader to ESM and throws
// `ReferenceError: __filename is not defined` per request.
export function createApiApp(): Express {
  const app = express();
  app.use('/api', apiRouter);
  return app;
}
