import { beforeEach, describe, expect, it } from 'vitest';
import { seedDatabase } from '../../../prisma/seed';
import { getPrisma } from '../data/prisma-client';
import { apiFetch } from '../testing/integration-harness';
import { apiRouter } from './index';

// Deterministic seed IDs (prisma/seed.ts): usr-002 admins ev-001 (g-*/ph-* rows),
// usr-007 admins ev-002 — every ev-001 row is out of that caller's scope.
const ADMIN_EV1 = 'usr-002';
const ADMIN_EV2 = 'usr-007';

function request(
  method: string,
  path: string,
  userId: string | undefined,
  body?: unknown,
): Promise<Response> {
  const headers: Record<string, string> = {};
  if (userId !== undefined) headers['x-user-id'] = userId;
  if (body !== undefined) headers['content-type'] = 'application/json';
  return apiFetch(path, {
    method,
    headers,
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

// Structural check for BR-13 (spec req 11, scenario 3): an admin delete can only
// happen through a registered DELETE route. PR-3 may add the provider-only
// `DELETE /api/events/:id` (BR-12); until then NO delete route may exist at all,
// and no admin may ever reach one.
function registeredDeleteRoutes(): string[] {
  type RouteLayer = { route?: { path: string; methods: Record<string, boolean> } };
  const layers = (apiRouter as unknown as { stack: RouteLayer[] }).stack;
  return layers
    .filter((layer) => layer.route?.methods['delete'] === true)
    .map((layer) => String(layer.route?.path));
}

describe('admin soft toggles and no-delete (spec req 12 / req 11 scenario 3 / BR-13)', () => {
  beforeEach(async () => {
    await seedDatabase(getPrisma());
  });

  it('deactivates a guest of the own event and the record persists with active false', async () => {
    const res = await request('PATCH', '/api/guests/g-001', ADMIN_EV1, { active: false });

    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ id: 'g-001', active: false });

    // The record still EXISTS (a toggle is never a delete) and reads back through
    // the guest list with active false (req 12, scenario 1).
    expect(await getPrisma().guest.count()).toBe(14);
    const list = await request('GET', '/api/events/ev-001/guests', ADMIN_EV1);
    const guests = (await list.json()) as { id: string; active: boolean }[];
    expect(guests).toContainEqual(expect.objectContaining({ id: 'g-001', active: false }));
  });

  it('toggling back restores the previous state with every other field unchanged', async () => {
    const before = await getPrisma().guest.findUniqueOrThrow({ where: { id: 'g-001' } });

    const off = await request('PATCH', '/api/guests/g-001', ADMIN_EV1, { active: false });
    expect(off.status).toBe(200);
    const offRow = await getPrisma().guest.findUniqueOrThrow({ where: { id: 'g-001' } });
    expect(offRow).toEqual({ ...before, active: false }); // full-row equality

    const on = await request('PATCH', '/api/guests/g-001', ADMIN_EV1, { active: true });
    expect(on.status).toBe(200);
    // Reversible: back to the PREVIOUS state with every other field byte-identical
    // (req 12, scenario 2) — the patch must never drop or alter untouched fields.
    expect(await getPrisma().guest.findUniqueOrThrow({ where: { id: 'g-001' } })).toEqual(before);
  });

  it('toggling one photo row leaves its sibling rows unchanged', async () => {
    const siblings = await getPrisma().photo.findMany({
      where: { eventId: 'ev-001', id: { not: 'ph-001' } },
      orderBy: { id: 'asc' },
    });

    const res = await request('PATCH', '/api/photos/ph-001', ADMIN_EV1, { active: false });
    expect(res.status).toBe(200);

    const row = await getPrisma().photo.findUniqueOrThrow({ where: { id: 'ph-001' } });
    expect(row.active).toBe(false);
    expect(
      await getPrisma().photo.findMany({
        where: { eventId: 'ev-001', id: { not: 'ph-001' } },
        orderBy: { id: 'asc' },
      }),
    ).toEqual(siblings); // exactly one row toggled (req 12, scenario 3)
  });

  // PR-2b contract completion: `dl` (downloaded) is now part of the PATCH surface
  // so the admin UI's download toggle persists instead of staying in-memory.
  it('toggles the photo download flag (dl) and persists it', async () => {
    const before = (await getPrisma().photo.findUniqueOrThrow({ where: { id: 'ph-001' } }))
      .downloaded;

    const res = await request('PATCH', '/api/photos/ph-001', ADMIN_EV1, { dl: !before });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ id: 'ph-001', dl: !before });

    expect(
      (await getPrisma().photo.findUniqueOrThrow({ where: { id: 'ph-001' } })).downloaded,
    ).toBe(!before);

    // Reversible: patching back restores the previous flag.
    const back = await request('PATCH', '/api/photos/ph-001', ADMIN_EV1, { dl: before });
    expect(back.status).toBe(200);
    expect(
      (await getPrisma().photo.findUniqueOrThrow({ where: { id: 'ph-001' } })).downloaded,
    ).toBe(before);
  });

  it('rejects a cross-event toggle with the row unchanged', async () => {
    const guestBefore = await getPrisma().guest.findUniqueOrThrow({ where: { id: 'g-001' } });
    const photoBefore = await getPrisma().photo.findUniqueOrThrow({ where: { id: 'ph-001' } });

    const guest = await request('PATCH', '/api/guests/g-001', ADMIN_EV2, { active: false });
    const photo = await request('PATCH', '/api/photos/ph-001', ADMIN_EV2, { active: false });

    expect(guest.status).toBe(403);
    expect(await guest.json()).toEqual({ statusCode: 403, message: 'Forbidden' });
    expect(photo.status).toBe(403);
    expect(await getPrisma().guest.findUniqueOrThrow({ where: { id: 'g-001' } })).toEqual(
      guestBefore,
    );
    expect(await getPrisma().photo.findUniqueOrThrow({ where: { id: 'ph-001' } })).toEqual(
      photoBefore,
    );
  });

  it('rejects any admin delete attempt with all records intact (req 11, scenario 3)', async () => {
    const paths = [
      '/api/events/ev-001',
      '/api/events/ev-001/guests',
      '/api/guests/g-001',
      '/api/photos/ph-001',
    ];

    for (const path of paths) {
      const res = await request('DELETE', path, ADMIN_EV1);
      expect(res.status).toBe(404); // no admin-reachable DELETE route exists
    }

    expect(await getPrisma().event.count()).toBe(3);
    expect(await getPrisma().guest.count()).toBe(14);
    expect(await getPrisma().photo.count()).toBe(14);
    expect(registeredDeleteRoutes()).toEqual([]); // BR-13: none registered, for anyone
  });
});
