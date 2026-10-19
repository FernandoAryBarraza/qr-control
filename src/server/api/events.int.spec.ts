import { beforeEach, describe, expect, it } from 'vitest';
import { seedDatabase } from '../../../prisma/seed';
import { getPrisma } from '../data/prisma-client';
// Named import also registers the harness hooks (per-file temp SQLite + reset).
import { apiFetch } from '../testing/integration-harness';

// Deterministic seed IDs (prisma/seed.ts). ev-002's admin is not assigned to ev-001.
const PROVIDER = 'usr-001';
const ADMIN_EV1 = 'usr-002';
const SECURITY_EV1 = 'usr-003';

function get(path: string, userId?: string): Promise<Response> {
  return apiFetch(path, { headers: userId === undefined ? {} : { 'x-user-id': userId } });
}

describe('GET /api/events', () => {
  beforeEach(async () => {
    await seedDatabase(getPrisma());
  });

  it('lists every event for the provider with mapped domain fields', async () => {
    const events: unknown = await (await get('/api/events', PROVIDER)).json();

    // Chronological by `start` (event 3 May -> event 1 June -> event 2 July).
    expect(events).toMatchObject([
      { id: 'ev-003', status: 'done' },
      {
        id: 'ev-001',
        name: 'Gala Aniversario Valdemar',
        status: 'active',
        dateLabel: '14 JUN 2025 · 20:00',
        guests: 14,
        photos: 14,
        admin: { name: 'Mariana Solórzano' },
      },
      { id: 'ev-002', name: 'Boda Hernández · Riva' },
    ]);
  });

  it.each<[string, string | undefined, number, object]>([
    ['/api/events', ADMIN_EV1, 200, [{ id: 'ev-001' }]],
    ['/api/events', SECURITY_EV1, 200, [{ id: 'ev-001' }]],
    ['/api/events/ev-001', ADMIN_EV1, 200, { id: 'ev-001' }],
    ['/api/events/ev-002', PROVIDER, 200, { id: 'ev-002' }],
    ['/api/events/ev-404', PROVIDER, 404, { statusCode: 404, message: 'Not Found' }],
    ['/api/events/ev-002', ADMIN_EV1, 403, { statusCode: 403, message: 'Forbidden' }],
    ['/api/events', undefined, 401, { statusCode: 401, message: 'Unauthorized' }],
  ])('%s as %s responds %i', async (path, userId, status, body) => {
    const res = await get(path, userId);

    expect(res.status).toBe(status);
    expect(await res.json()).toMatchObject(body);
  });

  it('never discloses event B data to the admin of event A', async () => {
    const res = await get('/api/events/ev-002', ADMIN_EV1);

    expect(JSON.stringify(await res.json())).not.toContain('Boda Hernández');
  });
});
