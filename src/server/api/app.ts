import express, { type Express, type NextFunction, type Request, type Response } from 'express';
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
  app.disable('x-powered-by');
  app.use('/api', apiRouter);

  // Terminal error handler (registered after all routes): log details server-side
  // and respond with a generic JSON 500 — stack traces and absolute filesystem
  // paths must never reach clients (NODE_ENV is not guaranteed to be set here).
  // Express 5 forwards rejected promises from async handlers to this middleware.
  app.use((error: unknown, _req: Request, res: Response, next: NextFunction) => {
    console.error('[api] Unhandled error:', error);
    if (res.headersSent) {
      next(error);
      return;
    }
    // Client-originated errors (explicit status 4xx) carry an intentional,
    // client-facing message; everything else stays a generic 500 (review W3).
    const err = error as { status?: unknown; statusCode?: unknown; message?: unknown };
    const raw = typeof err?.status === 'number' ? err.status : err?.statusCode;
    const status = typeof raw === 'number' && raw >= 400 && raw <= 499 ? raw : 500;
    const message =
      status === 500 || typeof err?.message !== 'string' ? 'Internal Server Error' : err.message;
    res.status(status).json({ statusCode: status, message });
  });

  return app;
}
