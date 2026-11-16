import { randomUUID } from 'node:crypto';
import { getPrisma } from '../prisma-client';

// Prisma EventAssignment + User -> domain member mapping (spec req 5): an event's
// permission holders are exactly its current admins and security staff.

/** Permission holder of an event (spec req 5, scenario 3). */
export interface EventMember {
  readonly userId: string;
  readonly name: string;
  readonly role: string;
}

export async function listMembers(eventId: string): Promise<readonly EventMember[]> {
  const assignments = await getPrisma().eventAssignment.findMany({
    where: { eventId },
    include: { user: { select: { id: true, name: true, role: true } } },
    orderBy: { userId: 'asc' },
  });
  return assignments.map(({ user }) => ({ userId: user.id, name: user.name, role: user.role }));
}

/** Write contract for POST /api/events/:id/members. The role is fixed to
 *  `security` by the parser; the event comes from the URL (BR-06). */
export interface MemberWriteInput {
  readonly name: string;
}

/** Creates the security user and its event assignment atomically (req 5, scenario 1). */
export async function createSecurityMember(
  eventId: string,
  input: MemberWriteInput,
): Promise<EventMember> {
  const userId = `usr-${randomUUID()}`;
  const user = await getPrisma().$transaction(async (tx) => {
    // Explicit field-by-field construction: a client-supplied id, role or eventId
    // is never read — the server decides all three (S8 mass-assignment contract).
    const created = await tx.user.create({
      data: { id: userId, name: input.name, role: 'security' },
    });
    await tx.eventAssignment.create({ data: { eventId, userId } });
    return created;
  });
  return { userId: user.id, name: user.name, role: user.role };
}
