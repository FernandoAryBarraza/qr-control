import { getPrisma } from '../prisma-client';
import { hashQrToken, type QrKind } from './qr';

// QR verification read (spec req 6, scenario 2 / BR-07; spec req 10, scenario 2 /
// BR-11): resolves an issued raw token to the attendee it identifies and to the QR's
// validity state. The raw token is hashed and resolved by lookup — the same single
// definition of the token format the issuance path uses.

export interface QrVerificationGuest {
  readonly id: string;
  readonly name: string;
  readonly table: number;
}

export interface QrVerificationCompanion {
  readonly id: string;
  readonly name: string;
  readonly rel: string;
}

/** valid = usable now; used = already consumed (req 7); expired = past event.end (req 8). */
export type QrVerificationStatus = 'valid' | 'used' | 'expired';

export interface QrVerification {
  readonly qrId: string;
  readonly eventId: string;
  readonly kind: QrKind;
  readonly status: QrVerificationStatus;
  readonly guest: QrVerificationGuest | null;
  readonly companion: QrVerificationCompanion | null;
  readonly parentGuest: QrVerificationGuest | null;
}

/**
 * Resolves the token to the attendee record and the validity state. `null` means the
 * token resolves to no row at all — the route answers the same generic denial it
 * gives a foreign token, so a token can never be probed (spec req 3).
 */
export async function verifyQrByToken(token: string): Promise<QrVerification | null> {
  const qr = await getPrisma().qrToken.findUnique({
    where: { tokenHash: hashQrToken(token) },
    select: {
      id: true,
      eventId: true,
      kind: true,
      consumedAt: true,
      event: { select: { end: true } },
      guest: { select: { id: true, name: true, table: true } },
      companion: {
        select: {
          id: true,
          name: true,
          rel: true,
          // The parent guest of a companion IS its guest: BR-07 links the companion
          // QR to the parent guest's QR record, and issuance only links them when
          // both belong to the same guest.
          guest: { select: { id: true, name: true, table: true } },
        },
      },
    },
  });
  if (qr === null) return null;

  // The same precedence the scan uses (req 7 / req 8): a consumed QR reads as USED
  // even after the event ended — reuse is scoped to no time, while the expiry
  // scenario is scoped to a valid UNCONSUMED QR.
  const status: QrVerificationStatus =
    qr.consumedAt !== null ? 'used' : qr.event.end.getTime() <= Date.now() ? 'expired' : 'valid';

  return {
    qrId: qr.id,
    eventId: qr.eventId,
    kind: qr.kind as QrKind,
    status,
    guest: qr.guest,
    companion:
      qr.companion === null
        ? null
        : { id: qr.companion.id, name: qr.companion.name, rel: qr.companion.rel },
    parentGuest: qr.companion?.guest ?? null,
  };
}
