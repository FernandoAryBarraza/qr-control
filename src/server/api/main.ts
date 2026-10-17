// Standalone API entry point — the API runs as its OWN Node process, never inside
// Angular's SSR bundle (approved deviation from design §2/§5 hosting, option a).
//
// Start (dev and prod): `npm run api:start` (= `tsx src/server/api/main.ts`, run from
// the repo root so relative DATABASE_URL paths resolve — design §12).
// Dev: `ng serve` proxies `/api/*` to this process via proxy.conf.json (angular.json
// `serve.options.proxyConfig`). Prod: start this process alongside `server.mjs` and
// route `/api/*` to it at the deployment layer (reverse proxy); server.mjs serves
// only the Angular app.
import { createApiApp } from './app';

// Load .env at process start so API_PORT is visible before the lazy runtime config
// in data/config.ts runs (Node >= 20.12 built-in; no dotenv dependency, config.ts).
try {
  process.loadEnvFile();
} catch {
  // No .env file — fall through to the default port below.
}

const port = Number(process.env['API_PORT'] ?? 3000);

createApiApp().listen(port, (error: unknown) => {
  if (error) {
    throw error;
  }

  console.log(`Standalone API listening on http://localhost:${port}`);
});
