import { describe, expect, it } from 'vitest';
import { apiFetch } from '../testing/integration-harness';

// Non-BR smoke route (design §5) — proves the integration harness, the standalone
// API composition (src/server/api/app.ts), and the Prisma→SQLite chain end to end.
describe('GET /api/health', () => {
  it('returns 200 with the active database provider marker', async () => {
    const res = await apiFetch('/api/health');

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ status: 'ok', provider: 'sqlite' });
  });
});
