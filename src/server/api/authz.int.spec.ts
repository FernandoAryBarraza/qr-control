import type { NextFunction, Request, Response } from 'express';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { seedDatabase } from '../../../prisma/seed';
// Side-effect import: registers the harness hooks (per-file temp SQLite + reset).
import { getPrisma } from '../data/prisma-client';
import { apiFetch } from '../testing/integration-harness';
import {
  canCreateEvent,
  canReadEvent,
  canReadQrImage,
  canVerifyQr,
  canWriteEvent,
  isCallerRole,
  resolveEventScope,
} from './authz';
import type { CallerRole } from './authz';
import { callerContext, resolveCallerContext } from './caller-context';

// Deterministic seed IDs (prisma/seed.ts): provider, admin + first security of ev-001.
// The role must come from these rows, never from the request — `resolveCallerContext`
// only accepts a user id, so no client-supplied role can ever reach the decision.
const PROVIDER = 'usr-001';
const ADMIN_EV1 = 'usr-002';
const SECURITY_EV1 = 'usr-003';

beforeEach(async () => {
  await seedDatabase(getPrisma());
});

describe('caller context', () => {
  it('resolves the role from the database for a trusted x-user-id', async () => {
    await expect(resolveCallerContext(PROVIDER)).resolves.toEqual({
      userId: PROVIDER,
      role: 'provider',
    });
    await expect(resolveCallerContext(ADMIN_EV1)).resolves.toEqual({
      userId: ADMIN_EV1,
      role: 'admin',
    });
    await expect(resolveCallerContext(SECURITY_EV1)).resolves.toEqual({
      userId: SECURITY_EV1,
      role: 'security',
    });
  });

  it('returns no context for an unknown or missing caller', async () => {
    await expect(resolveCallerContext('usr-999')).resolves.toBeNull();
    await expect(resolveCallerContext(undefined)).resolves.toBeNull();
  });

  it('rejects an unknown caller with 401 and never runs the handler', async () => {
    const res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn(),
      locals: {},
    } as unknown as Response;
    const next = vi.fn();
    const req = { header: () => 'usr-999' } as unknown as Request;

    await callerContext(req, res, next as unknown as NextFunction);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ statusCode: 401, message: 'Unauthorized' });
    expect(next).not.toHaveBeenCalled();
  });
});

describe('authorization decisions', () => {
  it('scopes providers to all events and others to their assignments', () => {
    expect(resolveEventScope({ userId: PROVIDER, role: 'provider' }, [])).toBe('all');
    expect(resolveEventScope({ userId: ADMIN_EV1, role: 'admin' }, ['ev-001'])).toEqual(['ev-001']);
  });

  it('allows reads only inside scope, with guest/photo content limited to admins', () => {
    const provider = { userId: PROVIDER, role: 'provider' } as const;
    const admin = { userId: ADMIN_EV1, role: 'admin' } as const;
    const security = { userId: SECURITY_EV1, role: 'security' } as const;

    expect(canReadEvent(provider, 'event', 'ev-002', [])).toBe(true);
    expect(canReadEvent(admin, 'event', 'ev-001', ['ev-001'])).toBe(true);
    expect(canReadEvent(admin, 'event', 'ev-002', ['ev-001'])).toBe(false);
    expect(canReadEvent(security, 'event', 'ev-001', ['ev-001'])).toBe(true);
    expect(canReadEvent(admin, 'content', 'ev-001', ['ev-001'])).toBe(true);
    expect(canReadEvent(security, 'content', 'ev-001', ['ev-001'])).toBe(false);
    expect(canReadEvent(admin, 'content', 'ev-002', ['ev-001'])).toBe(false);
  });

  it('accepts only the three persisted roles', () => {
    expect([isCallerRole('provider'), isCallerRole('admin'), isCallerRole('security')]).toEqual([
      true,
      true,
      true,
    ]);
    expect(isCallerRole('owner')).toBe(false);
  });

  // W5: pure table for canCreateEvent — event creation is the provider-only
  // exception (BR-02), independent of any assignment.
  it.each<[CallerRole, boolean]>([
    ['provider', true],
    ['admin', false],
    ['security', false],
  ])('canCreateEvent for a %s → %s', (role, expected) => {
    expect(canCreateEvent({ userId: 'usr-001', role })).toBe(expected);
  });

  // W4: canWriteEvent needs BOTH halves covered independently. The
  // assigned-provider/security rows prove the ROLE half (an implementation that
  // dropped the role check would return true for them); the admin rows prove the
  // ASSIGNMENT half. The route-level provider test passes on the assignment half
  // alone (the provider is never assigned), so it cannot protect the role check.
  it.each<[string, CallerRole, readonly string[], boolean]>([
    ['provider assigned to the event', 'provider', ['ev-001'], false],
    ['security assigned to the event', 'security', ['ev-001'], false],
    ['admin without the assignment', 'admin', ['ev-002'], false],
    ['admin with the assignment', 'admin', ['ev-001'], true],
  ])('canWriteEvent: %s → %s', (_label, role, ids, expected) => {
    expect(canWriteEvent({ userId: 'usr-002', role }, 'ev-001', ids)).toBe(expected);
  });

  // The QR verification is the SAME door read as the scan (design §5): admin or
  // security, assigned to the token's event. Both halves are covered independently
  // — the provider row proves the ROLE half, the admin row the ASSIGNMENT half.
  it.each<[string, CallerRole, readonly string[], boolean]>([
    ['provider assigned to the event', 'provider', ['ev-001'], false],
    ['security assigned to the event', 'security', ['ev-001'], true],
    ['admin without the assignment', 'admin', ['ev-002'], false],
    ['admin with the assignment', 'admin', ['ev-001'], true],
  ])('canVerifyQr: %s → %s', (_label, role, ids, expected) => {
    expect(canVerifyQr({ userId: 'usr-002', role }, 'ev-001', ids)).toBe(expected);
  });

  // The QR image is an ADMIN-level artifact (design §5): the security role that
  // scans at the door does not read it, and an unknown token is denied for
  // every caller.
  it.each<[string, CallerRole, readonly string[], boolean]>([
    ['provider assigned to the event', 'provider', ['ev-001'], false],
    ['security assigned to the event', 'security', ['ev-001'], false],
    ['admin without the assignment', 'admin', ['ev-002'], false],
    ['admin with the assignment', 'admin', ['ev-001'], true],
  ])('canReadQrImage: %s → %s', (_label, role, ids, expected) => {
    expect(canReadQrImage({ userId: 'usr-002', role }, 'ev-001', ids)).toBe(expected);
  });

  it('denies every QR read when the token resolves to no event', () => {
    const admin = { userId: 'usr-002', role: 'admin' } as const;
    expect(canVerifyQr(admin, null, ['ev-001'])).toBe(false);
    expect(canReadQrImage(admin, null, ['ev-001'])).toBe(false);
  });
});

describe('role spoofing', () => {
  // usr-002 is the admin assigned to ev-001 (prisma/seed.ts). The client claims the
  // provider role, which would unlock every event if any role header were trusted.
  const spoofedHeaders = {
    'x-user-id': ADMIN_EV1,
    'x-user-role': 'provider',
    'x-role': 'provider',
    'x-user-role-id': 'provider',
  };

  it('ignores client-supplied role headers and keeps the stored role', async () => {
    const list = await apiFetch('/api/events', { headers: spoofedHeaders });
    const listed = (await list.json()) as { id: string }[];

    expect(list.status).toBe(200);
    expect(listed.map((event) => event.id)).toEqual(['ev-001']);

    const forbidden = await apiFetch('/api/events/ev-002', { headers: spoofedHeaders });
    const body = await forbidden.text();

    expect(forbidden.status).toBe(403);
    expect(JSON.parse(body)).toEqual({ statusCode: 403, message: 'Forbidden' });
    expect(body).not.toContain('Boda Hernández');
  });
});
