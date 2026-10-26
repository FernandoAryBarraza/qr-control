import { beforeEach, describe, expect, it, vi } from 'vitest';
import { seedDatabase } from '../../../prisma/seed';
import { getPrisma } from '../data/prisma-client';
import { apiFetch } from '../testing/integration-harness';

// Deterministic seed IDs (prisma/seed.ts): usr-002 admins ev-001, usr-007 admins ev-002.
const PROVIDER = 'usr-001';
const ADMIN_EV1 = 'usr-002';
const ADMIN_EV2 = 'usr-007';
const SECURITY_EV1 = 'usr-003';

const START = '2026-11-05T18:00:00.000Z';
const END = '2026-11-06T02:00:00.000Z';

const VALID_BODY = {
  name: 'Feria de Otoño',
  start: START,
  end: END,
  retentionDays: 730,
  note: 'Alta directa del proveedor',
  admins: [{ userId: ADMIN_EV1, role: 'admin' }],
};

function post(userId: string | undefined, body: unknown): Promise<Response> {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (userId !== undefined) headers['x-user-id'] = userId;
  return apiFetch('/api/events', { method: 'POST', headers, body: JSON.stringify(body) });
}

describe('POST /api/events', () => {
  beforeEach(async () => {
    await seedDatabase(getPrisma());
  });

  it('persists a provider-created event with its schedule, retention and admin', async () => {
    const res = await post(PROVIDER, VALID_BODY);

    expect(res.status).toBe(201);
    const created = (await res.json()) as Record<string, unknown>;
    expect(created['id']).toMatch(/^ev-/);
    expect(created).toMatchObject({
      name: 'Feria de Otoño',
      status: 'upcoming',
      dateLabel: '05 NOV 2026 · 18:00',
      guests: 0,
      photos: 0,
      admin: { name: 'Mariana Solórzano' },
    });

    // Same read contract as the GET endpoints: no display-only field is invented.
    for (const field of ['cd', 'used', 'max', 'br']) {
      expect(created).not.toHaveProperty(field);
    }

    const row = await getPrisma().event.findUniqueOrThrow({
      where: { id: String(created['id']) },
      include: { assignments: true },
    });
    expect(row.start.toISOString()).toBe(START);
    expect(row.end.toISOString()).toBe(END);
    expect(row.retentionDays).toBe(730);
    expect(row.note).toBe('Alta directa del proveedor');
    expect(row.assignments).toEqual([{ eventId: row.id, userId: ADMIN_EV1 }]);
  });

  it('defaults retention and status while accepting several admin assignments', async () => {
    const res = await post(PROVIDER, {
      ...VALID_BODY,
      status: 'active',
      admins: [
        { userId: ADMIN_EV1, role: 'admin' },
        { userId: ADMIN_EV2, role: 'admin' },
      ],
      retentionDays: undefined,
      note: undefined,
    });

    expect(res.status).toBe(201);
    const created = (await res.json()) as { id: string; status: string };

    expect(created.status).toBe('active');
    const row = await getPrisma().event.findUniqueOrThrow({
      where: { id: created.id },
      include: { assignments: true },
    });
    expect(row.retentionDays).toBe(365);
    expect(row.note).toBeNull();
    expect(row.assignments.map((assignment) => assignment.userId).sort()).toEqual(
      [ADMIN_EV1, ADMIN_EV2].sort(),
    );
  });

  it.each([ADMIN_EV1, SECURITY_EV1])(
    'rejects creation by %s and persists nothing',
    async (userId) => {
      const eventsBefore = await getPrisma().event.count();
      const assignmentsBefore = await getPrisma().eventAssignment.count();

      const res = await post(userId, VALID_BODY);

      expect(res.status).toBe(403);
      expect(await res.json()).toEqual({ statusCode: 403, message: 'Forbidden' });
      expect(await getPrisma().event.count()).toBe(eventsBefore);
      expect(await getPrisma().eventAssignment.count()).toBe(assignmentsBefore);
    },
  );

  it('rejects a provider payload without any admin and persists nothing', async () => {
    const eventsBefore = await getPrisma().event.count();

    const res = await post(PROVIDER, { ...VALID_BODY, admins: [] });

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ statusCode: 400, message: 'Bad Request' });
    expect(await getPrisma().event.count()).toBe(eventsBefore);
  });

  it.each<[string, object]>([
    ['no name', { name: '' }],
    ['unparseable start', { start: 'not-a-date' }],
    ['end before start', { end: '2026-11-05T17:00:00.000Z' }],
    ['unknown admin user', { admins: [{ userId: 'usr-999', role: 'admin' }] }],
    ['non-admin assignment', { admins: [{ userId: SECURITY_EV1, role: 'security' }] }],
  ])('rejects an invalid payload (%s) with no event row', async (_label, patch) => {
    const eventsBefore = await getPrisma().event.count();

    const res = await post(PROVIDER, { ...VALID_BODY, ...patch });

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ statusCode: 400, message: 'Bad Request' });
    expect(await getPrisma().event.count()).toBe(eventsBefore);
  });

  it('rejects an unauthenticated creation', async () => {
    const res = await post(undefined, VALID_BODY);

    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ statusCode: 401, message: 'Unauthorized' });
  });

  // W2: retentionDays is persisted on an int4 column; SQLite would happily store
  // the overflow, Postgres would 500. Sane upper bound enforced at the app layer.
  it.each([999999999999, 2147483648, 3651])(
    'rejects an int-unsafe retentionDays (%s) with no event row',
    async (retentionDays) => {
      const eventsBefore = await getPrisma().event.count();

      const res = await post(PROVIDER, { ...VALID_BODY, retentionDays });

      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ statusCode: 400, message: 'Bad Request' });
      expect(await getPrisma().event.count()).toBe(eventsBefore);
    },
  );

  // W3: naive datetimes are rejected (explicit UTC offset required) and the
  // calendar is validated — V8 rolls 2026-02-30 over to 03-02 if unchecked.
  it.each<[string, string]>([
    ['a naive datetime without offset', '2026-11-05T18:00:00'],
    ['an impossible calendar date', '2026-02-30T10:00:00Z'],
    ['an impossible date with offset', '2026-02-30T10:00:00-05:00'],
    ['a date-only string', '2026-11-05'],
  ])('rejects %s in start with no event row', async (_label, start) => {
    const eventsBefore = await getPrisma().event.count();

    const res = await post(PROVIDER, { ...VALID_BODY, start });

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ statusCode: 400, message: 'Bad Request' });
    expect(await getPrisma().event.count()).toBe(eventsBefore);
  });

  it('accepts a datetime with an explicit numeric UTC offset', async () => {
    const res = await post(PROVIDER, {
      ...VALID_BODY,
      start: '2026-11-05T13:00:00-05:00',
      end: '2026-11-06T02:00:00.000Z',
    });

    expect(res.status).toBe(201);
    const created = (await res.json()) as { dateLabel: string };
    expect(created.dateLabel).toBe('05 NOV 2026 · 18:00');
  });

  // S2: the client vocabulary uses `done`; the DB stores `finished` (1b decision).
  it('accepts "done" as the input alias for the stored finished status', async () => {
    const res = await post(PROVIDER, { ...VALID_BODY, status: 'done' });

    expect(res.status).toBe(201);
    const created = (await res.json()) as { id: string; status: string };
    expect(created.status).toBe('done');
    const row = await getPrisma().event.findUniqueOrThrow({ where: { id: created.id } });
    expect(row.status).toBe('finished');
  });

  // C1 (role half): the payload may claim `role: 'admin'`, but the STORED role
  // decides — an existing security user must be rejected by the role filter in
  // `existingAdminIds`, independently of the known-id filter.
  it('rejects an assignment whose stored role is not admin and persists nothing', async () => {
    const eventsBefore = await getPrisma().event.count();

    const res = await post(PROVIDER, {
      ...VALID_BODY,
      admins: [{ userId: SECURITY_EV1, role: 'admin' }],
    });

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ statusCode: 400, message: 'Bad Request' });
    expect(await getPrisma().event.count()).toBe(eventsBefore);
  });

  // C1 (known-id half): an unknown id cannot hide among valid admins — the
  // `id: { in: … }` filter must bind the query to the payload. The payload holds
  // exactly as many entries as the DB has admin users (seed: usr-002/007/010), so
  // ONLY the id filter distinguishes it: a mutant that drops it gets
  // `knownAdmins.length === admins.length`, slips past the count check and fails
  // the request at a different status (FK/500 or 201 — both ≠ 400).
  it('rejects an unknown id mixed into otherwise-valid admin assignments', async () => {
    const eventsBefore = await getPrisma().event.count();

    const res = await post(PROVIDER, {
      ...VALID_BODY,
      admins: [
        { userId: ADMIN_EV1, role: 'admin' },
        { userId: ADMIN_EV2, role: 'admin' },
        { userId: 'usr-999', role: 'admin' },
      ],
    });

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ statusCode: 400, message: 'Bad Request' });
    expect(await getPrisma().event.count()).toBe(eventsBefore);
  });

  // W1: malformed JSON never reaches a route; the terminal error handler answers
  // with the generic payload so parser details (and the body) cannot leak.
  it('answers a malformed JSON body with a generic 400', async () => {
    const res = await apiFetch('/api/events', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-user-id': PROVIDER },
      body: '{"name": "Sin cerrar", "start": ',
    });

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ statusCode: 400, message: 'Bad Request' });
  });

  // W1: the JSON parser rejects bodies over 102400 bytes with 413 before any
  // route runs — the payload must never be buffered wholesale.
  it('rejects a body over the JSON parser limit with 413 and persists nothing', async () => {
    const eventsBefore = await getPrisma().event.count();

    const res = await apiFetch('/api/events', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-user-id': PROVIDER },
      body: JSON.stringify({ ...VALID_BODY, note: 'x'.repeat(110_000) }),
    });

    expect(res.status).toBe(413);
    expect(await getPrisma().event.count()).toBe(eventsBefore);
  });

  // W6: the error log must never print the request body — a body-parser failure
  // carries the raw payload on the error object (`err.body`) and a truncated
  // snippet inside the parse message.
  it('logs only status/type/message for a malformed body, never the payload', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const canary = 'canary-leak@example.com';
    try {
      const res = await apiFetch('/api/events', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-user-id': PROVIDER },
        body: `{"name": "${canary}", "start": `,
      });

      expect(res.status).toBe(400);
      expect(spy).toHaveBeenCalled();
      const logged = spy.mock.calls
        .flatMap((args) =>
          args.map((arg) => {
            if (typeof arg !== 'object' || arg === null) return String(arg);
            const record = arg as Record<string, unknown>;
            // Stringify covers enumerable props (`body`); String/`message` cover
            // the non-enumerable parse message that embeds a body snippet.
            return JSON.stringify(arg) + String(arg) + String(record['message'] ?? '');
          }),
        )
        .join('\n');
      expect(logged).not.toContain(canary);
    } finally {
      spy.mockRestore();
    }
  });
});
