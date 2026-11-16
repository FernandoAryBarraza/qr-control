import QRCode from 'qrcode';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { seedDatabase } from '../../../prisma/seed';
import { getPrisma } from '../data/prisma-client';
import { verifyQrByToken } from '../data/repositories/qr-verify';
import { apiFetch } from '../testing/integration-harness';

// Deterministic seed IDs (prisma/seed.ts): usr-001 provider; usr-002 admin of
// ev-001; usr-003..usr-006 security of ev-001; usr-007 admin of ev-002.
// Spec req 6 (BR-07): a companion token resolves to the SPECIFIC companion and
// its parent guest. Spec req 10 (BR-11): the token is server-verifiable — the
// server resolves it to the attendee record and the validity state. Spec req 9
// (BR-10): an emergency QR is a standalone record with no attendee. Design §5:
// the verification is a door read (assigned security/admin), the PNG is an
// admin-level artifact (assigned admin), both scoped to the token's own event.
const PROVIDER = 'usr-001';
const ADMIN_EV1 = 'usr-002';
const SECURITY_EV1 = 'usr-003';
const ADMIN_EV2 = 'usr-007';

interface VerificationBody {
  readonly qrId: string;
  readonly eventId: string;
  readonly kind: string;
  readonly status: string;
  readonly guest: { readonly id: string; readonly name: string; readonly table: number } | null;
  readonly companion: { readonly id: string; readonly name: string; readonly rel: string } | null;
  readonly parentGuest: {
    readonly id: string;
    readonly name: string;
    readonly table: number;
  } | null;
}

function request(method: string, path: string, userId: string | undefined): Promise<Response> {
  const headers: Record<string, string> = {};
  if (userId !== undefined) headers['x-user-id'] = userId;
  return apiFetch(path, { method, headers });
}

/** The event's own admin creates a confirmed guest with a party of companions. */
async function createGuestWithParty(
  name: string,
  party: readonly string[] = [],
  eventId = 'ev-001',
  adminId = ADMIN_EV1,
): Promise<{ readonly id: string; readonly companionIds: readonly string[] }> {
  const created = await apiFetch(`/api/events/${eventId}/guests`, {
    method: 'POST',
    headers: { 'x-user-id': adminId, 'content-type': 'application/json' },
    body: JSON.stringify({
      name,
      email: '',
      phone: '',
      table: 7,
      note: '',
      status: 'confirmed',
      party: party.map((member) => ({ name: member, rel: 'invitado' })),
    }),
  });
  expect(created.status).toBe(201);
  const guest = (await created.json()) as { readonly id: string };

  const rows = await getPrisma().companion.findMany({
    where: { guestId: guest.id },
    orderBy: { id: 'asc' },
    select: { id: true },
  });
  return { id: guest.id, companionIds: rows.map((row) => row.id) };
}

/** Issues one attendee QR as the event's own admin and returns the raw token. */
async function issue(
  body: unknown,
  eventId = 'ev-001',
  adminId = ADMIN_EV1,
): Promise<{ readonly token: string; readonly verifyUrl: string }> {
  const res = await apiFetch(`/api/events/${eventId}/qr`, {
    method: 'POST',
    headers: { 'x-user-id': adminId, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  expect(res.status).toBe(201);
  return (await res.json()) as { readonly token: string; readonly verifyUrl: string };
}

// The caller is ALWAYS explicit in these two helpers: a default parameter would
// silently turn an `undefined` caller (the anonymous case) into the assigned staff.
const verifyAs = (token: string, userId: string | undefined): Promise<Response> =>
  request('GET', `/api/qr/verify/${token}`, userId);

const imageAs = (token: string, userId: string | undefined): Promise<Response> =>
  request('GET', `/api/qr/image/${token}`, userId);

const verify = (token: string): Promise<Response> => verifyAs(token, SECURITY_EV1);

const image = (token: string): Promise<Response> => imageAs(token, ADMIN_EV1);

/** The seed events are historical; the verification tests own the event's window. */
async function setEventEnd(iso: string): Promise<void> {
  await getPrisma().event.update({ where: { id: 'ev-001' }, data: { end: new Date(iso) } });
}

const future = (): string => new Date(Date.now() + 6 * 60 * 60 * 1000).toISOString();
const past = (): string => new Date(Date.now() - 60 * 1000).toISOString();

describe('QR verification and image (spec req 6, 9, 10 / BR-07, BR-10, BR-11)', () => {
  beforeEach(async () => {
    await seedDatabase(getPrisma());
    await setEventEnd(future());
  });

  // Scenario 2 (req 6): the companion's token resolves to the SPECIFIC companion
  // AND its parent guest — never to the guest QR alone, never to the party.
  it('resolves a companion token to the specific companion and its parent guest', async () => {
    const guest = await createGuestWithParty('Familia Verify', ['Acompañante Verify']);
    const companionId = guest.companionIds[0];
    expect(companionId).toBeDefined();

    await issue({ kind: 'guest', guestId: guest.id });
    const companionQr = await issue({ kind: 'companion', companionId });

    const res = await verify(companionQr.token);
    expect(res.status).toBe(200);
    const body = (await res.json()) as VerificationBody;

    expect(body.kind).toBe('companion');
    expect(body.eventId).toBe('ev-001');
    expect(body.companion?.id).toBe(companionId);
    expect(body.companion?.name).toBe('Acompañante Verify');
    expect(body.parentGuest?.id).toBe(guest.id);
    expect(body.parentGuest?.name).toBe('Familia Verify');
    // The companion QR is NOT the guest's own QR: the guest is reported as the
    // PARENT, never as the attendee the token identifies.
    expect(body.guest).toBeNull();

    // The parent the response reports is the one ISSUANCE stored: the companion
    // QR's parent record is the guest's own QR (BR-07 linkage).
    const rows = await getPrisma().qrToken.findMany({ where: { eventId: 'ev-001' } });
    const companionRow = rows.find((row) => row.kind === 'companion');
    const parentRow = rows.find((row) => row.id === companionRow?.parentQrId);
    expect(parentRow?.guestId).toBe(guest.id);
  });

  // Scenario 2 (req 10): the token resolves to the attendee record and its state.
  it('resolves a guest token to its own guest and reports a valid state', async () => {
    const guest = await createGuestWithParty('Guest Verify');
    const issued = await issue({ kind: 'guest', guestId: guest.id });

    const res = await verify(issued.token);
    expect(res.status).toBe(200);
    // The response carries attendee names and the QR state: it must never be cached.
    expect(res.headers.get('cache-control')).toBe('no-store');
    const body = (await res.json()) as VerificationBody;

    expect(body.kind).toBe('guest');
    expect(body.guest?.id).toBe(guest.id);
    expect(body.guest?.name).toBe('Guest Verify');
    expect(body.guest?.table).toBe(7);
    expect(body.companion).toBeNull();
    expect(body.parentGuest).toBeNull();
    expect(body.status).toBe('valid');
    expect(body.qrId).toMatch(/^qr-/);
  });

  // Req 9 (BR-10): an emergency QR is standalone — it resolves to the QR record
  // and to no attendee at all.
  it('resolves an emergency token to a standalone emergency QR with no attendee', async () => {
    const issued = await issue({ kind: 'emergency' });

    const res = await verify(issued.token);
    expect(res.status).toBe(200);
    const body = (await res.json()) as VerificationBody;

    expect(body.kind).toBe('emergency');
    expect(body.guest).toBeNull();
    expect(body.companion).toBeNull();
    expect(body.parentGuest).toBeNull();
    expect(body.status).toBe('valid');
  });

  // Req 10 (scenario 2): the validity state travels with the attendee record —
  // a consumed QR reads as USED, an event past its end reads as EXPIRED.
  it('reports a consumed QR as used and an ended event as expired', async () => {
    const guest = await createGuestWithParty('Estado Verify');
    const issued = await issue({ kind: 'guest', guestId: guest.id });

    const live = (await (await verify(issued.token)).json()) as VerificationBody;
    expect(live.status).toBe('valid');

    // The scan consumes the QR; the verification then reports the state as used
    // and still identifies the attendee.
    const scan = await apiFetch('/api/check-ins', {
      method: 'POST',
      headers: { 'x-user-id': SECURITY_EV1, 'content-type': 'application/json' },
      body: JSON.stringify({ token: issued.token }),
    });
    expect(scan.status).toBe(201);

    const used = (await (await verify(issued.token)).json()) as VerificationBody;
    expect(used.status).toBe('used');
    expect(used.guest?.id).toBe(guest.id);

    // A second, unconsumed token on an event past its end reads as expired.
    const other = await createGuestWithParty('Expirado Verify');
    const expiredQr = await issue({ kind: 'guest', guestId: other.id });
    await setEventEnd(past());

    const expired = (await (await verify(expiredQr.token)).json()) as VerificationBody;
    expect(expired.status).toBe('expired');
    expect(expired.guest?.id).toBe(other.id);
  });

  // Req 8's boundary is "at event end", so the comparison must be INCLUSIVE. The
  // fixture dates (now-60s / now+6h) never sit ON the boundary, so the clock is
  // frozen here: the harness starts the API in this same process, so setSystemTime
  // freezes the SERVER's clock too — that is what makes the millisecond-exact
  // assertion real (the scan path pins the same boundary in check-in.int.spec.ts).
  it('reports a QR whose event ends exactly now as expired', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    try {
      const atEnd = new Date('2026-06-01T12:00:00.000Z');
      vi.setSystemTime(atEnd);

      const guest = await createGuestWithParty('Boundary Verify');
      const issued = await issue({ kind: 'guest', guestId: guest.id });
      await getPrisma().event.update({ where: { id: 'ev-001' }, data: { end: atEnd } });

      const onBoundary = (await (await verify(issued.token)).json()) as VerificationBody;
      expect(onBoundary.status).toBe('expired');

      // One millisecond AFTER the end the same QR is still valid: the QR is valid
      // only BEFORE the end, so `end <= now` is the expired side.
      await getPrisma().event.update({
        where: { id: 'ev-001' },
        data: { end: new Date(atEnd.getTime() + 1) },
      });
      const live = (await (await verify(issued.token)).json()) as VerificationBody;
      expect(live.status).toBe('valid');
    } finally {
      vi.useRealTimers();
    }
  });

  // The repository's own null contract: a token that resolves to no row resolves
  // to `null`, never to a fabricated record. From HTTP this branch is only
  // reachable in the window between the guard's token read and the repository's
  // own pre-read (the same window that keeps the route's defence-in-depth 403
  // load-bearing), so it is pinned HERE, at the repository seam.
  it('resolves an unknown or deleted token to no row at the repository seam', async () => {
    await expect(verifyQrByToken('not-a-real-token')).resolves.toBeNull();

    const guest = await createGuestWithParty('Deleted Verify');
    const issued = await issue({ kind: 'guest', guestId: guest.id });
    const row = await getPrisma().qrToken.findFirstOrThrow({ where: { guestId: guest.id } });
    expect(await verifyQrByToken(issued.token)).not.toBeNull();

    // A deleted QR stops resolving: the row can vanish between the guard's read
    // and the repository's read.
    await getPrisma().qrToken.delete({ where: { id: row.id } });
    await expect(verifyQrByToken(issued.token)).resolves.toBeNull();
  });

  // The scope check runs in BOTH directions. A one-directional cross-event test is
  // not enough: a guard that stops resolving the token's OWN event still refuses the
  // foreign caller (it is unassigned to ev-001 either way), so it would pass — while
  // handing another event's attendee record to the wrong admin. The token's own
  // admin must succeed AND another event's admin must be refused.
  it('scopes both QR reads to the token’s own event in both directions', async () => {
    const foreignGuest = await createGuestWithParty('Evento Dos', [], 'ev-002', ADMIN_EV2);
    const foreignQr = await issue({ kind: 'guest', guestId: foreignGuest.id }, 'ev-002', ADMIN_EV2);

    // The token's OWN admin reads both artifacts.
    const owner = await verifyAs(foreignQr.token, ADMIN_EV2);
    expect(owner.status).toBe(200);
    expect(((await owner.json()) as VerificationBody).eventId).toBe('ev-002');
    expect((await imageAs(foreignQr.token, ADMIN_EV2)).status).toBe(200);

    // Another event's admin reads NEITHER — the verification leaks attendee names
    // and the image leaks the raw token.
    const outsider = await verifyAs(foreignQr.token, ADMIN_EV1);
    expect(outsider.status).toBe(403);
    expect(await outsider.json()).toEqual({ statusCode: 403, message: 'Forbidden' });
    const outsiderImage = await imageAs(foreignQr.token, ADMIN_EV1);
    expect(outsiderImage.status).toBe(403);
    expect(await outsiderImage.json()).toEqual({ statusCode: 403, message: 'Forbidden' });
  });

  // Design §5: the verification is a door read — the assigned staff of the
  // token's OWN event. An unknown token is indistinguishable from a foreign one.
  it('rejects a caller that is not assigned to the token’s event', async () => {
    const guest = await createGuestWithParty('Scope Verify');
    const issued = await issue({ kind: 'guest', guestId: guest.id });

    const foreign = await verifyAs(issued.token, ADMIN_EV2);
    expect(foreign.status).toBe(403);
    expect(await foreign.json()).toEqual({ statusCode: 403, message: 'Forbidden' });

    // The provider is not door staff: the ROLE half refuses it even though it may
    // read every event elsewhere.
    const provider = await verifyAs(issued.token, PROVIDER);
    expect(provider.status).toBe(403);

    const anonymous = await verifyAs(issued.token, undefined);
    expect(anonymous.status).toBe(401);

    const unknown = await verifyAs('not-a-real-token', SECURITY_EV1);
    expect(unknown.status).toBe(403);
    expect(await unknown.json()).toEqual({ statusCode: 403, message: 'Forbidden' });
  });

  // Design §6: the PNG is rendered SERVER-side from the absolute verify URL.
  it('returns the QR image as image/png for an issued token', async () => {
    const guest = await createGuestWithParty('Imagen Verify');
    const issued = await issue({ kind: 'guest', guestId: guest.id });

    const res = await image(issued.token);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('image/png');
    // The payload is a real PNG, not an HTML error page, and it is never cached:
    // the encoded image carries the raw token.
    expect(res.headers.get('cache-control')).toBe('no-store');

    const bytes = Buffer.from(await res.arrayBuffer());
    expect(bytes.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
    // The PNG header carries the pixel size: the spec'd render is 512x512.
    expect(bytes.readUInt32BE(16)).toBe(512);
    expect(bytes.readUInt32BE(20)).toBe(512);

    // The endpoint renders EXACTLY the call design §6 specifies, from the URL the
    // issuance returned: `QRCode.toBuffer(verifyUrl, { type:'png', width:512,
    // margin:2 })`. Comparing against that reference render pins the render
    // options AND the encoded payload in one assertion — a different width, a
    // different margin, another format or another URL all produce other bytes.
    const reference = await QRCode.toBuffer(issued.verifyUrl, {
      type: 'png',
      width: 512,
      margin: 2,
    });
    expect(bytes.equals(reference)).toBe(true);
  });

  // Design §5: the image is an admin-level artifact — the event's assigned admin
  // only, scoped to the token's own event.
  it('serves the QR image only to the assigned admin of the token’s event', async () => {
    const guest = await createGuestWithParty('Imagen Scope');
    const issued = await issue({ kind: 'guest', guestId: guest.id });

    const security = await imageAs(issued.token, SECURITY_EV1);
    expect(security.status).toBe(403);
    expect(await security.json()).toEqual({ statusCode: 403, message: 'Forbidden' });

    const foreign = await imageAs(issued.token, ADMIN_EV2);
    expect(foreign.status).toBe(403);

    const anonymous = await imageAs(issued.token, undefined);
    expect(anonymous.status).toBe(401);

    const unknown = await imageAs('not-a-real-token', ADMIN_EV1);
    expect(unknown.status).toBe(403);
  });
});
