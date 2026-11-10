// Authorization decisions (BR-01 / spec req 1): pure functions over a CallerContext.
// No Express, no Prisma, no route knowledge — swapping the context source (trusted
// header today, JWT/session later) never touches these rules (design §2).
import type { EventScope } from '../data/event-scope';

export type { EventScope };

export type CallerRole = 'provider' | 'admin' | 'security';

export interface CallerContext {
  readonly userId: string;
  readonly role: CallerRole;
}

export function isCallerRole(value: string): value is CallerRole {
  return value === 'provider' || value === 'admin' || value === 'security';
}

export function resolveEventScope(caller: CallerContext, ids: readonly string[]): EventScope {
  return caller.role === 'provider' ? 'all' : ids;
}

/** Design §5: provider reads anything; others must be assigned (content: admin only). */
export function canReadEvent(
  caller: CallerContext,
  kind: 'event' | 'content',
  eventId: string,
  ids: readonly string[],
): boolean {
  if (caller.role === 'provider') return true;
  if (!ids.includes(eventId)) return false;
  return kind === 'event' || caller.role === 'admin';
}

/** BR-02: event creation is provider-only; the route validates the admin assignments. */
export function canCreateEvent(caller: CallerContext): boolean {
  return caller.role === 'provider';
}

/** BR-03/BR-04: event writes belong to the event's own admin. Provider/security are read-only. */
export function canWriteEvent(
  caller: CallerContext,
  eventId: string,
  ids: readonly string[],
): boolean {
  return caller.role === 'admin' && ids.includes(eventId);
}

/**
 * BR-05 / design §5: only the provider decides admin requests (approve/reject).
 * The caller-role check is what refuses the event's own admin self-approval —
 * the requester's identity never enters the decision (spec req 4, scenario 4).
 */
export function canDecideAdminRequest(caller: CallerContext): boolean {
  return caller.role === 'provider';
}

/**
 * Design §5: check-in is the ONE write a security member performs — the door role.
 * The token resolves its event, and the caller must be assigned to that event as
 * either its admin or its security staff. Two INDEPENDENT halves: the ROLE half
 * admits only admin/security, and the ASSIGNMENT half admits only the event the
 * token belongs to. The provider is excluded by the ROLE half, not by the
 * assignment half — it is never assigned, but the role check still holds if a
 * stray EventAssignment row ever appears for it.
 */
export function canCheckIn(
  caller: CallerContext,
  eventId: string | null,
  ids: readonly string[],
): boolean {
  if (eventId === null) return false;
  if (caller.role !== 'admin' && caller.role !== 'security') return false;
  return ids.includes(eventId);
}

/**
 * S8: the ONE object-scope decision shared by every write route (event-addressed
 * and row-addressed). `eventId` is the object's owning event; `null` means the
 * object does not exist and is denied for every caller — a nonexistent object
 * stays indistinguishable from a foreign one (spec req 3, scenario 3). The route
 * layer (`requireObjectScope` in api/index.ts) maps every denial to the same
 * byte-identical 403; no caller/assignment combination can allow a null event id.
 */
export function canWriteObject(
  caller: CallerContext,
  eventId: string | null,
  ids: readonly string[],
): boolean {
  return eventId !== null && canWriteEvent(caller, eventId, ids);
}
