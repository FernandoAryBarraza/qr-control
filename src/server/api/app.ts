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
  // Write routes (BR-02/BR-04) take a JSON body; the parser is mounted once here so
  // every composition of the API (standalone process + integration harness) is equal.
  app.use(express.json());
  app.use('/api', apiRouter);

  // Terminal error handler (registered after all routes): respond with a generic
  // JSON payload — stack traces and absolute filesystem paths must never reach
  // clients (NODE_ENV is not guaranteed to be set here). Express 5 forwards
  // rejected promises from async handlers to this middleware.
  app.use((error: unknown, _req: Request, res: Response, next: NextFunction) => {
    // W6: log only status/type/message — NEVER the error object. A body-parser
    // failure carries the raw request body (`err.body`: guest email/phone/notes)
    // and a truncated body snippet inside its parse message.
    const err = error as {
      status?: unknown;
      statusCode?: unknown;
      message?: unknown;
      type?: unknown;
      name?: unknown;
    };
    const raw = typeof err?.status === 'number' ? err.status : err?.statusCode;
    const status = typeof raw === 'number' && raw >= 400 && raw <= 499 ? raw : 500;
    // Body-parser syntax errors carry parser details; keep every 400 generic.
    const message =
      status === 500
        ? 'Internal Server Error'
        : status === 400
          ? 'Bad Request'
          : typeof err?.message === 'string'
            ? err.message
            : 'Bad Request';
    // Client-originated 4xx log the same generic message as the response; the
    // 5xx diagnostic message is server-generated and carries no request body.
    const type =
      typeof err?.type === 'string'
        ? err.type
        : typeof err?.name === 'string'
          ? err.name
          : typeof error;
    const logMessage = status >= 400 && status <= 499 ? message : (err.message ?? type);
    console.error('[api] Unhandled error:', { status, type, message: logMessage });
    if (res.headersSent) {
      next(error);
      return;
    }
    res.status(status).json({ statusCode: status, message });
  });

  return app;
}
