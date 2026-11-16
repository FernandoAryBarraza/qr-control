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
  // No .env file — fall through to the defaults below.
}

// Bind loopback-only by default: future authz trusts an `x-user-id` header, so the
// API must not be reachable from LAN hosts (setting API_HOST to a routable address
// opts out of that guarantee consciously).
const host = process.env['API_HOST'] ?? '127.0.0.1';

// Reject anything that is not an integer port in 1..65535 — previously API_PORT=''
// silently became 0 (random port) and garbage became a NaN RangeError at listen().
// The default must stay in sync with the dev proxy target (proxy.conf.json).
const rawPort = process.env['API_PORT'] ?? '3000';
const port = Number(rawPort);
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error(
    `Invalid API_PORT "${rawPort}": expected an integer between 1 and 65535 ` +
      '(default 3000, keep proxy.conf.json target in sync).',
  );
}

createApiApp().listen(port, host, (error: unknown) => {
  if (error) {
    throw error;
  }

  console.log(`Standalone API listening on http://${host}:${port}`);
});
