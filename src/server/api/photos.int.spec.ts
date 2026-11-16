import { beforeEach, describe, expect, it } from 'vitest';
import { seedDatabase } from '../../../prisma/seed';
import { getPrisma } from '../data/prisma-client';
import { apiFetch } from '../testing/integration-harness';

// Deterministic seed IDs (prisma/seed.ts): ev-002's admin is not assigned to ev-001.
const PROVIDER = 'usr-001';
const ADMIN_EV1 = 'usr-002';
const ADMIN_EV2 = 'usr-007';

function get(path: string, userId?: string): Promise<Response> {
  return apiFetch(path, { headers: userId === undefined ? {} : { 'x-user-id': userId } });
}

describe('GET /api/events/:id/photos', () => {
  beforeEach(async () => {
    await seedDatabase(getPrisma());
  });

  it('maps stored photos back to the domain shape', async () => {
    const photos = (await (await get('/api/events/ev-001/photos', PROVIDER)).json()) as unknown[];

    expect(photos).toHaveLength(14);
    expect(photos[0]).toMatchObject({
      id: 'ph-001',
      author: 'Lucía Ferreyra',
      state: 'approved',
      dl: true,
      // sizeKb/1000 == the seed's decimal MB (1b handoff: divide by 1000, not 1024).
      size: 3.2,
      h: 460,
      time: '18:42',
      url: 'https://picsum.photos/seed/pase-gala-1/640/460.jpg',
    });
  });

  it('scopes reads to the requested event only', async () => {
    const own = (await (await get('/api/events/ev-001/photos', ADMIN_EV1)).json()) as unknown[];
    expect(own).toHaveLength(14);
    // ev-002 has no seeded photos: its admin sees its own (empty) list, not ev-001 data.
    const other = (await (await get('/api/events/ev-002/photos', ADMIN_EV2)).json()) as unknown[];
    expect(other).toEqual([]);
  });

  it('rejects cross-event reads with no photo data', async () => {
    const res = await get('/api/events/ev-002/photos', ADMIN_EV1);

    expect(res.status).toBe(403);
    // Strict equality: the payload is exactly the error, so no photo data can leak.
    expect(await res.json()).toEqual({ statusCode: 403, message: 'Forbidden' });
  });
});
