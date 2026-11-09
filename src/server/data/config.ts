// Node-only runtime configuration (design §9 step 4).
// The Prisma 7 CLI loads env via prisma7.config.ts; at server runtime this module
// is the single loader/validator. Node >= 20.12 ships `process.loadEnvFile`, so no
// `dotenv` dependency is needed.

function loadLocalEnv(): void {
  // Integration tests point DATABASE_URL at a per-file temp DB — never override it.
  if (process.env['DATABASE_URL']) return;
  try {
    process.loadEnvFile();
  } catch {
    // No .env file — fall through to the validation error below.
  }
}

export function getDatabaseUrl(): string {
  loadLocalEnv();
  const url = process.env['DATABASE_URL'];
  if (!url) {
    throw new Error(
      'DATABASE_URL is not set. Copy .env.example to .env before running the server.',
    );
  }
  return url;
}

// Mirrors `datasource.provider` in prisma/schema.prisma — exposed as the /api/health
// provider marker. PR-4's `npm run db:verify` guards drift between this constant and
// the schema, and the seed (PR-1b) stamps the same provider into SystemSetting (BR-18).
export const DATA_PROVIDER = 'sqlite';

// Design §6: QR payloads embed the absolute verify URL, so the base URL is runtime
// configuration. The default matches `.env.example` and keeps the integration
// harness hermetic (it only overrides DATABASE_URL).
const DEFAULT_WEB_BASE_URL = 'http://localhost:4200';

export function getWebBaseUrl(): string {
  loadLocalEnv();
  const url = process.env['WEB_BASE_URL'];
  return url === undefined || url === '' ? DEFAULT_WEB_BASE_URL : url;
}
