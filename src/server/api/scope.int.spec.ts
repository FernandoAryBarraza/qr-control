import { beforeEach, describe, expect, it } from 'vitest';
import { seedDatabase } from '../../../prisma/seed';
import { getPrisma } from '../data/prisma-client';
import { apiFetch } from '../testing/integration-harness';

// Deterministic seed IDs (prisma/seed.ts): g-001 belongs to ev-001, whose admin is
// usr-002; usr-007 admins ev-002, so every g-* row is out of that caller's scope.
const PROVIDER = 'usr-001';
const ADMIN_EV1 = 'usr-002';
const ADMIN_EV2 = 'usr-007';
const SECURITY_EV1 = 'usr-003';

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

describe('object-level guest scope (spec req 3, scenarios 3-4)', () => {
  beforeEach(async () => {
    await seedDatabase(getPrisma());
  });

  it('updates a guest of the admin own event and merges partial patches', async () => {
    const res = await request('PATCH', '/api/guests/g-001', ADMIN_EV1, {
      status: 'sent',
      active: false,
    });

    expect(res.status).toBe(200);
    const updated = (await res.json()) as Record<string, unknown>;
    expect(updated).toMatchObject({ id: 'g-001', status: 'sent', active: false });

    // A second patch touches only the field it names: no reset of the first change.
    const toggled = await request('PATCH', '/api/guests/g-001', ADMIN_EV1, { active: true });
    expect(toggled.status).toBe(200);
    expect(await toggled.json()).toMatchObject({ id: 'g-001', status: 'sent', active: true });

    const row = await getPrisma().guest.findUniqueOrThrow({ where: { id: 'g-001' } });
    expect(row).toMatchObject({
      status: 'sent',
      active: true,
      name: 'Lucía Ferreyra',
      table: 3,
    });
  });

  it('rejects a cross-event guest write by exact ID without disclosing or changing it', async () => {
    const before = await getPrisma().guest.findUniqueOrThrow({ where: { id: 'g-001' } });

    const res = await request('PATCH', '/api/guests/g-001', ADMIN_EV2, {
      status: 'declined',
      active: false,
    });

    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ statusCode: 403, message: 'Forbidden' });
    expect(await getPrisma().guest.findUniqueOrThrow({ where: { id: 'g-001' } })).toEqual(before);
  });

  it('answers a nonexistent guest ID exactly like a foreign one', async () => {
    const foreign = await request('PATCH', '/api/guests/g-001', ADMIN_EV2, { status: 'declined' });
    const unknown = await request('PATCH', '/api/guests/g-999', ADMIN_EV2, { status: 'declined' });

    expect(unknown.status).toBe(foreign.status);
    expect(await unknown.json()).toEqual(await foreign.json());
    expect(await getPrisma().guest.count()).toBe(14);
  });

  it('creates guests only inside the assigned event and persists their party', async () => {
    const res = await request('POST', '/api/events/ev-001/guests', ADMIN_EV1, {
      name: 'Nueva Invitada',
      email: 'nueva@example.com',
      phone: '+52 646 000 00 00',
      table: 7,
      status: 'planned',
      party: [{ name: 'Acompañante Uno', rel: 'Amiga' }],
    });

    expect(res.status).toBe(201);
    const created = (await res.json()) as Record<string, unknown>;
    expect(created).toMatchObject({
      name: 'Nueva Invitada',
      status: 'planned',
      active: true,
      table: 7,
      party: [{ name: 'Acompañante Uno', rel: 'Amiga' }],
    });

    const row = await getPrisma().guest.findUniqueOrThrow({
      where: { id: String(created['id']) },
      include: { companions: true },
    });
    expect(row.eventId).toBe('ev-001');
    expect(row.companions.map((companion) => companion.name)).toEqual(['Acompañante Uno']);
    expect(await getPrisma().guest.count({ where: { eventId: 'ev-001' } })).toBe(15);
  });

  it('rejects guest creation for another event without creating a row', async () => {
    const res = await request('POST', '/api/events/ev-002/guests', ADMIN_EV1, {
      name: 'Intrusa',
      email: 'intrusa@example.com',
      phone: '+52 646 000 00 01',
    });

    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ statusCode: 403, message: 'Forbidden' });
    expect(await getPrisma().guest.count({ where: { eventId: 'ev-002' } })).toBe(0);
  });

  it.each([SECURITY_EV1, PROVIDER])('rejects guest writes from %s', async (userId) => {
    const patch = await request('PATCH', '/api/guests/g-001', userId, { status: 'declined' });
    const create = await request('POST', '/api/events/ev-001/guests', userId, {
      name: 'No Autorizada',
    });

    expect(patch.status).toBe(403);
    expect(create.status).toBe(403);
    expect(await getPrisma().guest.count({ where: { eventId: 'ev-001' } })).toBe(14);
  });

  it('rejects an invalid patch on an own guest without changing it', async () => {
    const before = await getPrisma().guest.findUniqueOrThrow({ where: { id: 'g-001' } });

    const res = await request('PATCH', '/api/guests/g-001', ADMIN_EV1, {
      status: 'not-a-status',
    });

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ statusCode: 400, message: 'Bad Request' });
    expect(await getPrisma().guest.findUniqueOrThrow({ where: { id: 'g-001' } })).toEqual(before);
  });

  // W2: `table` is persisted on an int4 column — reject int-unsafe values at the
  // app layer instead of trusting SQLite's (unbounded) INTEGER affinity.
  it.each([2147483648, 999999999999, 1000])(
    'rejects an int-unsafe table value (%s) without creating a row',
    async (table) => {
      const before = await getPrisma().guest.count({ where: { eventId: 'ev-001' } });

      const res = await request('POST', '/api/events/ev-001/guests', ADMIN_EV1, {
        name: 'Mesa Grande',
        table,
      });

      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ statusCode: 400, message: 'Bad Request' });
      expect(await getPrisma().guest.count({ where: { eventId: 'ev-001' } })).toBe(before);
    },
  );

  // S7: optional text fields are trimmed; whitespace-only values become ''.
  it('trims optional text and turns whitespace-only values into empty strings', async () => {
    const res = await request('POST', '/api/events/ev-001/guests', ADMIN_EV1, {
      name: '  Recortada  ',
      email: '  recortada@example.com  ',
      phone: '   ',
      note: '\t \n',
    });

    expect(res.status).toBe(201);
    const created = (await res.json()) as Record<string, unknown>;
    expect(created).toMatchObject({
      name: 'Recortada',
      email: 'recortada@example.com',
      phone: '',
      note: '',
    });
  });

  // W1: malformed JSON never reaches a route — same generic 400 as the events route.
  it('answers a malformed JSON body with a generic 400', async () => {
    const res = await apiFetch('/api/events/ev-001/guests', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-user-id': ADMIN_EV1 },
      body: '{"name": ',
    });

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ statusCode: 400, message: 'Bad Request' });
  });

  // W1: guest writes are authenticated routes — no caller context means 401
  // before any scope or payload logic runs.
  it.each([
    ['a guest patch', 'PATCH', '/api/guests/g-001', { status: 'sent' }],
    ['a guest creation', 'POST', '/api/events/ev-001/guests', { name: 'Sin Credenciales' }],
  ] as const)('rejects unauthenticated %s with 401', async (_label, method, path, body) => {
    const res = await request(method, path, undefined, body);

    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ statusCode: 401, message: 'Unauthorized' });
  });

  // W1/S4: unknown fields are ignored — the id is generated server-side, the
  // event comes from the URL (never the body) and `active` starts true (BR-13).
  it('ignores mass-assignment attempts (id/eventId/active) on creation', async () => {
    const res = await apiFetch('/api/events/ev-001/guests', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-user-id': ADMIN_EV1 },
      body: JSON.stringify({
        name: 'Intento de Inyección',
        id: 'g-attacker',
        eventId: 'ev-002',
        active: false,
        table: 5,
      }),
    });

    expect(res.status).toBe(201);
    const created = (await res.json()) as { id: string; active?: boolean };
    expect(created.id).toMatch(/^g-/);
    expect(created.id).not.toBe('g-attacker');
    expect(created.active).toBe(true);

    const row = await getPrisma().guest.findUniqueOrThrow({ where: { id: created.id } });
    expect(row.eventId).toBe('ev-001');
    expect(await getPrisma().guest.count({ where: { eventId: 'ev-002' } })).toBe(0);
  });

  it('returns only the assigned event data to its admin', async () => {
    const own = await request('GET', '/api/events/ev-001/guests', ADMIN_EV1);
    const guests = (await own.json()) as { id: string; active: boolean }[];
    const expected = await getPrisma().guest.findMany({
      where: { eventId: 'ev-001' },
      select: { id: true },
      orderBy: { id: 'asc' },
    });

    expect(own.status).toBe(200);
    expect(guests.map((guest) => guest.id)).toEqual(expected.map((row) => row.id));
    expect(guests.every((guest) => guest.active)).toBe(true);

    const foreign = await request('GET', '/api/events/ev-002/guests', ADMIN_EV1);
    expect(foreign.status).toBe(403);
    expect(await foreign.json()).toEqual({ statusCode: 403, message: 'Forbidden' });
  });
});

// --- 2a-ii-a (photos half) --------------------------------------------------
// The same object-level assertions extend to POST /api/events/:id/photos and
// PATCH /api/photos/:id. Check-in and QR paths join in PR-3b through the same
// helpers (task 2a.4 "as they land"); members/toggles are 2a-ii-b.
describe('object-level photo scope (spec req 3, scenarios 3-4; req 12; req 14)', () => {
  beforeEach(async () => {
    await seedDatabase(getPrisma());
  });

  it('updates a photo of the admin own event and merges partial patches', async () => {
    // Spec req 12, scenario 3: the toggle targets exactly one row.
    const sibling = await getPrisma().photo.findUniqueOrThrow({ where: { id: 'ph-002' } });

    const res = await request('PATCH', '/api/photos/ph-001', ADMIN_EV1, {
      state: 'rejected',
      active: false,
    });

    expect(res.status).toBe(200);
    const updated = (await res.json()) as Record<string, unknown>;
    expect(updated).toMatchObject({ id: 'ph-001', state: 'rejected', active: false });

    // A second patch touches only the field it names: no reset of the first change.
    const toggled = await request('PATCH', '/api/photos/ph-001', ADMIN_EV1, { active: true });
    expect(toggled.status).toBe(200);
    expect(await toggled.json()).toMatchObject({ id: 'ph-001', state: 'rejected', active: true });

    const row = await getPrisma().photo.findUniqueOrThrow({ where: { id: 'ph-001' } });
    expect(row).toMatchObject({
      state: 'rejected',
      active: true,
      authorName: 'Lucía Ferreyra',
      downloaded: true,
      sizeKb: 3200,
    });
    expect(await getPrisma().photo.findUniqueOrThrow({ where: { id: 'ph-002' } })).toEqual(sibling);
  });

  it('rejects a cross-event photo write by exact ID without disclosing or changing it', async () => {
    const before = await getPrisma().photo.findUniqueOrThrow({ where: { id: 'ph-001' } });

    const res = await request('PATCH', '/api/photos/ph-001', ADMIN_EV2, {
      state: 'rejected',
      active: false,
    });

    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ statusCode: 403, message: 'Forbidden' });
    expect(await getPrisma().photo.findUniqueOrThrow({ where: { id: 'ph-001' } })).toEqual(before);
  });

  it('answers a nonexistent photo ID exactly like a foreign one', async () => {
    const foreign = await request('PATCH', '/api/photos/ph-001', ADMIN_EV2, { state: 'rejected' });
    const unknown = await request('PATCH', '/api/photos/ph-999', ADMIN_EV2, { state: 'rejected' });

    expect(unknown.status).toBe(foreign.status);
    expect(await unknown.json()).toEqual(await foreign.json());
    expect(await getPrisma().photo.count()).toBe(14);
  });

  it('creates photos only inside the assigned event with metadata and URL only', async () => {
    const res = await request('POST', '/api/events/ev-001/photos', ADMIN_EV1, {
      author: '  Nueva Autora  ',
      url: 'https://cdn.example.com/640/460.jpg',
      big: 'https://cdn.example.com/1600/1200.jpg',
      size: 3.2,
      h: 460,
    });

    expect(res.status).toBe(201);
    const created = (await res.json()) as Record<string, unknown>;
    expect(created).toMatchObject({
      author: 'Nueva Autora',
      state: 'pending', // server default — the client never picks it
      dl: false,
      active: true, // BR-13 soft-toggle default
      size: 3.2, // sizeKb/1000 round trip (1b handoff: decimal KB)
      h: 460,
      url: 'https://cdn.example.com/640/460.jpg',
      big: 'https://cdn.example.com/1600/1200.jpg',
      time: expect.stringMatching(/^\d{2}:\d{2}$/),
    });
    expect(created['id']).toMatch(/^ph-/);

    const row = await getPrisma().photo.findUniqueOrThrow({
      where: { id: String(created['id']) },
    });
    expect(row.eventId).toBe('ev-001');
    expect(row.sizeKb).toBe(3200);
    expect(row.authorName).toBe('Nueva Autora');
    expect(row.bigUrl).toBe('https://cdn.example.com/1600/1200.jpg');
    // Spec req 14, scenario 1: metadata + external URL — no blob/bytes carrier.
    expect(Object.keys(row).some((key) => /blob|bytes|buffer/i.test(key))).toBe(false);
    expect(await getPrisma().photo.count({ where: { eventId: 'ev-001' } })).toBe(15);
  });

  it('rejects photo creation for another event without creating a row', async () => {
    const res = await request('POST', '/api/events/ev-002/photos', ADMIN_EV1, {
      author: 'Intrusa',
      url: 'https://cdn.example.com/intrusa.jpg',
    });

    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ statusCode: 403, message: 'Forbidden' });
    expect(await getPrisma().photo.count({ where: { eventId: 'ev-002' } })).toBe(0);
  });

  it.each([SECURITY_EV1, PROVIDER])('rejects photo writes from %s', async (userId) => {
    const patch = await request('PATCH', '/api/photos/ph-001', userId, { state: 'rejected' });
    const create = await request('POST', '/api/events/ev-001/photos', userId, {
      author: 'No Autorizada',
      url: 'https://cdn.example.com/no-autorizada.jpg',
    });

    expect(patch.status).toBe(403);
    expect(create.status).toBe(403);
    expect(await getPrisma().photo.count()).toBe(14);
  });

  it.each([
    ['a photo patch', 'PATCH', '/api/photos/ph-001', { state: 'rejected' }],
    [
      'a photo creation',
      'POST',
      '/api/events/ev-001/photos',
      { author: 'Sin Credenciales', url: 'https://cdn.example.com/sin-credenciales.jpg' },
    ],
  ] as const)('rejects unauthenticated %s with 401', async (_label, method, path, body) => {
    const res = await request(method, path, undefined, body);

    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ statusCode: 401, message: 'Unauthorized' });
  });

  // W1: malformed JSON never reaches a route — same generic 400 as the guests route.
  it('answers a malformed JSON photo body with a generic 400', async () => {
    const res = await apiFetch('/api/events/ev-001/photos', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-user-id': ADMIN_EV1 },
      body: '{"author": ',
    });

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ statusCode: 400, message: 'Bad Request' });
  });

  // W1/S4: unknown fields are ignored — the id is generated server-side, the
  // event comes from the URL, `active`/`state` defaults are the server's, and
  // `authorGuestId` stays deferred (design §11: no client-settable guest link).
  it('ignores mass-assignment attempts (id/eventId/active/authorGuestId) on creation', async () => {
    const res = await apiFetch('/api/events/ev-001/photos', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-user-id': ADMIN_EV1 },
      body: JSON.stringify({
        author: 'Intento de Inyección',
        url: 'https://cdn.example.com/attack.jpg',
        id: 'ph-attacker',
        eventId: 'ev-002',
        active: false,
        downloaded: true,
        authorGuestId: 'g-001',
      }),
    });

    expect(res.status).toBe(201);
    const created = (await res.json()) as { id: string; active: boolean; state: string };
    expect(created.id).toMatch(/^ph-/);
    expect(created.id).not.toBe('ph-attacker');
    expect(created.active).toBe(true);
    expect(created.state).toBe('pending');

    const row = await getPrisma().photo.findUniqueOrThrow({ where: { id: created.id } });
    expect(row.eventId).toBe('ev-001');
    expect(row.downloaded).toBe(false);
    expect(row.authorGuestId).toBeNull();
    expect(await getPrisma().photo.count({ where: { eventId: 'ev-002' } })).toBe(0);
  });

  it('rejects an invalid photo patch on an own photo without changing it', async () => {
    const before = await getPrisma().photo.findUniqueOrThrow({ where: { id: 'ph-001' } });

    const invalid = await request('PATCH', '/api/photos/ph-001', ADMIN_EV1, {
      state: 'not-a-state',
    });
    expect(invalid.status).toBe(400);
    expect(await invalid.json()).toEqual({ statusCode: 400, message: 'Bad Request' });

    const badActive = await request('PATCH', '/api/photos/ph-001', ADMIN_EV1, { active: 'yes' });
    expect(badActive.status).toBe(400);
    expect(await badActive.json()).toEqual({ statusCode: 400, message: 'Bad Request' });

    const empty = await request('PATCH', '/api/photos/ph-001', ADMIN_EV1, {});
    expect(empty.status).toBe(400);
    expect(await empty.json()).toEqual({ statusCode: 400, message: 'Bad Request' });
    expect(await getPrisma().photo.findUniqueOrThrow({ where: { id: 'ph-001' } })).toEqual(before);

    const badState = await request('POST', '/api/events/ev-001/photos', ADMIN_EV1, {
      author: 'Estado Inválido',
      url: 'https://cdn.example.com/estado.jpg',
      state: 'maybe',
    });
    expect(badState.status).toBe(400);

    const noUrl = await request('POST', '/api/events/ev-001/photos', ADMIN_EV1, {
      author: 'Sin URL',
    });
    expect(noUrl.status).toBe(400);

    const noAuthor = await request('POST', '/api/events/ev-001/photos', ADMIN_EV1, {
      url: 'https://cdn.example.com/sin-autor.jpg',
    });
    expect(noAuthor.status).toBe(400);

    const badDl = await request('POST', '/api/events/ev-001/photos', ADMIN_EV1, {
      author: 'DL Inválido',
      url: 'https://cdn.example.com/dl.jpg',
      dl: 'yes',
    });
    expect(badDl.status).toBe(400);
    expect(await getPrisma().photo.count({ where: { eventId: 'ev-001' } })).toBe(14);
  });

  // W2: `sizeKb`/`height` are nullable int4 columns — reject int-unsafe and
  // out-of-bounds values at the app layer (same rule as retentionDays/table).
  it.each([
    ['size', 999999999999],
    ['size', -1],
    ['h', 2147483648],
    ['h', 100001],
  ] as const)(
    'rejects an out-of-bounds photo %s (%s) without creating a row',
    async (field, value) => {
      const res = await request('POST', '/api/events/ev-001/photos', ADMIN_EV1, {
        author: 'Fuera de Límite',
        url: 'https://cdn.example.com/limite.jpg',
        [field]: value,
      });

      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ statusCode: 400, message: 'Bad Request' });
      expect(await getPrisma().photo.count({ where: { eventId: 'ev-001' } })).toBe(14);
    },
  );

  it('returns only the assigned event photos to its admin', async () => {
    const own = await request('GET', '/api/events/ev-001/photos', ADMIN_EV1);
    const photos = (await own.json()) as { id: string; active: boolean }[];
    const expected = await getPrisma().photo.findMany({
      where: { eventId: 'ev-001' },
      select: { id: true },
      orderBy: { id: 'asc' },
    });

    expect(own.status).toBe(200);
    expect(photos.map((photo) => photo.id)).toEqual(expected.map((row) => row.id));
    // The BR-13 toggle flag joins the read shape (mirrors Guest.active).
    expect(photos.every((photo) => photo.active)).toBe(true);

    const foreign = await request('GET', '/api/events/ev-002/photos', ADMIN_EV1);
    expect(foreign.status).toBe(403);
    expect(await foreign.json()).toEqual({ statusCode: 403, message: 'Forbidden' });
  });
});
