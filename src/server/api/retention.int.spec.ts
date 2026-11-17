import { beforeEach, describe, expect, it } from 'vitest';
import { seedDatabase } from '../../../prisma/seed';
import { getPrisma } from '../data/prisma-client';
import { apiFetch } from '../testing/integration-harness';

// Spec req 13 (BR-14/BR-15) — Retention as provider-set policy. Deterministic
// seed IDs (prisma/seed.ts): usr-001 provider; usr-002 admin of ev-001; usr-003
// security of ev-001; usr-007 admin of ev-002 and NEVER assigned to ev-001.
//
// Retention is policy metadata, not a TTL: nothing in this change deletes data
// when the window closes (proposal decision 7), and retention never enters the
// QR clock — `event.end` is the only deadline the door reads (BR-09/BR-14).
const PROVIDER = 'usr-001';
const ADMIN_EV1 = 'usr-002';
const SECURITY_EV1 = 'usr-003';
const ADMIN_EV2 = 'usr-007';

const EVENT = 'ev-001';
const DEFAULT_RETENTION = 365;
const RETENTION = 730;

const hoursFromNow = (hours: number): Date => new Date(Date.now() + hours * 60 * 60 * 1000);
const hoursAgo = (hours: number): Date => new Date(Date.now() - hours * 60 * 60 * 1000);

function patch(userId: string | undefined, body: unknown, eventId = EVENT): Promise<Response> {
  return apiFetch(`/api/events/${eventId}`, {
    method: 'PATCH',
    headers:
      userId === undefined
        ? { 'content-type': 'application/json' }
        : { 'content-type': 'application/json', 'x-user-id': userId },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

function get(path: string, userId: string): Promise<Response> {
  return apiFetch(path, { headers: { 'x-user-id': userId } });
}

async function storedRetention(eventId = EVENT): Promise<number> {
  const row = await getPrisma().event.findUniqueOrThrow({ where: { id: eventId } });
  return row.retentionDays;
}

/** Rewrites the event's timeline/policy directly — the door clock, not the API under test. */
async function setEventWindow(
  data: { start?: Date; end?: Date; retentionDays?: number },
  eventId = EVENT,
): Promise<void> {
  await getPrisma().event.update({ where: { id: eventId }, data });
}

/** The event's own admin issues a standalone emergency QR and returns its raw token. */
async function issueEmergencyToken(eventId = EVENT): Promise<string> {
  const res = await apiFetch(`/api/events/${eventId}/qr`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-user-id': ADMIN_EV1 },
    body: JSON.stringify({ kind: 'emergency' }),
  });
  expect(res.status).toBe(201);
  const issued = (await res.json()) as { token: string };
  return issued.token;
}

const verifyStatus = async (token: string): Promise<string> => {
  const res = await apiFetch(`/api/qr/verify/${token}`, {
    headers: { 'x-user-id': SECURITY_EV1 },
  });
  expect(res.status).toBe(200);
  const body = (await res.json()) as { status: string };
  return body.status;
};

describe('Retention as provider-set policy (spec req 13 / BR-14, BR-15)', () => {
  beforeEach(async () => {
    await seedDatabase(getPrisma());
  });

  // Scenario 3: "GIVEN the caller is the `provider` WHEN they set a per-event
  // retention value THEN it is persisted and returned by the API".
  it('persists and returns a provider-set retention value', async () => {
    const before = await storedRetention();
    expect(before).toBe(DEFAULT_RETENTION);

    const res = await patch(PROVIDER, { retentionDays: RETENTION });

    // Status first: while `PATCH /api/events/:id` does not exist the router falls
    // through to Express' non-JSON 404, so parsing before asserting would mask
    // the missing route as a parse error instead of a contract failure.
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body).toMatchObject({ id: EVENT, retentionDays: RETENTION });
    expect(await storedRetention()).toBe(RETENTION);
  });

  // Scenario 3, second half: "an `admin` attempting to change retention is
  // rejected". Provider-only by ROLE (design §5) — the assigned admin is the
  // strongest rejection case, and the stored policy must not move.
  it('rejects an admin changing retention and leaves the stored value intact', async () => {
    const before = await storedRetention();

    const res = await patch(ADMIN_EV1, { retentionDays: RETENTION });

    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ statusCode: 403, message: 'Forbidden' });
    expect(await storedRetention()).toBe(before);
  });

  // Scenario 1: "GIVEN an event with a retention value longer than its duration
  // WHEN QRs are validated against the event timeline THEN validity depends only
  // on the event `end` datetime" — a 10-year retention must NOT keep a dead
  // event scannable: the door reads `end` alone.
  it('reads a QR as expired past event end while retention is far longer', async () => {
    await setEventWindow({ end: hoursFromNow(6), retentionDays: 3650 });
    const token = await issueEmergencyToken();

    await setEventWindow({ end: hoursAgo(1), retentionDays: 3650 });

    expect(await verifyStatus(token)).toBe('expired');
  });

  // Scenario 1, the other direction: the SHORTEST possible retention must not
  // cut validity short. `start` sits 3 days back, so any window measured from
  // the start is already stale — yet the event is still open, so the QR stays
  // valid. `end` is the only clock.
  it('keeps a QR valid before event end with the shortest retention value', async () => {
    await setEventWindow({
      start: hoursAgo(72),
      end: hoursFromNow(6),
      retentionDays: 1,
    });
    const token = await issueEmergencyToken();

    expect(await verifyStatus(token)).toBe('valid');
  });

  // Scenario 2: "GIVEN an event whose `end` has passed with a retention window
  // still open WHEN event data is queried THEN all records remain readable per
  // role scope" — retention never hides data (no TTL in this change), and the
  // role scope is unchanged: event detail for every assigned role, guest content
  // for the admin only, and a foreign admin still refused.
  it('keeps event data readable per role scope after event end while retention is open', async () => {
    await setEventWindow({ end: hoursAgo(24), retentionDays: 3650 });

    for (const userId of [PROVIDER, ADMIN_EV1, SECURITY_EV1]) {
      const detail = await get(`/api/events/${EVENT}`, userId);
      expect(detail.status).toBe(200);
      expect((await detail.json()) as Record<string, unknown>).toMatchObject({
        id: EVENT,
        guests: 14,
        photos: 14,
      });
    }

    const guests = await get(`/api/events/${EVENT}/guests`, ADMIN_EV1);
    expect(guests.status).toBe(200);
    expect(((await guests.json()) as unknown[]).length).toBe(14);

    const securityContent = await get(`/api/events/${EVENT}/guests`, SECURITY_EV1);
    expect(securityContent.status).toBe(403);

    const foreign = await get(`/api/events/${EVENT}`, ADMIN_EV2);
    expect(foreign.status).toBe(403);
  });

  // --- Route-contract pins (independent-verification follow-up) ----------------
  // Every refusal the PATCH route owes, so the permission rule and its ordering
  // cannot regress silently. The API's rejection bytes come from the shared
  // helpers (`callerContext`/`forbidden`/`badRequest`), so these assert the exact
  // payload every other route answers with.

  it('answers an unknown event id with the generic 404', async () => {
    const res = await patch(PROVIDER, { retentionDays: RETENTION }, 'ev-404');

    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ statusCode: 404, message: 'Not Found' });
  });

  it('rejects an unauthenticated policy patch with 401', async () => {
    const res = await patch(undefined, { retentionDays: RETENTION });

    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ statusCode: 401, message: 'Unauthorized' });
  });

  it('rejects a security member changing retention and leaves the value intact', async () => {
    const before = await storedRetention();

    const res = await patch(SECURITY_EV1, { retentionDays: RETENTION });

    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ statusCode: 403, message: 'Forbidden' });
    expect(await storedRetention()).toBe(before);
  });

  // Ordering pin: the ROLE decision runs before the parser, so a non-provider
  // gets the same 403 whether the body is valid, empty, out of range, made of
  // unknown fields or an array — the payload can never be used as a validation
  // oracle (spec req 3).
  it.each<[string, unknown]>([
    ['an empty body', {}],
    ['an out-of-range retention', { retentionDays: 3651 }],
    ['a body of only unknown fields', { name: 'Solo nombre' }],
    // An ARRAY parses as valid JSON, so this one does reach the route — unlike a
    // JSON primitive, which `express.json({ strict })` refuses with 400 before
    // any middleware runs.
    ['an array body', ['retentionDays']],
  ])('refuses an admin with 403 before validating %s', async (_label, body) => {
    const before = await storedRetention();

    const res = await patch(ADMIN_EV1, body);

    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ statusCode: 403, message: 'Forbidden' });
    expect(await storedRetention()).toBe(before);
  });

  // The provider's refusals are the parser's: a malformed policy patch answers
  // 400 and moves no row. Each case is a distinct branch of `parseEventPatch`.
  it.each<[string, unknown]>([
    ['an empty body', {}],
    ['a body of only unknown fields', { name: 'Solo nombre' }],
    // An ARRAY parses as valid JSON and reaches `parseEventPatch`; a JSON
    // primitive would be refused by `express.json({ strict })` first.
    ['an array body', ['retentionDays']],
    ['a non-integer retention', { retentionDays: 1.5 }],
    ['an out-of-range retention', { retentionDays: 3651 }],
    ['a null retention', { retentionDays: null }],
    ['a null status', { status: null }],
    ['an unknown status', { status: 'draft' }],
    [
      'a start/end-only body',
      { start: '2030-01-01T00:00:00.000Z', end: '2030-01-02T00:00:00.000Z' },
    ],
  ])('rejects a provider patch with %s with 400 and no row change', async (_label, body) => {
    const before = await storedRetention();

    const res = await patch(PROVIDER, body);

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ statusCode: 400, message: 'Bad Request' });
    expect(await storedRetention()).toBe(before);
  });

  // Whitelist pin: the patch is a POLICY write. `start`/`end` (the BR-09 QR
  // clock), `name` and `id` ride along in the payload and must be ignored, the
  // `done` alias lands as `finished`, and only the two policy fields move.
  it('writes only the policy fields and ignores start, end, name and id', async () => {
    const rowBefore = await getPrisma().event.findUniqueOrThrow({ where: { id: EVENT } });

    const res = await patch(PROVIDER, {
      retentionDays: RETENTION,
      status: 'done',
      start: '2030-01-01T00:00:00.000Z',
      end: '2030-01-02T00:00:00.000Z',
      name: 'HACKED',
      id: 'ev-999',
    });

    expect(res.status).toBe(200);
    expect((await res.json()) as Record<string, unknown>).toMatchObject({
      id: EVENT,
      retentionDays: RETENTION,
      status: 'done',
    });

    const rowAfter = await getPrisma().event.findUniqueOrThrow({ where: { id: EVENT } });
    expect(rowAfter.start.toISOString()).toBe(rowBefore.start.toISOString());
    expect(rowAfter.end.toISOString()).toBe(rowBefore.end.toISOString());
    expect(rowAfter.name).toBe(rowBefore.name);
    expect(rowAfter.retentionDays).toBe(RETENTION);
    expect(rowAfter.status).toBe('finished');
  });
});
