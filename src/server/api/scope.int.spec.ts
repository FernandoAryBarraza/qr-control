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

// --- 2a-ii (photos half) ---------------------------------------------------
// The same object-level assertions extend to POST /api/events/:id/photos and
// PATCH /api/photos/:id in the 2a-ii batch. Those routes do not exist yet, so no
// test is written here; check-in and QR paths join in PR-3b through canWriteEvent.
