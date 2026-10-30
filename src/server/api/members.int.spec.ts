import { beforeEach, describe, expect, it } from 'vitest';
import { seedDatabase } from '../../../prisma/seed';
import { getPrisma } from '../data/prisma-client';
import { apiFetch } from '../testing/integration-harness';

// Deterministic seed IDs (prisma/seed.ts): usr-001 is the provider; usr-002 admins
// ev-001 (security usr-003..usr-006); usr-007 admins ev-002 (security usr-008..009).
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

describe('event members (spec req 5, all scenarios / BR-06)', () => {
  beforeEach(async () => {
    await seedDatabase(getPrisma());
  });

  it('creates a security user scoped to the own event, usable as trusted caller context', async () => {
    const res = await request('POST', '/api/events/ev-001/members', ADMIN_EV1, {
      name: 'Vigía Norte',
      role: 'security',
    });

    expect(res.status).toBe(201);
    const created = (await res.json()) as Record<string, unknown>;
    expect(created['name']).toBe('Vigía Norte');
    expect(created['role']).toBe('security');
    expect(String(created['userId'])).toMatch(/^usr-/); // server-generated id

    const userId = String(created['userId']);
    const user = await getPrisma().user.findUniqueOrThrow({ where: { id: userId } });
    expect(user).toMatchObject({ name: 'Vigía Norte', role: 'security' });
    const assignment = await getPrisma().eventAssignment.findUniqueOrThrow({
      where: { eventId_userId: { eventId: 'ev-001', userId } },
    });
    expect(assignment.eventId).toBe('ev-001');

    // The record is usable as trusted caller context: the header resolves through
    // the DATABASE role and the new security user is assigned to event A only.
    const events = await request('GET', '/api/events', userId);
    expect(events.status).toBe(200);
    expect(((await events.json()) as { id: string }[]).map((event) => event.id)).toEqual([
      'ev-001',
    ]);
  });

  it('never reads client-supplied ids, roles or event ids on member creation', async () => {
    const res = await request('POST', '/api/events/ev-001/members', ADMIN_EV1, {
      name: 'Vigía Sur',
      role: 'security',
      id: 'usr-hacked',
      userId: 'usr-hacked',
      eventId: 'ev-002',
    });

    expect(res.status).toBe(201);
    const created = (await res.json()) as Record<string, unknown>;
    const userId = String(created['userId']);
    expect(userId).toMatch(/^usr-/);
    expect(userId).not.toBe('usr-hacked');
    const assignment = await getPrisma().eventAssignment.findUniqueOrThrow({
      where: { eventId_userId: { eventId: 'ev-001', userId } },
    });
    expect(assignment.eventId).toBe('ev-001'); // the URL event id, never the body's
  });

  it('rejects direct member creation by the provider (req 5, scenario 2)', async () => {
    const usersBefore = await getPrisma().user.count();
    const assignmentsBefore = await getPrisma().eventAssignment.count();

    for (const role of ['security', 'admin']) {
      const res = await request('POST', '/api/events/ev-001/members', PROVIDER, {
        name: 'Directa',
        role,
      });
      expect(res.status).toBe(403);
      expect(await res.json()).toEqual({ statusCode: 403, message: 'Forbidden' });
    }

    expect(await getPrisma().user.count()).toBe(usersBefore);
    expect(await getPrisma().eventAssignment.count()).toBe(assignmentsBefore);
  });

  it('rejects a second-admin member outside the BR-05 approval flow, even for the own admin', async () => {
    const usersBefore = await getPrisma().user.count();

    for (const role of ['admin', 'provider', 'not-a-role']) {
      const res = await request('POST', '/api/events/ev-001/members', ADMIN_EV1, {
        name: 'Segunda Admin',
        role,
      });
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ statusCode: 400, message: 'Bad Request' });
    }

    expect(await getPrisma().user.count()).toBe(usersBefore);
  });

  it('returns the permission holders of any event to the provider (req 5, scenario 3)', async () => {
    const res = await request('GET', '/api/events/ev-002/members', PROVIDER);

    expect(res.status).toBe(200);
    const members = (await res.json()) as { userId: string; name: string; role: string }[];
    expect(members.map((member) => member.userId)).toEqual(['usr-007', 'usr-008', 'usr-009']);
    expect(members).toContainEqual({ userId: 'usr-007', name: 'Diego Riva', role: 'admin' });
    expect(members.every((member) => ['admin', 'security'].includes(member.role))).toBe(true);
  });

  it('returns the member list to the assigned admin of the event', async () => {
    const res = await request('GET', '/api/events/ev-001/members', ADMIN_EV1);

    expect(res.status).toBe(200);
    const members = (await res.json()) as { userId: string; role: string }[];
    expect(members.map((member) => member.userId)).toEqual([
      'usr-002',
      'usr-003',
      'usr-004',
      'usr-005',
      'usr-006',
    ]);
    expect(members.filter((member) => member.role === 'admin')).toHaveLength(1);
    expect(members.filter((member) => member.role === 'security')).toHaveLength(4);
  });

  it('rejects members reads outside the callers event scope (spec req 3)', async () => {
    const foreign = await request('GET', '/api/events/ev-001/members', ADMIN_EV2);
    const unknown = await request('GET', '/api/events/ev-999/members', ADMIN_EV2);
    const security = await request('GET', '/api/events/ev-001/members', SECURITY_EV1);

    expect(foreign.status).toBe(403);
    const foreignBody = await foreign.json();
    expect(foreignBody).toEqual({ statusCode: 403, message: 'Forbidden' });
    expect(unknown.status).toBe(foreign.status);
    expect(await unknown.json()).toEqual(foreignBody);
    expect(security.status).toBe(403); // design §5: provider any; assigned admin only
  });

  it('rejects member creation for another event without creating rows', async () => {
    const res = await request('POST', '/api/events/ev-002/members', ADMIN_EV1, {
      name: 'Intrusa',
      role: 'security',
    });

    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ statusCode: 403, message: 'Forbidden' });
    expect(await getPrisma().user.count({ where: { name: 'Intrusa' } })).toBe(0);
  });

  it('rejects member writes from security and requests without a caller context', async () => {
    const create = await request('POST', '/api/events/ev-001/members', SECURITY_EV1, {
      name: 'No Autorizada',
      role: 'security',
    });
    const anonymousRead = await request('GET', '/api/events/ev-001/members', undefined);
    const anonymousWrite = await request('POST', '/api/events/ev-001/members', undefined, {
      name: 'Nadie',
      role: 'security',
    });

    expect(create.status).toBe(403);
    expect(anonymousRead.status).toBe(401);
    expect(anonymousWrite.status).toBe(401);
  });
});
