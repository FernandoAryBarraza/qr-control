import { beforeEach, describe, expect, it } from 'vitest';
import { seedDatabase } from '../../../prisma/seed';
import { getPrisma } from '../data/prisma-client';
import { apiFetch } from '../testing/integration-harness';

// PR-2b reload-persistence evidence (task 2b.3). This is the closest automated
// equivalent to "mutate a guest/photo in the dev app, reload → mutation persisted":
// it replays the EXACT write payloads `PaseStore` now sends through `DataApiService`
// (PATCH with the trusted admin header `usr-002`), then reads back through the same
// GETs the client's `load()` uses — proving the optimistic writes survive a reload.
//
// The client's mutation payloads (pase-store.ts + data-api.service.ts):
//   sendInvite      -> PATCH /api/guests/:id { status: 'sent' }
//   confirmGuest    -> PATCH /api/guests/:id { status: 'confirmed' }
//   setPhotoState   -> PATCH /api/photos/:id { state }
//   toggleDownload  -> PATCH /api/photos/:id { dl }
//   set*Active      -> PATCH .../:id { active }
const ADMIN = 'usr-002'; // seeded admin of ev-001 — the identity mutations write as

function clientPatch(path: string, body: unknown): Promise<Response> {
  return apiFetch(path, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json', 'x-user-id': ADMIN },
    body: JSON.stringify(body),
  });
}

describe('client mutations persist across a reload (PR-2b / 2b.3)', () => {
  beforeEach(async () => {
    await seedDatabase(getPrisma());
  });

  it('replays the store write payloads and reads them back through the load() GETs', async () => {
    // 1) Mutate exactly as the store does now (optimistic client, admin identity).
    expect((await clientPatch('/api/guests/g-003', { status: 'sent' })).status).toBe(200);
    expect((await clientPatch('/api/guests/g-002', { status: 'confirmed' })).status).toBe(200);
    expect((await clientPatch('/api/photos/ph-001', { state: 'rejected' })).status).toBe(200);
    // ph-001 seeds with `dl: true`, so toggling to `false` is a real write —
    // a `{dl: true}` replay would be a no-op and blind the proxy to a dropped
    // `dl` persist (review W1: the mutant survived a `true`-only replay).
    expect((await clientPatch('/api/photos/ph-001', { dl: false })).status).toBe(200);
    expect((await clientPatch('/api/guests/g-001', { active: false })).status).toBe(200);

    // 2) "Reload": a fresh read through the same endpoints load() calls.
    const guestsRes = await apiFetch('/api/events/ev-001/guests', {
      headers: { 'x-user-id': ADMIN },
    });
    const photosRes = await apiFetch('/api/events/ev-001/photos', {
      headers: { 'x-user-id': ADMIN },
    });
    const guests = (await guestsRes.json()) as { id: string; status: string; active?: boolean }[];
    const photos = (await photosRes.json()) as { id: string; state: string; dl: boolean }[];

    // 3) Every client mutation survived the reload.
    expect(guests.find((g) => g.id === 'g-003')?.status).toBe('sent'); // sendInvite
    expect(guests.find((g) => g.id === 'g-002')?.status).toBe('confirmed'); // confirmGuest
    expect(guests.find((g) => g.id === 'g-001')?.active).toBe(false); // setGuestActive
    expect(photos.find((p) => p.id === 'ph-001')?.state).toBe('rejected'); // setPhotoState
    expect(photos.find((p) => p.id === 'ph-001')?.dl).toBe(false); // toggleDownload
  });
});
