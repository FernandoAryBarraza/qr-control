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
