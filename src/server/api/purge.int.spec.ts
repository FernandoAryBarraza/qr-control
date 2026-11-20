import { beforeEach, describe, expect, it } from 'vitest';
import { seedDatabase } from '../../../prisma/seed';
import { getPrisma } from '../data/prisma-client';
import { apiFetch } from '../testing/integration-harness';

// Spec req 11 (BR-12/BR-13) — provider-only hard delete with cascade.
// Deterministic seed ids (prisma/seed.ts / core/seed-data.ts): usr-001 provider,
// usr-010 admin of ev-003 (status `finished` from client `done`), usr-011 its
// security, usr-002 admin of ev-001 (status `active`, end already in the past).
const PROVIDER = 'usr-001';
const ADMIN_FINISHED = 'usr-010';
const SECURITY_FINISHED = 'usr-011';
const ADMIN_UNFINISHED = 'usr-002';
const FINISHED_EVENT = 'ev-003';
const UNFINISHED_EVENT = 'ev-001';

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

type Counts = {
  events: number;
  guests: number;
  companions: number;
  photos: number;
  checkIns: number;
  qrs: number;
  adminRequests: number;
  assignments: number;
};

/**
 * Companion has no `eventId`, so it is counted by the row ids captured BEFORE
 * the delete. Deriving them from the guests still present after the purge would
 * make the assertion vacuous (`in: []` always returns zero, even with orphans).
 */
async function companionIdsFor(eventId: string): Promise<readonly string[]> {
  const prisma = getPrisma();
  const guestIds = (await prisma.guest.findMany({ where: { eventId }, select: { id: true } })).map(
    (guest) => guest.id,
  );
  return (
    await prisma.companion.findMany({ where: { guestId: { in: guestIds } }, select: { id: true } })
  ).map((companion) => companion.id);
}

async function counts(eventId: string, companionIds: readonly string[]): Promise<Counts> {
  const prisma = getPrisma();
  const guestIds = (await prisma.guest.findMany({ where: { eventId }, select: { id: true } })).map(
    (guest) => guest.id,
  );
  return {
    events: await prisma.event.count({ where: { id: eventId } }),
    guests: guestIds.length,
    companions: await prisma.companion.count({ where: { id: { in: [...companionIds] } } }),
    photos: await prisma.photo.count({ where: { eventId } }),
    checkIns: await prisma.checkIn.count({ where: { eventId } }),
    qrs: await prisma.qrToken.count({ where: { eventId } }),
    adminRequests: await prisma.adminRequest.count({ where: { eventId } }),
    assignments: await prisma.eventAssignment.count({ where: { eventId } }),
  };
}

const EMPTY: Counts = {
  events: 0,
  guests: 0,
  companions: 0,
  photos: 0,
  checkIns: 0,
  qrs: 0,
  adminRequests: 0,
  assignments: 0,
};

/**
 * Fills the finished event with one row of EVERY event-scoped entity through the
 * public API. Its seed end is in the past, so it is moved forward only for the
 * check-in: BR-12 gates the purge on `status`, never on dates.
 */
async function populateFinishedEvent(): Promise<{ guestId: string }> {
  await getPrisma().event.update({
    where: { id: FINISHED_EVENT },
    data: { end: new Date(Date.now() + 60 * 60 * 1000) },
  });

  const guestRes = await request('POST', `/api/events/${FINISHED_EVENT}/guests`, ADMIN_FINISHED, {
    name: 'Purga Guest',
    email: 'purga@example.com',
    phone: '+34 600 000 000',
    table: 1,
    party: [{ name: 'Purga Companion', rel: 'partner' }],
  });
  expect(guestRes.status).toBe(201);
  const guest = (await guestRes.json()) as { id: string };

  const photoRes = await request('POST', `/api/events/${FINISHED_EVENT}/photos`, ADMIN_FINISHED, {
    url: 'https://example.com/purga.jpg',
    author: 'Purga Author',
  });
  expect(photoRes.status).toBe(201);

  const qrRes = await request('POST', `/api/events/${FINISHED_EVENT}/qr`, ADMIN_FINISHED, {
    kind: 'emergency',
  });
  expect(qrRes.status).toBe(201);
  const issued = (await qrRes.json()) as { token: string };

  const checkInRes = await request('POST', '/api/check-ins', SECURITY_FINISHED, {
    token: issued.token,
  });
  expect(checkInRes.status).toBe(201);

  const adminRequestRes = await request(
    'POST',
    `/api/events/${FINISHED_EVENT}/admin-requests`,
    ADMIN_FINISHED,
    { name: 'Purga Candidate' },
  );
  expect(adminRequestRes.status).toBe(201);

  return { guestId: guest.id };
}

describe('Provider hard delete with cascade (spec req 11 / BR-12, BR-13)', () => {
  beforeEach(async () => {
    await seedDatabase(getPrisma());
  });

  it('purges every scoped row and keeps User rows when the provider deletes a finished event', async () => {
    await populateFinishedEvent();
    const companionIds = await companionIdsFor(FINISHED_EVENT);
    expect(companionIds).toHaveLength(1);
    const before = await counts(FINISHED_EVENT, companionIds);
    expect(before).toEqual({
      events: 1,
      guests: 1,
      companions: 1,
      photos: 1,
      checkIns: 1,
      qrs: 1,
      adminRequests: 1,
      assignments: 4,
    });
    const usersBefore = await getPrisma().user.count();

    const res = await request('DELETE', `/api/events/${FINISHED_EVENT}`, PROVIDER);

    expect(res.status).toBe(204);
    expect(await counts(FINISHED_EVENT, companionIds)).toEqual(EMPTY);
    expect(await getPrisma().user.count()).toBe(usersBefore);
    // The other events are untouched by the cascade.
    expect(await getPrisma().event.count()).toBe(2);
    expect(await getPrisma().photo.count()).toBe(14);
  });

  it('rejects the provider deleting an unfinished event even when its end has passed', async () => {
    const event = await getPrisma().event.findUniqueOrThrow({ where: { id: UNFINISHED_EVENT } });
    expect(event.status).not.toBe('finished');
    expect(event.end.getTime()).toBeLessThan(Date.now());
    const companionIds = await companionIdsFor(UNFINISHED_EVENT);
    const before = await counts(UNFINISHED_EVENT, companionIds);

    const res = await request('DELETE', `/api/events/${UNFINISHED_EVENT}`, PROVIDER);

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ statusCode: 400, message: 'Bad Request' });
    expect(await counts(UNFINISHED_EVENT, companionIds)).toEqual(before);
  });

  it('purges a finished event whose end is already in the past', async () => {
    // No setup rewrite here: the seed's ev-003 is `finished` with a 2025 end.
    // A gate of `status === 'finished' && end > now` would fail this case.
    const event = await getPrisma().event.findUniqueOrThrow({ where: { id: FINISHED_EVENT } });
    expect(event.status).toBe('finished');
    expect(event.end.getTime()).toBeLessThan(Date.now());

    const res = await request('DELETE', `/api/events/${FINISHED_EVENT}`, PROVIDER);

    expect(res.status).toBe(204);
    expect(await getPrisma().event.findUnique({ where: { id: FINISHED_EVENT } })).toBeNull();
    expect(await getPrisma().eventAssignment.count({ where: { eventId: FINISHED_EVENT } })).toBe(0);
  });

  it('rejects every admin delete attempt with all records intact', async () => {
    const { guestId } = await populateFinishedEvent();
    const companionIds = await companionIdsFor(FINISHED_EVENT);
    const unfinishedCompanionIds = await companionIdsFor(UNFINISHED_EVENT);
    const before = await counts(FINISHED_EVENT, companionIds);
    const unfinishedBefore = await counts(UNFINISHED_EVENT, unfinishedCompanionIds);

    for (const [path, caller] of [
      [`/api/events/${FINISHED_EVENT}`, ADMIN_FINISHED],
      [`/api/events/${UNFINISHED_EVENT}`, ADMIN_UNFINISHED],
      [`/api/guests/${guestId}`, ADMIN_FINISHED],
      ['/api/photos/ph-001', ADMIN_UNFINISHED],
    ] as const) {
      const res = await request('DELETE', path, caller);
      // The event path now exists and refuses admins by role; row-addressed
      // DELETE routes must never be registered (BR-13).
      expect(res.status).toBe(path.startsWith('/api/events/') ? 403 : 404);
    }

    expect(await counts(FINISHED_EVENT, companionIds)).toEqual(before);
    expect(await counts(UNFINISHED_EVENT, unfinishedCompanionIds)).toEqual(unfinishedBefore);
  });

  it('answers an unknown event id with the generic 404 for the provider', async () => {
    const res = await request('DELETE', '/api/events/ev-404', PROVIDER);

    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ statusCode: 404, message: 'Not Found' });
  });

  it('refuses admin and security on an unknown id with the same 403', async () => {
    // The role gate runs before any lookup: no existence oracle for non-provider callers.
    for (const caller of [ADMIN_FINISHED, SECURITY_FINISHED]) {
      const res = await request('DELETE', '/api/events/ev-404', caller);

      expect(res.status).toBe(403);
      expect(await res.json()).toEqual({ statusCode: 403, message: 'Forbidden' });
    }
  });

  it('refuses an unauthenticated delete before touching the event', async () => {
    const companionIds = await companionIdsFor(FINISHED_EVENT);
    const before = await counts(FINISHED_EVENT, companionIds);

    const res = await request('DELETE', `/api/events/${FINISHED_EVENT}`, undefined);

    expect(res.status).toBe(401);
    expect(await counts(FINISHED_EVENT, companionIds)).toEqual(before);
  });

  it('refuses the assigned security role as well as the admin', async () => {
    const companionIds = await companionIdsFor(FINISHED_EVENT);
    const before = await counts(FINISHED_EVENT, companionIds);

    const res = await request('DELETE', `/api/events/${FINISHED_EVENT}`, SECURITY_FINISHED);

    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ statusCode: 403, message: 'Forbidden' });
    expect(await counts(FINISHED_EVENT, companionIds)).toEqual(before);
  });
});
