import { beforeEach, describe, expect, it } from 'vitest';
import { seedDatabase } from '../../../prisma/seed';
import { getPrisma } from '../data/prisma-client';
import { apiFetch } from '../testing/integration-harness';

// Deterministic seed IDs (prisma/seed.ts): usr-001 is the provider; usr-002 admins
// ev-001 (security usr-003..usr-006); usr-007 admins ev-002. Spec req 4 (BR-05):
// the second-admin approval workflow — pending grants nothing, the provider alone
// decides, rejection is terminal but retained, and self-approval is refused.
const PROVIDER = 'usr-001';
const ADMIN_EV1 = 'usr-002';
const ADMIN_EV2 = 'usr-007';
const SECURITY_EV1 = 'usr-003';

interface AdminRequestRecord {
  readonly id: string;
  readonly eventId: string;
  readonly candidateUserId: string;
  readonly requestedById: string;
  readonly status: string;
  readonly decidedAt: string | null;
}

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

/** The event's own admin requests a second admin for ev-001 (design §5, POST row). */
async function createRequest(name: string, userId = ADMIN_EV1): Promise<AdminRequestRecord> {
  const res = await request('POST', '/api/events/ev-001/admin-requests', userId, { name });
  expect(res.status).toBe(201);
  return (await res.json()) as AdminRequestRecord;
}

async function listRequests(eventId: string, userId: string): Promise<AdminRequestRecord[]> {
  const res = await request('GET', `/api/events/${eventId}/admin-requests`, userId);
  expect(res.status).toBe(200);
  return (await res.json()) as AdminRequestRecord[];
}

describe('second-admin approval workflow (spec req 4, all scenarios / BR-05)', () => {
  beforeEach(async () => {
    await seedDatabase(getPrisma());
  });

  // Scenario 1: pending must not grant any scoped access through ANY API path.
  it('keeps a pending candidate with no access to event A through any API path', async () => {
    const created = await createRequest('Candidata en Espera');
    expect(created.status).toBe('pending');
    const candidate = created.candidateUserId;

    // The candidate user exists (role admin) but holds NO event assignment —
    // pending grants no scoped access (BR-05).
    const user = await getPrisma().user.findUniqueOrThrow({ where: { id: candidate } });
    expect(user.role).toBe('admin');
    expect(await getPrisma().eventAssignment.count({ where: { userId: candidate } })).toBe(0);

    // The list path returns no event A data at all...
    const list = await request('GET', '/api/events', candidate);
    expect(list.status).toBe(200);
    expect(((await list.json()) as { id: string }[]).map((event) => event.id)).toEqual([]);

    // ...and every event-addressed path is scope-rejected with the generic 403.
    for (const path of [
      '/api/events/ev-001',
      '/api/events/ev-001/guests',
      '/api/events/ev-001/photos',
      '/api/events/ev-001/members',
      '/api/events/ev-001/admin-requests',
    ]) {
      const res = await request('GET', path, candidate);
      expect(res.status).toBe(403);
      expect(await res.json()).toEqual({ statusCode: 403, message: 'Forbidden' });
    }

    const guestWrite = await request('POST', '/api/events/ev-001/guests', candidate, {
      name: 'Colada',
    });
    const guestPatch = await request('PATCH', '/api/guests/g-001', candidate, {
      status: 'declined',
    });
    const eventWrite = await request('POST', '/api/events', candidate, { name: 'Robada' });
    expect(guestWrite.status).toBe(403);
    expect(guestPatch.status).toBe(403);
    expect(eventWrite.status).toBe(403);
    expect(await getPrisma().guest.count({ where: { eventId: 'ev-001' } })).toBe(14);
  });

  // Scenario 2: provider approval grants exactly event-A scope (BR-3 = BR-03 scope).
  it('grants exactly event-A scope when the provider approves the request', async () => {
    const created = await createRequest('Segunda Admin Aprobada');
    const candidate = created.candidateUserId;

    const decision = await request('PATCH', `/api/admin-requests/${created.id}`, PROVIDER, {
      status: 'approved',
    });
    expect(decision.status).toBe(200);
    expect(await decision.json()).toMatchObject({
      id: created.id,
      eventId: 'ev-001',
      candidateUserId: candidate,
      requestedById: ADMIN_EV1,
      status: 'approved',
      decidedAt: expect.any(String),
    });

    // Approval materializes the second admin: user stays role admin, the ONLY
    // assignment is event A (mirrors members.ts — server-built rows, S8).
    const user = await getPrisma().user.findUniqueOrThrow({ where: { id: candidate } });
    expect(user.role).toBe('admin');
    const assignments = await getPrisma().eventAssignment.findMany({
      where: { userId: candidate },
    });
    expect(assignments.map((row) => row.eventId)).toEqual(['ev-001']);

    // Exactly event-A scope: reads and writes succeed for A and only A.
    const list = await request('GET', '/api/events', candidate);
    expect(list.status).toBe(200);
    expect(((await list.json()) as { id: string }[]).map((event) => event.id)).toEqual(['ev-001']);

    const ownGuests = await request('GET', '/api/events/ev-001/guests', candidate);
    expect(ownGuests.status).toBe(200);
    const foreignGuests = await request('GET', '/api/events/ev-002/guests', candidate);
    expect(foreignGuests.status).toBe(403);

    const ownWrite = await request('POST', '/api/events/ev-001/guests', candidate, {
      name: 'Del Segunda',
    });
    expect(ownWrite.status).toBe(201);
    const foreignWrite = await request('POST', '/api/events/ev-002/guests', candidate, {
      name: 'Intrusa',
    });
    expect(foreignWrite.status).toBe(403);
    expect(await getPrisma().guest.count({ where: { eventId: 'ev-002' } })).toBe(0);
  });

  // Scenario 2 + claim C1: the grant and the status flip are ONE transaction, so
  // a failed grant must leave the request pending. A committed flip with a
  // missing assignment would be exactly the partial state the workflow forbids.
  it('rolls the approval back when the event assignment cannot be created', async () => {
    const created = await createRequest('Aprobación Fallida');
    const candidate = created.candidateUserId;

    // Force the grant to fail deterministically: EventAssignment is keyed by
    // (eventId, userId), so an existing row makes the approval's create throw
    // inside the transaction (P2002) without mocking Prisma.
    await getPrisma().eventAssignment.create({
      data: { eventId: 'ev-001', userId: candidate },
    });

    const decision = await request('PATCH', `/api/admin-requests/${created.id}`, PROVIDER, {
      status: 'approved',
    });
    expect(decision.status).toBe(500);
    expect(await decision.json()).toEqual({ statusCode: 500, message: 'Internal Server Error' });

    // Atomic rollback: the status flip did not commit and nothing was decided.
    const row = await getPrisma().adminRequest.findUniqueOrThrow({ where: { id: created.id } });
    expect(row.status).toBe('pending');
    expect(row.decidedAt).toBeNull();
    expect(await getPrisma().eventAssignment.count({ where: { userId: candidate } })).toBe(1);
  });

  // Scenario 3: rejection grants nothing, the record stays queryable, and a
  // decided request never transitions again (terminal).
  it('grants nothing on rejection and keeps the record queryable as a record', async () => {
    const created = await createRequest('Candidata Rechazada');
    const candidate = created.candidateUserId;

    const decision = await request('PATCH', `/api/admin-requests/${created.id}`, PROVIDER, {
      status: 'rejected',
    });
    expect(decision.status).toBe(200);
    expect(await decision.json()).toMatchObject({
      id: created.id,
      status: 'rejected',
      decidedAt: expect.any(String),
    });

    // Terminal: a rejected request cannot be flipped to approved.
    const flip = await request('PATCH', `/api/admin-requests/${created.id}`, PROVIDER, {
      status: 'approved',
    });
    expect(flip.status).toBe(400);
    expect(await flip.json()).toEqual({ statusCode: 400, message: 'Bad Request' });

    // The rejected request record remains queryable as a record.
    const records = await listRequests('ev-001', ADMIN_EV1);
    expect(records).toContainEqual(
      expect.objectContaining({
        id: created.id,
        status: 'rejected',
        candidateUserId: candidate,
        requestedById: ADMIN_EV1,
      }),
    );

    // ...and the candidate gained nothing: no assignment, no access, no writes.
    expect(await getPrisma().eventAssignment.count({ where: { userId: candidate } })).toBe(0);
    const events = await request('GET', '/api/events', candidate);
    expect(((await events.json()) as { id: string }[]).map((event) => event.id)).toEqual([]);
    const write = await request('POST', '/api/events/ev-001/guests', candidate, {
      name: 'Rechazada',
    });
    expect(write.status).toBe(403);
    expect(await getPrisma().guest.count({ where: { eventId: 'ev-001' } })).toBe(14);
  });

  // Scenario 4: the event's admin cannot approve their own request — the
  // caller-role check blocks it and the request stays pending.
  it('rejects the event admin self-approval and keeps the request pending', async () => {
    const created = await createRequest('Autoprobada');
    const candidate = created.candidateUserId;

    const self = await request('PATCH', `/api/admin-requests/${created.id}`, ADMIN_EV1, {
      status: 'approved',
    });
    expect(self.status).toBe(403);
    expect(await self.json()).toEqual({ statusCode: 403, message: 'Forbidden' });

    // The event's security staff is blocked by the same caller-role check.
    const security = await request('PATCH', `/api/admin-requests/${created.id}`, SECURITY_EV1, {
      status: 'approved',
    });
    expect(security.status).toBe(403);

    // Status stays pending — nothing decided, nothing granted.
    const records = await listRequests('ev-001', ADMIN_EV1);
    const record = records.find((entry) => entry.id === created.id);
    expect(record?.status).toBe('pending');
    expect(record?.decidedAt ?? null).toBeNull();

    const row = await getPrisma().adminRequest.findUniqueOrThrow({
      where: { id: created.id },
    });
    expect(row.status).toBe('pending');
    expect(row.decidedAt).toBeNull();
    expect(await getPrisma().eventAssignment.count({ where: { userId: candidate } })).toBe(0);
  });

  // Design §5 matrix: POST rides the S8 object-scope guard — scope + role.
  it('creates requests only from the assigned admin of the own event', async () => {
    const usersBefore = await getPrisma().user.count();
    const requestsBefore = await getPrisma().adminRequest.count();

    const provider = await request('POST', '/api/events/ev-001/admin-requests', PROVIDER, {
      name: 'Del Proveedor',
    });
    const security = await request('POST', '/api/events/ev-001/admin-requests', SECURITY_EV1, {
      name: 'De Seguridad',
    });
    const foreign = await request('POST', '/api/events/ev-001/admin-requests', ADMIN_EV2, {
      name: 'De Otra Admin',
    });
    const unknownEvent = await request('POST', '/api/events/ev-999/admin-requests', ADMIN_EV1, {
      name: 'Evento Fantasma',
    });
    const anonymous = await request('POST', '/api/events/ev-001/admin-requests', undefined, {
      name: 'Sin Credenciales',
    });

    expect(provider.status).toBe(403);
    expect(security.status).toBe(403);
    expect(foreign.status).toBe(403);
    expect(await foreign.json()).toEqual({ statusCode: 403, message: 'Forbidden' });
    expect(unknownEvent.status).toBe(403);
    expect(anonymous.status).toBe(401);
    expect(await getPrisma().user.count()).toBe(usersBefore);
    expect(await getPrisma().adminRequest.count()).toBe(requestsBefore);
  });

  // S8 mass-assignment contract: ids, roles, event ids and statuses are the
  // server's — the payload only ever carries the candidate's name.
  it('never reads client-supplied ids, statuses, events or requesters on creation', async () => {
    const res = await request('POST', '/api/events/ev-001/admin-requests', ADMIN_EV1, {
      name: 'Inyectada',
      id: 'ar-hacked',
      candidateUserId: 'usr-hacked',
      requestedById: PROVIDER,
      eventId: 'ev-002',
      status: 'approved',
      decidedAt: '2020-01-01T00:00:00.000Z',
    });

    expect(res.status).toBe(201);
    const created = (await res.json()) as Record<string, unknown>;
    expect(String(created['id'])).toMatch(/^ar-/);
    expect(created['id']).not.toBe('ar-hacked');
    const candidate = String(created['candidateUserId']);
    expect(candidate).toMatch(/^usr-/);
    expect(candidate).not.toBe('usr-hacked');
    expect(created['requestedById']).toBe(ADMIN_EV1); // the caller, never the body
    expect(created['status']).toBe('pending'); // server-set initial state
    expect(created['decidedAt']).toBeNull();

    const row = await getPrisma().adminRequest.findUniqueOrThrow({
      where: { id: String(created['id']) },
    });
    expect(row.eventId).toBe('ev-001'); // the URL event id, never the body's
    expect(row.requestedById).toBe(ADMIN_EV1);
    expect(await getPrisma().adminRequest.count({ where: { eventId: 'ev-002' } })).toBe(0);
  });

  // App-layer state validation (spec req 4 + req 16): the PATCH decision set is
  // exactly approved|rejected, invalid payloads get the generic 400, and an
  // unknown row stays distinguishable only for the provider.
  it('answers invalid payloads and unknown rows with generic errors', async () => {
    const created = await createRequest('Contrato de Errores');

    for (const body of [{}, { name: 5 }, { name: '   ' }]) {
      const res = await request('POST', '/api/events/ev-001/admin-requests', ADMIN_EV1, body);
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ statusCode: 400, message: 'Bad Request' });
    }

    // States are strings validated at the app layer: `pending` is the server-set
    // initial state (not a decision), anything outside the workflow set fails.
    for (const body of [{}, { status: 'banana' }, { status: 'pending' }, { status: 5 }]) {
      const res = await request('PATCH', `/api/admin-requests/${created.id}`, PROVIDER, body);
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ statusCode: 400, message: 'Bad Request' });
    }

    // Unknown row: the provider gets 404; a non-provider is role-rejected
    // first and learns nothing about the row's existence.
    const unknown = await request('PATCH', '/api/admin-requests/ar-00000000', PROVIDER, {
      status: 'approved',
    });
    expect(unknown.status).toBe(404);
    expect(await unknown.json()).toEqual({ statusCode: 404, message: 'Not Found' });
    const adminUnknown = await request('PATCH', '/api/admin-requests/ar-00000000', ADMIN_EV1, {
      status: 'approved',
    });
    expect(adminUnknown.status).toBe(403);

    const anonymous = await request('PATCH', `/api/admin-requests/${created.id}`, undefined, {
      status: 'approved',
    });
    expect(anonymous.status).toBe(401);

    // None of the invalid payloads touched the row.
    const row = await getPrisma().adminRequest.findUniqueOrThrow({ where: { id: created.id } });
    expect(row.status).toBe('pending');
    expect(row.decidedAt).toBeNull();
  });

  // Design §5 matrix (GET row): provider any / assigned admin — same read guard
  // as members; the request list never leaks across events.
  it('returns the request list to the provider and the assigned admin only', async () => {
    await createRequest('Visible');

    const provider = await request('GET', '/api/events/ev-001/admin-requests', PROVIDER);
    expect(provider.status).toBe(200);
    expect(((await provider.json()) as unknown[]).length).toBe(1);

    const own = await listRequests('ev-001', ADMIN_EV1);
    expect(own.map((record) => record.status)).toEqual(['pending']);

    const foreign = await request('GET', '/api/events/ev-001/admin-requests', ADMIN_EV2);
    const security = await request('GET', '/api/events/ev-001/admin-requests', SECURITY_EV1);
    const unknownEvent = await request('GET', '/api/events/ev-999/admin-requests', ADMIN_EV1);
    const anonymous = await request('GET', '/api/events/ev-001/admin-requests', undefined);

    expect(foreign.status).toBe(403);
    expect(await foreign.json()).toEqual({ statusCode: 403, message: 'Forbidden' });
    expect(security.status).toBe(403);
    expect(unknownEvent.status).toBe(403);
    expect(anonymous.status).toBe(401);
  });

  // Design §5 matrix (GET row) + spec req 3, scenario 1: the repository's
  // eventId filter is the ONLY thing keeping one event's workflow records out
  // of another event's list — the read guard already admits the caller, so a
  // dropped filter would leak rows to whoever can read the requested event.
  it('never leaks one event admin requests into another event list', async () => {
    const own = await createRequest('De Evento A');

    const foreignRes = await request('POST', '/api/events/ev-002/admin-requests', ADMIN_EV2, {
      name: 'De Evento B',
    });
    expect(foreignRes.status).toBe(201);
    const foreign = (await foreignRes.json()) as AdminRequestRecord;
    expect(foreign.eventId).toBe('ev-002');

    // Each list carries its own event's records and only its own — for the
    // assigned admin and for the provider (who can read any event).
    expect((await listRequests('ev-001', ADMIN_EV1)).map((record) => record.id)).toEqual([own.id]);
    expect((await listRequests('ev-001', PROVIDER)).map((record) => record.id)).toEqual([own.id]);
    expect((await listRequests('ev-002', ADMIN_EV2)).map((record) => record.id)).toEqual([
      foreign.id,
    ]);
    expect((await listRequests('ev-002', PROVIDER)).map((record) => record.id)).toEqual([
      foreign.id,
    ]);
  });
});
