import { beforeEach, describe, expect, it } from 'vitest';
import { seedDatabase } from '../../../prisma/seed';
import { getPrisma } from '../data/prisma-client';
import { apiFetch } from '../testing/integration-harness';

// Deterministic seed IDs (prisma/seed.ts): ev-002's admin is not assigned to ev-001.
const PROVIDER = 'usr-001';
const ADMIN_EV1 = 'usr-002';
const SECURITY_EV1 = 'usr-003';
const ADMIN_EV2 = 'usr-007';

function get(path: string, userId?: string): Promise<Response> {
  return apiFetch(path, { headers: userId === undefined ? {} : { 'x-user-id': userId } });
}

describe('GET /api/events/:id/guests', () => {
  beforeEach(async () => {
    await seedDatabase(getPrisma());
  });

  it('maps guests with companions as the domain party', async () => {
    const guests = (await (await get('/api/events/ev-001/guests', PROVIDER)).json()) as unknown[];

    expect(guests).toHaveLength(14);
    expect(guests[0]).toMatchObject({
      id: 'g-001',
      name: 'Lucía Ferreyra',
      status: 'confirmed',
      party: [
        { name: 'Martín Ferreyra', rel: 'Pareja' },
        { name: 'Elena Duarte', rel: 'Madre' },
      ],
    });
  });

  it('scopes reads to the requested event only', async () => {
    const own = (await (await get('/api/events/ev-001/guests', ADMIN_EV1)).json()) as unknown[];
    expect(own).toHaveLength(14);
    // ev-002 has no seeded guests: its admin sees its own (empty) list, not ev-001 data.
    const other = (await (await get('/api/events/ev-002/guests', ADMIN_EV2)).json()) as unknown[];
    expect(other).toEqual([]);
  });

  it('rejects cross-event and security reads with no guest data', async () => {
    const cross = await get('/api/events/ev-002/guests', ADMIN_EV1);
    expect(cross.status).toBe(403);
    // Strict equality: the payload is exactly the error, so no guest data can leak.
    expect(await cross.json()).toEqual({ statusCode: 403, message: 'Forbidden' });

    expect((await get('/api/events/ev-001/guests', SECURITY_EV1)).status).toBe(403);
  });
});
