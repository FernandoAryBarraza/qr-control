import { createHash } from 'node:crypto';
import { beforeEach, describe, expect, it } from 'vitest';
import { seedDatabase } from '../../../prisma/seed';
import { getPrisma } from '../data/prisma-client';
import { apiFetch } from '../testing/integration-harness';

// Deterministic seed IDs (prisma/seed.ts): usr-001 is the provider; usr-002 admins
// ev-001 (security usr-003..usr-006); usr-007 admins ev-002. Spec req 6 (BR-07):
// every guest and every companion gets its OWN QR, companion QRs link to the
// parent guest QR, and the payload is an opaque server-generated token (req 10,
// BR-11/BR-17). Req 9 (BR-10): an admin issues emergency QRs for their own event.
const PROVIDER = 'usr-001';
const ADMIN_EV1 = 'usr-002';
const ADMIN_EV2 = 'usr-007';
const SECURITY_EV1 = 'usr-003';

interface IssuedQr {
  readonly token: string;
  readonly verifyUrl: string;
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

const sha256 = (value: string): string => createHash('sha256').update(value).digest('hex');

/** The event's own admin creates a confirmed guest (optionally with a party). */
async function createGuest(
  name: string,
  party: readonly string[] = [],
  contact?: { readonly email?: string; readonly phone?: string },
): Promise<{ readonly id: string }> {
  const res = await request('POST', '/api/events/ev-001/guests', ADMIN_EV1, {
    name,
    email: contact?.email ?? '',
    phone: contact?.phone ?? '',
    table: 1,
    note: '',
    status: 'confirmed',
    party: party.map((member) => ({ name: member, rel: 'invitado' })),
  });
  expect(res.status).toBe(201);
  return (await res.json()) as { readonly id: string };
}

async function companionIdsOf(guestId: string): Promise<readonly string[]> {
  const rows = await getPrisma().companion.findMany({
    where: { guestId },
    orderBy: { id: 'asc' },
    select: { id: true },
  });
  return rows.map((row) => row.id);
}

/** Issues one QR as the event's own admin and asserts the 201 contract. */
async function issue(body: unknown): Promise<IssuedQr> {
  const res = await request('POST', '/api/events/ev-001/qr', ADMIN_EV1, body);
  expect(res.status).toBe(201);
  return (await res.json()) as IssuedQr;
}

describe('per-attendee QR issuance (spec req 6, 9, 10 / BR-07, BR-10, BR-11, BR-17)', () => {
  beforeEach(async () => {
    await seedDatabase(getPrisma());
  });

  // Scenario 1: the guest and each companion get DISTINCT QR records, and every
  // companion QR references the parent guest's QR (never an alias of it).
  it('issues a distinct QR for a confirmed guest and each companion, linked to the parent guest QR', async () => {
    const guest = await createGuest('Familia QR', ['Acompañante Uno', 'Acompañante Dos']);
    const companions = await companionIdsOf(guest.id);
    expect(companions).toHaveLength(2);

    const guestQr = await issue({ kind: 'guest', guestId: guest.id });
    const first = await issue({ kind: 'companion', companionId: companions[0] });
    const second = await issue({ kind: 'companion', companionId: companions[1] });

    // N+1 distinct records, N+1 distinct raw tokens.
    const rows = await getPrisma().qrToken.findMany({ where: { eventId: 'ev-001' } });
    expect(rows).toHaveLength(3);
    expect(new Set(rows.map((row) => row.id)).size).toBe(3);
    expect(new Set([guestQr.token, first.token, second.token]).size).toBe(3);

    // The guest QR is its own record; companion QRs point at it.
    const guestRow = rows.find((row) => row.kind === 'guest');
    expect(guestRow?.guestId).toBe(guest.id);
    expect(guestRow?.parentQrId).toBeNull();

    const companionRows = rows.filter((row) => row.kind === 'companion');
    expect(companionRows).toHaveLength(2);
    expect(companionRows.map((row) => row.companionId).sort()).toEqual([...companions].sort());
    expect(companionRows.every((row) => row.parentQrId === guestRow?.id)).toBe(true);
    expect(companionRows.every((row) => row.guestId === null)).toBe(true);
  });

  // Req 10 / design §6: the raw token is returned exactly once; only its SHA-256
  // hash is persisted, and the verify URL is absolute with the token as the path.
  it('stores only the SHA-256 of the token and never re-exposes the raw value', async () => {
    const guest = await createGuest('Token Único');
    const issued = await issue({ kind: 'guest', guestId: guest.id });

    // crypto.randomBytes(32).toString('base64url') — 43 URL-safe chars, no padding.
    expect(issued.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    const url = new URL(issued.verifyUrl);
    expect(url.pathname).toBe(`/verify/${issued.token}`);

    const row = await getPrisma().qrToken.findFirstOrThrow({ where: { guestId: guest.id } });
    expect(row.tokenHash).toBe(sha256(issued.token));
    expect(row.tokenHash).not.toBe(issued.token);
    expect(JSON.stringify(row)).not.toContain(issued.token);

    // Issuing again for the same guest must not mint a second QR nor re-expose a
    // raw token (the stored hash can never be reversed into one).
    const again = await request('POST', '/api/events/ev-001/qr', ADMIN_EV1, {
      kind: 'guest',
      guestId: guest.id,
    });
    expect(again.status).toBe(400);
    expect(await getPrisma().qrToken.count({ where: { guestId: guest.id } })).toBe(1);
  });

  // Scenario 3: the client supplies no token content — any token-ish field in the
  // body is never read (S8 mass-assignment contract), and the token carries no PII.
  it('keeps PII out of the token and ignores client-supplied token content', async () => {
    const guest = await createGuest('María PII', [], {
      email: 'maria.pii@example.com',
      phone: '+54 11 5555 7777',
    });

    const res = await request('POST', '/api/events/ev-001/qr', ADMIN_EV1, {
      kind: 'guest',
      guestId: guest.id,
      token: 'client-token',
      tokenHash: sha256('client-token'),
      id: 'qr-hacked',
      eventId: 'ev-002',
    });
    expect(res.status).toBe(201);
    const issued = (await res.json()) as IssuedQr;

    for (const pii of ['María', 'maria.pii', 'example.com', '5555', '7777']) {
      expect(issued.token).not.toContain(pii);
    }

    const row = await getPrisma().qrToken.findFirstOrThrow({ where: { guestId: guest.id } });
    expect(row.id).toMatch(/^qr-/);
    expect(row.id).not.toBe('qr-hacked');
    expect(row.eventId).toBe('ev-001'); // the URL event, never the body's
    expect(row.tokenHash).toBe(sha256(issued.token));
    expect(row.tokenHash).not.toBe(sha256('client-token'));
  });

  // A companion QR can only reference an EXISTING parent guest QR: the raw guest
  // token is returned once at issuance, so the parent must be issued first.
  it('refuses a companion QR until the parent guest QR exists', async () => {
    const guest = await createGuest('Con Acompañante', ['Acompañante']);
    const companions = await companionIdsOf(guest.id);

    const res = await request('POST', '/api/events/ev-001/qr', ADMIN_EV1, {
      kind: 'companion',
      companionId: companions[0],
    });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ statusCode: 400, message: 'Bad Request' });
    expect(await getPrisma().qrToken.count()).toBe(0);

    // Once the parent exists, the companion QR is accepted.
    await issue({ kind: 'guest', guestId: guest.id });
    await issue({ kind: 'companion', companionId: companions[0] });
    expect(await getPrisma().qrToken.count()).toBe(2);

    // One QR per companion: a second attempt is a state conflict and never mints
    // another row (its raw token would be unreachable forever).
    const again = await request('POST', '/api/events/ev-001/qr', ADMIN_EV1, {
      kind: 'companion',
      companionId: companions[0],
    });
    expect(again.status).toBe(400);
    expect(await getPrisma().qrToken.count({ where: { companionId: companions[0] } })).toBe(1);
  });

  // Design §5 matrix: issuance is an event write — the assigned admin, nobody else.
  it('issues only for the assigned admin of the event', async () => {
    const guest = await createGuest('Scoped');
    const before = await getPrisma().qrToken.count();

    const provider = await request('POST', '/api/events/ev-001/qr', PROVIDER, {
      kind: 'guest',
      guestId: guest.id,
    });
    const security = await request('POST', '/api/events/ev-001/qr', SECURITY_EV1, {
      kind: 'guest',
      guestId: guest.id,
    });
    const foreign = await request('POST', '/api/events/ev-001/qr', ADMIN_EV2, {
      kind: 'guest',
      guestId: guest.id,
    });
    const unknownEvent = await request('POST', '/api/events/ev-999/qr', ADMIN_EV1, {
      kind: 'guest',
      guestId: guest.id,
    });
    const anonymous = await request('POST', '/api/events/ev-001/qr', undefined, {
      kind: 'guest',
      guestId: guest.id,
    });

    expect(provider.status).toBe(403);
    expect(security.status).toBe(403);
    expect(foreign.status).toBe(403);
    expect(await foreign.json()).toEqual({ statusCode: 403, message: 'Forbidden' });
    expect(unknownEvent.status).toBe(403);
    expect(anonymous.status).toBe(401);
    expect(await getPrisma().qrToken.count()).toBe(before);
  });

  // BR-03 object scope: a guest or companion from another event is a foreign
  // object — the event id in the URL never authorizes it.
  it('refuses a guest or companion that belongs to another event', async () => {
    const foreignRes = await request('POST', '/api/events/ev-002/guests', ADMIN_EV2, {
      name: 'Ajeno',
      email: '',
      phone: '',
      table: 1,
      note: '',
      status: 'confirmed',
      party: [{ name: 'Acompañante Ajeno', rel: 'amigo' }],
    });
    expect(foreignRes.status).toBe(201);
    const foreignGuest = (await foreignRes.json()) as { readonly id: string };
    const foreignCompanion = await getPrisma().companion.findFirstOrThrow({
      where: { guestId: foreignGuest.id },
    });

    // The foreign guest QR is issued by ITS OWN admin first: without a parent QR
    // the companion attempt below would fail on the missing-parent rule and never
    // reach the cross-event check (this is exactly what masked the scope bug).
    const foreignParent = await request('POST', '/api/events/ev-002/qr', ADMIN_EV2, {
      kind: 'guest',
      guestId: foreignGuest.id,
    });
    expect(foreignParent.status).toBe(201);

    const guestAttempt = await request('POST', '/api/events/ev-001/qr', ADMIN_EV1, {
      kind: 'guest',
      guestId: foreignGuest.id,
    });
    const companionAttempt = await request('POST', '/api/events/ev-001/qr', ADMIN_EV1, {
      kind: 'companion',
      companionId: foreignCompanion.id,
    });

    // Object-level denial: the same generic 403 every object-scoped write returns,
    // for a foreign row and a nonexistent one alike (spec req 3, scenario 3).
    expect(guestAttempt.status).toBe(403);
    expect(await guestAttempt.json()).toEqual({ statusCode: 403, message: 'Forbidden' });
    expect(companionAttempt.status).toBe(403);
    expect(await companionAttempt.json()).toEqual({ statusCode: 403, message: 'Forbidden' });
    expect(await getPrisma().qrToken.count({ where: { companionId: foreignCompanion.id } })).toBe(
      0,
    );
    expect(await getPrisma().qrToken.count({ where: { guestId: foreignGuest.id } })).toBe(1);
  });

  // Req 9 (both scenarios): an emergency QR is scoped to the admin's own event.
  it('issues an emergency QR for the own event only', async () => {
    // Attendee fields are ignored for an emergency QR: it is standalone and never
    // inherits a client-supplied target (S8 mass-assignment contract).
    const own = await request('POST', '/api/events/ev-001/qr', ADMIN_EV1, {
      kind: 'emergency',
      guestId: 'g-999',
      companionId: 'c-999',
    });
    expect(own.status).toBe(201);

    const row = await getPrisma().qrToken.findFirstOrThrow({ where: { kind: 'emergency' } });
    expect(row.eventId).toBe('ev-001');
    expect(row.guestId).toBeNull();
    expect(row.companionId).toBeNull();
    expect(row.parentQrId).toBeNull();

    const foreign = await request('POST', '/api/events/ev-002/qr', ADMIN_EV1, {
      kind: 'emergency',
    });
    expect(foreign.status).toBe(403);
    expect(await getPrisma().qrToken.count({ where: { kind: 'emergency' } })).toBe(1);
  });

  it('validates the issuance payload', async () => {
    const guest = await createGuest('Payload', ['Acompañante Payload']);
    const companions = await companionIdsOf(guest.id);
    // The parent guest QR exists BEFORE the loop, so the `banana` body below can
    // only be rejected by the kind whitelist — not by the missing-parent rule.
    await issue({ kind: 'guest', guestId: guest.id });

    // Parse-level failures: 400 before any row is read or written.
    for (const body of [
      {},
      { kind: 'banana' },
      { kind: 'banana', companionId: companions[0] },
      { kind: 'guest' },
      { kind: 'guest', guestId: 5 },
      { kind: 'companion' },
      { kind: 'companion', companionId: 5 },
    ]) {
      const res = await request('POST', '/api/events/ev-001/qr', ADMIN_EV1, body);
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ statusCode: 400, message: 'Bad Request' });
    }

    // Missing targets are object-level denials, identical to a foreign id (403).
    for (const body of [
      { kind: 'guest', guestId: 'g-missing' },
      { kind: 'companion', companionId: 'c-missing' },
    ]) {
      const res = await request('POST', '/api/events/ev-001/qr', ADMIN_EV1, body);
      expect(res.status).toBe(403);
      expect(await res.json()).toEqual({ statusCode: 403, message: 'Forbidden' });
    }

    // Only the parent guest QR row exists: no rejected attempt minted a record.
    expect(await getPrisma().qrToken.count()).toBe(1);
    expect(await getPrisma().qrToken.count({ where: { kind: { not: 'guest' } } })).toBe(0);
  });
});
