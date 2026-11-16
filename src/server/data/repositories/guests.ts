import { randomUUID } from 'node:crypto';
import type { Guest, GuestStatus, PartyMember } from '../../../app/core/models';
import type { Prisma } from '../../../generated/prisma/client';
import { getPrisma } from '../prisma-client';

// Prisma Guest (+ companions) -> domain Guest mapping (design §4). `active` is the
// BR-13 soft-toggle flag; PR-2a exposes it so writes and reads share one shape.
const GUEST_INCLUDE = {
  companions: { select: { name: true, rel: true }, orderBy: { id: 'asc' } },
} as const;

type GuestRow = Prisma.GuestGetPayload<{ include: typeof GUEST_INCLUDE }>;

function toGuest(guest: GuestRow): Guest {
  return {
    id: guest.id,
    name: guest.name,
    email: guest.email,
    phone: guest.phone,
    status: guest.status as GuestStatus,
    table: guest.table,
    party: guest.companions.map((companion): PartyMember => ({
      name: companion.name,
      rel: companion.rel,
    })),
    note: guest.note,
    active: guest.active,
  };
}

export async function listGuests(eventId: string): Promise<readonly Guest[]> {
  const guests = await getPrisma().guest.findMany({
    where: { eventId },
    include: GUEST_INCLUDE,
    orderBy: { id: 'asc' },
  });
  return guests.map(toGuest);
}

/** Write contract for POST /api/events/:id/guests. The event comes from the URL. */
export interface GuestWriteInput {
  readonly name: string;
  readonly email: string;
  readonly phone: string;
  readonly table: number;
  readonly note: string;
  readonly status: GuestStatus;
  readonly party: readonly { readonly name: string; readonly rel: string }[];
}

/** Write contract for PATCH /api/guests/:id (status/active only). */
export interface GuestPatchInput {
  readonly status?: GuestStatus;
  readonly active?: boolean;
}

export async function createGuest(eventId: string, input: GuestWriteInput): Promise<Guest> {
  const guest = await getPrisma().guest.create({
    data: {
      id: `g-${randomUUID()}`,
      eventId,
      name: input.name,
      email: input.email,
      phone: input.phone,
      table: input.table,
      note: input.note,
      status: input.status,
      companions: {
        create: input.party.map((member) => ({ id: `c-${randomUUID()}`, ...member })),
      },
    },
    include: GUEST_INCLUDE,
  });
  return toGuest(guest);
}

/** The row's own eventId: object-level authorization is never read from the client. */
export async function guestEventId(id: string): Promise<string | null> {
  const guest = await getPrisma().guest.findUnique({
    where: { id },
    select: { eventId: true },
  });
  return guest === null ? null : guest.eventId;
}

export async function updateGuest(id: string, patch: GuestPatchInput): Promise<Guest> {
  const guest = await getPrisma().guest.update({
    where: { id },
    data: {
      ...(patch.status === undefined ? {} : { status: patch.status }),
      ...(patch.active === undefined ? {} : { active: patch.active }),
    },
    include: GUEST_INCLUDE,
  });
  return toGuest(guest);
}
