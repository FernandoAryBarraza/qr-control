import { randomUUID } from 'node:crypto';
import type { AdminRequest } from '../../../generated/prisma/client';
import { getPrisma } from '../prisma-client';

// Prisma AdminRequest + User + EventAssignment -> domain record mapping (spec
// req 4 / BR-05): a request creates the candidate as an UNASSIGNED admin user;
// only the provider's approval creates the EventAssignment that grants scope.
// Rejection keeps the candidate unassigned and the record queryable.

/** Workflow states — exactly pending | approved | rejected (app-layer validated). */
export type AdminRequestStatus = 'pending' | 'approved' | 'rejected';

export interface AdminRequestRecord {
  readonly id: string;
  readonly eventId: string;
  readonly candidateUserId: string;
  readonly requestedById: string;
  readonly status: string;
  readonly decidedAt: Date | null;
}

function toRecord(row: AdminRequest): AdminRequestRecord {
  return {
    id: row.id,
    eventId: row.eventId,
    candidateUserId: row.candidateUserId,
    requestedById: row.requestedById,
    status: row.status,
    decidedAt: row.decidedAt,
  };
}

export async function listAdminRequests(eventId: string): Promise<readonly AdminRequestRecord[]> {
  const rows = await getPrisma().adminRequest.findMany({
    where: { eventId },
    orderBy: { id: 'asc' },
  });
  return rows.map(toRecord);
}

export async function findAdminRequest(id: string): Promise<AdminRequestRecord | null> {
  const row = await getPrisma().adminRequest.findUnique({ where: { id } });
  return row === null ? null : toRecord(row);
}

/** Write contract for POST /api/events/:id/admin-requests. */
export interface AdminRequestWriteInput {
  readonly name: string;
}

/** Creates the candidate user (role admin, NO assignment) and the pending
 *  request atomically — pending grants no scoped access until the provider
 *  approves (spec req 4, scenario 1). */
export async function createAdminRequest(
  eventId: string,
  requestedById: string,
  input: AdminRequestWriteInput,
): Promise<AdminRequestRecord> {
  const candidateUserId = `usr-${randomUUID()}`;
  const row = await getPrisma().$transaction(async (tx) => {
    // Explicit field-by-field construction: client-supplied ids, roles, event
    // ids and statuses are never read (S8 mass-assignment contract).
    await tx.user.create({ data: { id: candidateUserId, name: input.name, role: 'admin' } });
    return tx.adminRequest.create({
      data: {
        id: `ar-${randomUUID()}`,
        eventId,
        candidateUserId,
        requestedById,
        status: 'pending',
      },
    });
  });
  return toRecord(row);
}

/** pending -> approved|rejected: the conditional update IS the state machine —
 *  a decided request never transitions again (terminal, spec req 4 scenario 3),
 *  and approval creates the candidate's event assignment in the SAME
 *  transaction (mirrors members.ts). Returns null when the row is missing or
 *  already decided; the route maps that to 404/400 respectively. */
export async function decideAdminRequest(
  id: string,
  status: Exclude<AdminRequestStatus, 'pending'>,
): Promise<AdminRequestRecord | null> {
  return getPrisma().$transaction(async (tx) => {
    const updated = await tx.adminRequest.updateMany({
      where: { id, status: 'pending' },
      data: { status, decidedAt: new Date() },
    });
    if (updated.count === 0) return null;
    const row = await tx.adminRequest.findUniqueOrThrow({ where: { id } });
    if (status === 'approved') {
      await tx.eventAssignment.create({
        data: { eventId: row.eventId, userId: row.candidateUserId },
      });
    }
    return toRecord(row);
  });
}
