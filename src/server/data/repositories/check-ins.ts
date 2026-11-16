import { randomUUID } from 'node:crypto';
import { getPrisma } from '../prisma-client';
import { hashQrToken } from './qr';

// Single-use check-in (spec req 7 / BR-08) and expiry at event end (req 8 / BR-09).
// The raw token is hashed and resolved by lookup; the scan record is built from the
// resolved QR row, never from the request body (S8).

/** The scan as the client sees it: the stored row plus its QR's attendee linkage. */
export interface CheckInRecord {
  readonly id: string;
  readonly eventId: string;
  readonly qrId: string;
  readonly kind: string;
  readonly guestId: string | null;
  readonly companionId: string | null;
  readonly createdAt: Date;
}

/**
 * The write contract of POST /api/check-ins. It lives HERE, next to the record it
 * produces, like every other write contract in the repository layer (the parser
 * imports it as a type instead of owning it).
 */
export interface CheckInWriteInput {
  readonly token: string;
}

export type CheckInOutcome =
  | { readonly ok: true; readonly value: CheckInRecord }
  | { readonly ok: false; readonly reason: 'unknown' | 'already_used' | 'expired' };

/** The route guard needs the token's event BEFORE authorizing: hash + lookup only. */
export async function qrEventIdByToken(token: string): Promise<string | null> {
  const qr = await getPrisma().qrToken.findUnique({
    where: { tokenHash: hashQrToken(token) },
    select: { eventId: true },
  });
  return qr?.eventId ?? null;
}

/**
 * Consumes the QR and records the check-in in ONE transaction. The conditional
 * `consumedAt: null -> now()` update IS the single-use gate — there is no
 * read-then-write shortcut above it: of two scans of the same token exactly one
 * affects a row, and the loser gets `already_used` without a second record
 * (design §6). Every kind — guest, companion, emergency — expires at `event.end`;
 * an expired attempt never touches `consumedAt`.
 */
export async function checkInByToken(token: string): Promise<CheckInOutcome> {
  const qr = await getPrisma().qrToken.findUnique({
    where: { tokenHash: hashQrToken(token) },
    select: {
      id: true,
      eventId: true,
      kind: true,
      guestId: true,
      companionId: true,
      consumedAt: true,
      event: { select: { end: true } },
    },
  });
  if (qr === null) return { ok: false, reason: 'unknown' };

  // Expiry (spec req 8): a QR is valid only BEFORE the owning event's end, and an
  // expired attempt never consumes the token — so the expiry is decided BEFORE the
  // claim. A token that was ALREADY consumed is a reuse (req 7, scenario "Reuse is
  // rejected": ANY later scan of a consumed token is rejected as already-used), and
  // req 8's expiry scenario is scoped to a valid UNCONSUMED QR — so a consumed
  // token whose event has ended reads as already-used, not as expired.
  //
  // The `consumedAt` read above is consulted ONLY here. For a live event the claim
  // below is the single-use authority: a read-then-write shortcut would let a
  // stale read decide reuse instead of the conditional update.
  if (qr.event.end.getTime() <= Date.now()) {
    if (qr.consumedAt !== null) return { ok: false, reason: 'already_used' };
    return { ok: false, reason: 'expired' };
  }

  const claimed = await getPrisma().$transaction(async (tx) => {
    const claim = await tx.qrToken.updateMany({
      where: { id: qr.id, consumedAt: null },
      data: { consumedAt: new Date() },
    });
    if (claim.count === 0) return null;

    return tx.checkIn.create({
      data: { id: `ci-${randomUUID()}`, eventId: qr.eventId, qrId: qr.id },
      select: { id: true, eventId: true, qrId: true, createdAt: true },
    });
  });
  // The claim affected no row: the token was already consumed, or its row was
  // deleted mid-request — the claim cannot tell the two apart, and neither records
  // a check-in.
  if (claimed === null) return { ok: false, reason: 'already_used' };

  return {
    ok: true,
    value: {
      ...claimed,
      kind: qr.kind,
      guestId: qr.guestId,
      companionId: qr.companionId,
    },
  };
}
