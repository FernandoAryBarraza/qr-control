import { randomUUID } from 'node:crypto';
import type { PaseEvent, SecurityGuard } from '../../../app/core/models';
import type { Prisma } from '../../../generated/prisma/client';
import type { EventScope } from '../event-scope';
import { getPrisma } from '../prisma-client';

// Prisma Event -> domain PaseEvent mapping (design §4): Prisma types never leave
// src/server/**. `dateLabel` is rebuilt from `start`, and `finished` maps
// back to the client's `done` (1b handoff).
//
// Four display-only families are NOT mapped, because the database does not own
// them and no service exists yet: the storage counters (used/max/br — not
// stored, design §3), the countdown (cd — not stored), the admin contact
// details (the `User` model has no email/phone column) and the guard details
// (post/app/last — the scanner service does not exist yet). Synthesizing
// empties here is what made the provider view render blank lines and count
// 0 scanners online; the client resolves all four from its own display mock
// (`src/app/core/event-display.ts`).
const MONTHS = 'JAN FEB MAR APR MAY JUN JUL AUG SEP OCT NOV DEC'.split(' ');
const pad2 = (value: number): string => String(value).padStart(2, '0');

const EVENT_INCLUDE = {
  assignments: { include: { user: { select: { name: true, role: true } } } },
  _count: { select: { guests: true, photos: true } },
} as const;

type EventRow = Prisma.EventGetPayload<{ include: typeof EVENT_INCLUDE }>;

function toPaseEvent(event: EventRow): PaseEvent {
  const security: SecurityGuard[] = [];
  let adminName = '';
  for (const { user } of event.assignments) {
    if (user.role === 'admin') adminName = user.name;
    else if (user.role === 'security') security.push({ name: user.name });
  }
  const mapped: PaseEvent = {
    id: event.id,
    status: event.status === 'finished' ? 'done' : (event.status as PaseEvent['status']),
    name: event.name,
    // `start` -> the client's display label, e.g. '14 JUN 2025 · 20:00' (UTC).
    dateLabel: `${pad2(event.start.getUTCDate())} ${MONTHS[event.start.getUTCMonth()]} ${event.start.getUTCFullYear()} · ${pad2(event.start.getUTCHours())}:${pad2(event.start.getUTCMinutes())}`,
    guests: event._count.guests,
    photos: event._count.photos,
    admin: { name: adminName },
    security,
  };
  return event.note === null ? mapped : { ...mapped, note: event.note };
}

/** Events visible to the caller: all events for 'all', otherwise the scoped IDs. */
export async function listEvents(scope: EventScope): Promise<readonly PaseEvent[]> {
  const where = scope === 'all' ? {} : { id: { in: [...scope] } };
  const events = await getPrisma().event.findMany({
    where,
    include: EVENT_INCLUDE,
    orderBy: { start: 'asc' },
  });
  return events.map(toPaseEvent);
}

export async function findEvent(id: string): Promise<PaseEvent | null> {
  const event = await getPrisma().event.findUnique({ where: { id }, include: EVENT_INCLUDE });
  return event === null ? null : toPaseEvent(event);
}

/** Event IDs the user is assigned to (empty for unassigned users). */
export async function assignedEventIds(userId: string): Promise<readonly string[]> {
  const rows = await getPrisma().eventAssignment.findMany({
    where: { userId },
    select: { eventId: true },
  });
  return rows.map((row) => row.eventId);
}

/** Write contract for POST /api/events (BR-02). Display-only fields never enter it. */
export interface EventWriteInput {
  readonly name: string;
  readonly start: Date;
  readonly end: Date;
  readonly retentionDays: number;
  readonly note: string | null;
  readonly status: string;
  readonly admins: readonly string[];
}

/** Users that exist AND hold the admin role — the only valid creation assignments. */
export async function existingAdminIds(ids: readonly string[]): Promise<readonly string[]> {
  const users = await getPrisma().user.findMany({
    where: { id: { in: [...ids] }, role: 'admin' },
    select: { id: true },
  });
  return users.map((user) => user.id);
}

/** Creates the event and its admin assignments atomically, then returns the read shape. */
export async function createEvent(input: EventWriteInput): Promise<PaseEvent> {
  const event = await getPrisma().event.create({
    data: {
      id: `ev-${randomUUID()}`,
      name: input.name,
      status: input.status,
      start: input.start,
      end: input.end,
      retentionDays: input.retentionDays,
      note: input.note,
      assignments: { create: input.admins.map((userId) => ({ userId })) },
    },
    include: EVENT_INCLUDE,
  });
  return toPaseEvent(event);
}

/** PATCH /api/events/:id write contract — the two provider-owned event fields. */
export interface EventPatchInput {
  readonly retentionDays?: number;
  readonly status?: string;
}

/**
 * The PATCH response: the normal read shape plus `retentionDays`, the policy
 * field this route owns (BR-15). The list/detail GETs keep their current shape —
 * retention is not part of the client's display contract yet, so it is returned
 * where it is written instead of leaking into every read.
 */
export interface EventPolicy extends PaseEvent {
  readonly retentionDays: number;
}

/**
 * Applies a provider policy patch (BR-14/BR-15 + lifecycle status) and returns
 * the updated read shape. `null` means the id does not exist, so the route can
 * answer 404 without ever echoing row contents (spec req 3).
 */
export async function updateEventPolicy(
  id: string,
  input: EventPatchInput,
): Promise<EventPolicy | null> {
  const data = {
    ...(input.retentionDays === undefined ? {} : { retentionDays: input.retentionDays }),
    ...(input.status === undefined ? {} : { status: input.status }),
  };
  return getPrisma().$transaction(async (tx) => {
    const { count } = await tx.event.updateMany({ where: { id }, data });
    if (count === 0) return null;
    const row = await tx.event.findUniqueOrThrow({ where: { id }, include: EVENT_INCLUDE });
    return { ...toPaseEvent(row), retentionDays: row.retentionDays };
  });
}

export type PurgeOutcome = 'deleted' | 'not_found' | 'not_finished';

/**
 * BR-12: deletes a FINISHED event; Prisma's onDelete: Cascade removes every
 * event-scoped row (guests, companions, photos, check-ins, QRs, admin requests,
 * assignments) while `User` rows survive. The status gate lives in the DELETE
 * predicate itself, so a concurrent policy patch cannot slip a non-finished
 * event through a check-then-delete race.
 */
export async function purgeEvent(id: string): Promise<PurgeOutcome> {
  return getPrisma().$transaction(async (tx) => {
    const { count } = await tx.event.deleteMany({ where: { id, status: 'finished' } });
    if (count > 0) return 'deleted';
    const row = await tx.event.findUnique({ where: { id }, select: { id: true } });
    return row === null ? 'not_found' : 'not_finished';
  });
}
