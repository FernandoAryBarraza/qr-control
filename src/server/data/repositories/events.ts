import type { PaseEvent, SecurityGuard } from '../../../app/core/models';
import type { Prisma } from '../../../generated/prisma/client';
import type { EventScope } from '../event-scope';
import { getPrisma } from '../prisma-client';

// Prisma Event -> domain PaseEvent mapping (design §4): Prisma types never leave
// src/server/**. Fields the prototype never persisted (counters used/max, storage
// breakdown, admin contact details) are synthesized as empty/zero; `dateLabel` is
// rebuilt from `start`, and `finished` maps back to the client's `done` (1b handoff).
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
    else if (user.role === 'security') {
      security.push({ name: user.name, post: '', app: 'none', last: null });
    }
  }
  const mapped: PaseEvent = {
    id: event.id,
    status: event.status === 'finished' ? 'done' : (event.status as PaseEvent['status']),
    name: event.name,
    // `start` -> the client's display label, e.g. '14 JUN 2025 · 20:00' (UTC).
    dateLabel: `${pad2(event.start.getUTCDate())} ${MONTHS[event.start.getUTCMonth()]} ${event.start.getUTCFullYear()} · ${pad2(event.start.getUTCHours())}:${pad2(event.start.getUTCMinutes())}`,
    cd: null,
    guests: event._count.guests,
    photos: event._count.photos,
    used: 0,
    max: 0,
    br: { FOTOS: 0, VÍDEOS: 0, OTROS: 0 },
    admin: { name: adminName, email: '', phone: '', since: '' },
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
