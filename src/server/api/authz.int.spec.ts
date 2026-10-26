import type { NextFunction, Request, Response } from 'express';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { seedDatabase } from '../../../prisma/seed';
// Side-effect import: registers the harness hooks (per-file temp SQLite + reset).
import { getPrisma } from '../data/prisma-client';
import { apiFetch } from '../testing/integration-harness';
import { canCreateEvent, canReadEvent, isCallerRole, resolveEventScope } from './authz';
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
