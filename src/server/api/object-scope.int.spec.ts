import { describe, expect, it } from 'vitest';
import { canWriteObject } from './authz';
import type { CallerRole } from './authz';

// S8: pure decision table for the object-scope helper shared by every write
// route (event-addressed and row-addressed). Each guard half needs rows that
// fail independently: EXISTENCE (a nonexistent object resolves to a null event
// id), ROLE (provider/security stay read-only even when assigned) and
// ASSIGNMENT (an admin without the event is denied). Every `false` row must be
// answered by the route layer with the same byte-identical 403 — an out-of-scope
// object is indistinguishable from a nonexistent one (spec req 3, scenario 3).
// That mapping lives in `requireObjectScope` (api/index.ts); both guest-write
// routes are pinned end to end by scope.int.spec.ts alone (events-write covers
// POST /events only).
describe('object-scope decision (canWriteObject)', () => {
  it.each<[string, CallerRole, string | null, readonly string[], boolean]>([
    // EXISTENCE half — nonexistent object ≡ foreign object, denied for everyone.
    // (Dropping the literal `eventId !== null` guard additionally fails `tsc`:
    // `canWriteEvent` only accepts a string event id.)
    ['nonexistent object, assigned admin', 'admin', null, ['ev-001'], false],
    ['nonexistent object, unassigned admin', 'admin', null, [], false],
    ['nonexistent object, assigned security', 'security', null, ['ev-001'], false],
    ['nonexistent object, assigned provider', 'provider', null, ['ev-001'], false],
    // ROLE half — read-only roles are denied even when assigned to the event.
    ['provider assigned to the event', 'provider', 'ev-001', ['ev-001'], false],
    ['security assigned to the event', 'security', 'ev-001', ['ev-001'], false],
    // ASSIGNMENT half — an admin of another event is denied.
    ['admin without the assignment', 'admin', 'ev-001', ['ev-002'], false],
    // Baseline — the owning admin passes.
    ['admin with the assignment', 'admin', 'ev-001', ['ev-001'], true],
  ])('canWriteObject: %s → %s', (_label, role, eventId, ids, expected) => {
    expect(canWriteObject({ userId: 'usr-002', role }, eventId, ids)).toBe(expected);
  });
});
