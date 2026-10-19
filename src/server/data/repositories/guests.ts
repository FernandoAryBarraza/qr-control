import type { Guest, GuestStatus, PartyMember } from '../../../app/core/models';
import { getPrisma } from '../prisma-client';

// Prisma Guest (+ companions) -> domain Guest mapping (design §4). `active` is a
// write-path concern (BR-13 / PR-2a) and is not part of the read domain shape today.
export async function listGuests(eventId: string): Promise<readonly Guest[]> {
  const guests = await getPrisma().guest.findMany({
    where: { eventId },
    include: { companions: { select: { name: true, rel: true }, orderBy: { id: 'asc' } } },
    orderBy: { id: 'asc' },
  });
  return guests.map((guest): Guest => ({
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
  }));
}
