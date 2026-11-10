import { beforeEach, describe, expect, it, vi } from 'vitest';
import { seedDatabase } from '../../../prisma/seed';
import { getPrisma } from '../data/prisma-client';
import { apiFetch } from '../testing/integration-harness';

// Deterministic seed IDs (prisma/seed.ts): usr-001 provider; usr-002 admin of
// ev-001; usr-003..usr-006 security of ev-001; usr-007 admin of ev-002. Spec req 7
// (BR-08): the first successful scan consumes the QR and every later scan is
// rejected with no second CheckIn row. Spec req 8 (BR-09): guest, companion and
// emergency QRs all expire at `event.end`. Design §5: only an ASSIGNED admin or
// security member scans — the provider is not part of the door flow.
const PROVIDER = 'usr-001';
const ADMIN_EV1 = 'usr-002';
const SECURITY_EV1 = 'usr-003';
const ADMIN_EV2 = 'usr-007';

interface CheckInBody {
  readonly id: string;
  readonly eventId: string;
  readonly qrId: string;
  readonly kind: string;
  readonly guestId: string | null;
  readonly companionId: string | null;
  readonly createdAt: string;
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

const scan = (token: string, userId: string | undefined = SECURITY_EV1): Promise<Response> =>
  request('POST', '/api/check-ins', userId, { token });

/** Issues one attendee QR as the event's own admin and returns the raw token. */
async function issueQr(body: unknown): Promise<{ readonly token: string }> {
  const res = await request('POST', '/api/events/ev-001/qr', ADMIN_EV1, body);
  expect(res.status).toBe(201);
  return (await res.json()) as { readonly token: string };
}

/** The seed events are historical; check-in tests own the event's time window. */
async function setEventEnd(iso: string): Promise<void> {
  await getPrisma().event.update({ where: { id: 'ev-001' }, data: { end: new Date(iso) } });
}

const future = (): string => new Date(Date.now() + 6 * 60 * 60 * 1000).toISOString();
const past = (): string => new Date(Date.now() - 60 * 1000).toISOString();

describe('single-use QR check-in and expiry (spec req 7, 8 / BR-08, BR-09)', () => {
  beforeEach(async () => {
    await seedDatabase(getPrisma());
    await setEventEnd(future());
  });

  // Scenario 1 (req 7): the first scan records the check-in and consumes the QR.
  it('records the check-in and consumes the QR on the first scan', async () => {
    const { token } = await issueQr({ kind: 'guest', guestId: 'g-001' });
    const qr = await getPrisma().qrToken.findFirstOrThrow({ where: { guestId: 'g-001' } });

    const res = await scan(token);
    expect(res.status).toBe(201);
    const body = (await res.json()) as CheckInBody;

    expect(body.id).toMatch(/^ci-/);
    expect(body.eventId).toBe('ev-001');
    expect(body.qrId).toBe(qr.id);
    expect(body.kind).toBe('guest');
    expect(body.guestId).toBe('g-001');
    expect(body.companionId).toBeNull();
    expect(Number.isNaN(Date.parse(body.createdAt))).toBe(false);

    const rows = await getPrisma().checkIn.findMany({ where: { qrId: qr.id } });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.eventId).toBe('ev-001');

    const consumed = await getPrisma().qrToken.findUniqueOrThrow({ where: { id: qr.id } });
    expect(consumed.consumedAt).not.toBeNull();
  });

  // Scenario 2 (req 7): reuse is rejected and never creates a second record.
  it('rejects a second scan as already used and creates no second record', async () => {
    const { token } = await issueQr({ kind: 'guest', guestId: 'g-001' });
    const first = await scan(token);
    expect(first.status).toBe(201);

    const qr = await getPrisma().qrToken.findFirstOrThrow({ where: { guestId: 'g-001' } });
    const consumedAt = qr.consumedAt;
    expect(consumedAt).not.toBeNull();

    const second = await scan(token);
    expect(second.status).toBe(409);
    expect(await second.json()).toEqual({ statusCode: 409, message: 'Conflict' });

    expect(await getPrisma().checkIn.count({ where: { qrId: qr.id } })).toBe(1);
    const after = await getPrisma().qrToken.findUniqueOrThrow({ where: { id: qr.id } });
    expect(after.consumedAt?.toISOString()).toBe(consumedAt?.toISOString());
  });

  // Scenario 4 (req 8): at/after event end the scan is rejected AND the QR stays
  // usable — an expired attempt must not consume the token (revival after a
  // mistaken end-time fix would otherwise be impossible).
  it('rejects a scan at or after event end as expired and leaves the QR unconsumed', async () => {
    const { token } = await issueQr({ kind: 'guest', guestId: 'g-001' });
    await setEventEnd(past());

    const res = await scan(token);
    expect(res.status).toBe(410);
    expect(await res.json()).toEqual({ statusCode: 410, message: 'Gone' });

    expect(await getPrisma().checkIn.count()).toBe(0);
    const qr = await getPrisma().qrToken.findFirstOrThrow({ where: { guestId: 'g-001' } });
    expect(qr.consumedAt).toBeNull();

    // Moving the end back into the future makes the SAME token valid again, proving
    // the expired attempt did not burn it.
    await setEventEnd(future());
    expect((await scan(token)).status).toBe(201);
  });

  // Scenario 5 (req 8): emergency QRs expire exactly like attendee QRs.
  it('rejects an emergency QR after event end as expired', async () => {
    const { token } = await issueQr({ kind: 'emergency' });
    await setEventEnd(past());

    const res = await scan(token);
    expect(res.status).toBe(410);
    expect(await res.json()).toEqual({ statusCode: 410, message: 'Gone' });
    expect(await getPrisma().checkIn.count()).toBe(0);
  });

  // Req 7 applies to every kind: a companion QR is consumed on its own, and the
  // check-in carries the companion linkage (never the parent guest).
  it('checks in a companion QR as its own single-use record', async () => {
    const guestRes = await request('POST', '/api/events/ev-001/guests', ADMIN_EV1, {
      name: 'Familia Check-in',
      email: '',
      phone: '',
      table: 1,
      note: '',
      status: 'confirmed',
      party: [{ name: 'Acompañante Check-in', rel: 'invitado' }],
    });
    expect(guestRes.status).toBe(201);
    const guest = (await guestRes.json()) as { readonly id: string };
    const companion = await getPrisma().companion.findFirstOrThrow({
      where: { guestId: guest.id },
    });

    await issueQr({ kind: 'guest', guestId: guest.id });
    const { token } = await issueQr({ kind: 'companion', companionId: companion.id });

    const res = await scan(token);
    expect(res.status).toBe(201);
    const body = (await res.json()) as CheckInBody;
    expect(body.kind).toBe('companion');
    expect(body.companionId).toBe(companion.id);
    expect(body.guestId).toBeNull();

    const companionQr = await getPrisma().qrToken.findFirstOrThrow({
      where: { companionId: companion.id },
    });
    expect(await getPrisma().checkIn.count({ where: { qrId: companionQr.id } })).toBe(1);

    // Its parent guest QR is still untouched and scannable.
    const guestQr = await getPrisma().qrToken.findFirstOrThrow({ where: { guestId: guest.id } });
    expect(guestQr.consumedAt).toBeNull();
  });

  // Design §5: the token resolves its event, and the caller must be assigned to it.
  it('rejects a token from an event the caller is not assigned to', async () => {
    const { token } = await issueQr({ kind: 'guest', guestId: 'g-001' });

    const res = await scan(token, ADMIN_EV2);
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ statusCode: 403, message: 'Forbidden' });
    expect(await getPrisma().checkIn.count()).toBe(0);

    const qr = await getPrisma().qrToken.findFirstOrThrow({ where: { guestId: 'g-001' } });
    expect(qr.consumedAt).toBeNull();
  });

  // Design §5: door scanning belongs to the assigned admin/security — not the
  // provider (who is never assigned) and never an anonymous caller.
  it('allows the assigned admin and security, rejects provider and anonymous', async () => {
    const first = await issueQr({ kind: 'guest', guestId: 'g-001' });
    expect((await scan(first.token, ADMIN_EV1)).status).toBe(201);

    const second = await issueQr({ kind: 'guest', guestId: 'g-002' });
    expect((await scan(second.token, SECURITY_EV1)).status).toBe(201);

    const third = await issueQr({ kind: 'guest', guestId: 'g-003' });
    const provider = await scan(third.token, PROVIDER);
    expect(provider.status).toBe(403);
    expect(await provider.json()).toEqual({ statusCode: 403, message: 'Forbidden' });

    const anonymous = await request('POST', '/api/check-ins', undefined, {
      token: third.token,
    });
    expect(anonymous.status).toBe(401);
    expect(await getPrisma().checkIn.count()).toBe(2);
  });

  // The role rule is independent of assignments: a provider is never a door role,
  // even if a stray EventAssignment row exists (defense in depth, design §5).
  it('never lets the provider scan, even with a stray assignment', async () => {
    const { token } = await issueQr({ kind: 'guest', guestId: 'g-001' });
    await getPrisma().eventAssignment.create({
      data: { userId: PROVIDER, eventId: 'ev-001' },
    });

    const res = await scan(token, PROVIDER);
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ statusCode: 403, message: 'Forbidden' });
    expect(await getPrisma().checkIn.count()).toBe(0);
  });

  // Anti-probing (spec req 3): an unknown token is denied exactly like a foreign
  // one; only a malformed payload is a 400.
  it('rejects unknown tokens and malformed payloads without revealing token state', async () => {
    const unknown = await scan('A'.repeat(43));
    expect(unknown.status).toBe(403);
    expect(await unknown.json()).toEqual({ statusCode: 403, message: 'Forbidden' });

    for (const body of [{}, { token: 5 }, { token: '' }]) {
      const res = await request('POST', '/api/check-ins', SECURITY_EV1, body);
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ statusCode: 400, message: 'Bad Request' });
    }

    // A well-formed but unknown token with extra client fields is still just an
    // unknown token: 403, and the extras are never read (S8).
    const extra = await request('POST', '/api/check-ins', SECURITY_EV1, {
      token: 'B'.repeat(43),
      id: 7,
    });
    expect(extra.status).toBe(403);
    expect(await extra.json()).toEqual({ statusCode: 403, message: 'Forbidden' });

    expect(await getPrisma().checkIn.count()).toBe(0);
  });

  // S8 mass-assignment: the record is built from the token lookup, never from the
  // request body.
  it('ignores client-supplied record fields', async () => {
    const { token } = await issueQr({ kind: 'guest', guestId: 'g-001' });

    const res = await request('POST', '/api/check-ins', SECURITY_EV1, {
      token,
      id: 'ci-hacked',
      eventId: 'ev-002',
      qrId: 'qr-hacked',
      createdAt: '2000-01-01T00:00:00.000Z',
    });
    expect(res.status).toBe(201);
    const body = (await res.json()) as CheckInBody;

    expect(body.id).toMatch(/^ci-/);
    expect(body.id).not.toBe('ci-hacked');
    expect(body.eventId).toBe('ev-001');
    expect(body.createdAt).not.toBe('2000-01-01T00:00:00.000Z');

    const qr = await getPrisma().qrToken.findFirstOrThrow({ where: { guestId: 'g-001' } });
    expect(body.qrId).toBe(qr.id);
    expect(await getPrisma().checkIn.count({ where: { id: 'ci-hacked' } })).toBe(0);
  });

  // BR-08 is an atomic claim, not a read-then-write: two simultaneous scans of the
  // same token yield exactly one check-in and one rejection.
  it('keeps single-use under two concurrent scans', async () => {
    const { token } = await issueQr({ kind: 'guest', guestId: 'g-001' });

    const [a, b] = await Promise.all([scan(token), scan(token)]);
    const statuses = [a.status, b.status].sort((x, y) => x - y);
    expect(statuses).toEqual([201, 409]);
    expect(await getPrisma().checkIn.count()).toBe(1);
  });

  // Req 8, scenario "Scan at or after event end is rejected": the boundary itself
  // is "at event end", so the comparison must be inclusive. The fixture dates
  // (now-60s / now+6h) never sit ON the boundary, so the clock is frozen here:
  // the harness starts the API in this same process, so setSystemTime freezes the
  // SERVER's clock too — that is what makes the millisecond-exact assertion real.
  it('rejects a scan exactly at event end as expired', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    try {
      const atEnd = new Date('2026-06-01T12:00:00.000Z');
      vi.setSystemTime(atEnd);

      const { token } = await issueQr({ kind: 'guest', guestId: 'g-001' });
      await getPrisma().event.update({ where: { id: 'ev-001' }, data: { end: atEnd } });

      const res = await scan(token);
      expect(res.status).toBe(410);
      expect(await res.json()).toEqual({ statusCode: 410, message: 'Gone' });

      const qr = await getPrisma().qrToken.findFirstOrThrow({ where: { guestId: 'g-001' } });
      expect(qr.consumedAt).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  // The claim and the record are ONE transaction (design §6): when the insert
  // cannot land, the claim must roll back, or the token is burned forever with no
  // check-in behind it. The @unique on CheckIn.qrId is the fault injector: a
  // pre-existing row with the same qrId makes the insert fail inside the claim.
  it('leaves the QR unconsumed when the check-in record cannot be written', async () => {
    const { token } = await issueQr({ kind: 'guest', guestId: 'g-001' });
    const qr = await getPrisma().qrToken.findFirstOrThrow({ where: { guestId: 'g-001' } });

    await getPrisma().checkIn.create({
      data: { id: 'ci-conflict', eventId: 'ev-001', qrId: qr.id },
    });

    const res = await scan(token);
    expect(res.status).toBe(500);

    const after = await getPrisma().qrToken.findUniqueOrThrow({ where: { id: qr.id } });
    expect(after.consumedAt).toBeNull();
    expect(await getPrisma().checkIn.count({ where: { qrId: qr.id } })).toBe(1);
  });

  // Req 7, scenario "Reuse is rejected": ANY later scan of a consumed token is
  // rejected AS already-used. Req 8's expiry scenario is scoped to a valid
  // UNCONSUMED QR, so the consumed check wins even after the event ended.
  it('rejects a consumed token as already used even after the event ended', async () => {
    const { token } = await issueQr({ kind: 'guest', guestId: 'g-001' });
    expect((await scan(token)).status).toBe(201);

    const qr = await getPrisma().qrToken.findFirstOrThrow({ where: { guestId: 'g-001' } });
    const consumedAt = qr.consumedAt;
    expect(consumedAt).not.toBeNull();

    await setEventEnd(past());
    const res = await scan(token);
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ statusCode: 409, message: 'Conflict' });

    const after = await getPrisma().qrToken.findUniqueOrThrow({ where: { id: qr.id } });
    expect(after.consumedAt?.toISOString()).toBe(consumedAt?.toISOString());
  });

  // Req 8: expiry "MUST apply to guest, companion, and emergency QRs alike".
  it('rejects a companion QR after event end as expired', async () => {
    const guestRes = await request('POST', '/api/events/ev-001/guests', ADMIN_EV1, {
      name: 'Familia Expirada',
      email: '',
      phone: '',
      table: 1,
      note: '',
      status: 'confirmed',
      party: [{ name: 'Acompañante Expirado', rel: 'invitado' }],
    });
    expect(guestRes.status).toBe(201);
    const guest = (await guestRes.json()) as { readonly id: string };
    const companion = await getPrisma().companion.findFirstOrThrow({
      where: { guestId: guest.id },
    });

    await issueQr({ kind: 'guest', guestId: guest.id });
    const { token } = await issueQr({ kind: 'companion', companionId: companion.id });

    await setEventEnd(past());
    const res = await scan(token);
    expect(res.status).toBe(410);
    expect(await res.json()).toEqual({ statusCode: 410, message: 'Gone' });

    expect(await getPrisma().checkIn.count()).toBe(0);
    const companionQr = await getPrisma().qrToken.findFirstOrThrow({
      where: { companionId: companion.id },
    });
    expect(companionQr.consumedAt).toBeNull();
  });

  // Spec req 3: the scope decision comes BEFORE any state decision, so an
  // unassigned caller can never learn whether a token was used or expired.
  it('gives an unassigned caller 403 for a consumed token and for an expired token', async () => {
    const used = await issueQr({ kind: 'guest', guestId: 'g-001' });
    expect((await scan(used.token)).status).toBe(201);

    const reused = await scan(used.token, ADMIN_EV2);
    expect(reused.status).toBe(403);
    expect(await reused.json()).toEqual({ statusCode: 403, message: 'Forbidden' });

    const expiredToken = await issueQr({ kind: 'guest', guestId: 'g-002' });
    await setEventEnd(past());
    const expired = await scan(expiredToken.token, ADMIN_EV2);
    expect(expired.status).toBe(403);
    expect(await expired.json()).toEqual({ statusCode: 403, message: 'Forbidden' });

    expect(await getPrisma().checkIn.count()).toBe(1);
  });

  // Req 7: the rejection holds "regardless of scanner role or endpoint path" — a
  // token used by the security desk is not reusable by the event's admin.
  it('rejects reuse regardless of the scanner role', async () => {
    const { token } = await issueQr({ kind: 'guest', guestId: 'g-001' });
    expect((await scan(token, SECURITY_EV1)).status).toBe(201);

    const res = await scan(token, ADMIN_EV1);
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ statusCode: 409, message: 'Conflict' });
    expect(await getPrisma().checkIn.count()).toBe(1);
  });

  // The 201 body carries the scan record; it is never cached.
  it('returns the check-in with Cache-Control: no-store', async () => {
    const { token } = await issueQr({ kind: 'guest', guestId: 'g-001' });

    const res = await scan(token);
    expect(res.status).toBe(201);
    expect(res.headers.get('cache-control')).toBe('no-store');
  });
});
