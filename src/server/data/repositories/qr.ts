import { createHash, randomBytes, randomUUID } from 'node:crypto';
import type { Prisma } from '../../../generated/prisma/client';
import { getWebBaseUrl } from '../config';
import { getPrisma } from '../prisma-client';

// Per-attendee QR issuance (spec req 6 / BR-07, req 9 / BR-10, req 10 / BR-11+BR-17):
// one record per guest, one per companion linked to the parent guest QR, plus
// standalone emergency records. The raw token is returned exactly once; only its
// SHA-256 hash is persisted (design §6), so a leaked DB never yields a usable QR.

export type QrKind = 'guest' | 'companion' | 'emergency';

/**
 * Write contract for POST /api/events/:id/qr. The event comes from the URL. The
 * union is exhaustive on purpose: an emergency QR cannot even carry an attendee
 * id, so "emergency ignores guestId/companionId" is a type guarantee, not a
 * runtime hope (spec req 9 / S8 mass-assignment contract).
 */
export type QrIssueInput =
  | { readonly kind: 'guest'; readonly guestId: string }
  | { readonly kind: 'companion'; readonly companionId: string }
  | { readonly kind: 'emergency' };

/** The one-time issuance response: raw token + the absolute URL it encodes. */
export interface IssuedQr {
  readonly token: string;
  readonly verifyUrl: string;
}

/** 256-bit URL-safe opaque token — no PII by construction (BR-11/BR-17). */
function newToken(): string {
  return randomBytes(32).toString('base64url');
}

/** Tokens are stored hashed and resolved by lookup; there is no reversible form. */
export function hashQrToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function verifyUrlFor(token: string): string {
  return `${getWebBaseUrl()}/verify/${token}`;
}

interface QrTarget {
  readonly guestId: string | null;
  readonly companionId: string | null;
  readonly parentQrId: string | null;
}

/**
 * Object-level denial vs. state conflict. `forbidden` covers a target that is
 * missing OR belongs to another event — both are the same 403-equivalent rejection
 * every other object-scoped write returns (spec req 3, scenario 3), so a foreign
 * row is never distinguishable from a nonexistent one. `invalid` is a state
 * conflict on a row the caller may already see (already issued, missing parent QR).
 */
type TargetResolution =
  | { readonly ok: true; readonly target: QrTarget }
  | { readonly ok: false; readonly reason: 'forbidden' | 'invalid' };

async function resolveTarget(
  tx: Prisma.TransactionClient,
  eventId: string,
  input: QrIssueInput,
): Promise<TargetResolution> {
  if (input.kind === 'emergency') {
    return { ok: true, target: { guestId: null, companionId: null, parentQrId: null } };
  }

  if (input.kind === 'guest') {
    const guest = await tx.guest.findUnique({
      where: { id: input.guestId },
      select: { eventId: true },
    });
    if (guest === null || guest.eventId !== eventId) return { ok: false, reason: 'forbidden' };
    const existing = await tx.qrToken.findFirst({
      where: { guestId: input.guestId },
      select: { id: true },
    });
    if (existing !== null) return { ok: false, reason: 'invalid' };
    return {
      ok: true,
      target: { guestId: input.guestId, companionId: null, parentQrId: null },
    };
  }

  const companion = await tx.companion.findUnique({
    where: { id: input.companionId },
    select: { guestId: true, guest: { select: { eventId: true } } },
  });
  if (companion === null || companion.guest.eventId !== eventId) {
    return { ok: false, reason: 'forbidden' };
  }

  // BR-07: a companion QR is never an alias — it must reference an existing parent
  // guest QR. The parent's raw token is returned once at issuance, so the guest QR
  // has to be issued first; issuing it here would mint an unreachable token.
  const parent = await tx.qrToken.findFirst({
    where: { guestId: companion.guestId, kind: 'guest' },
    select: { id: true },
  });
  if (parent === null) return { ok: false, reason: 'invalid' };

  const existing = await tx.qrToken.findFirst({
    where: { companionId: input.companionId },
    select: { id: true },
  });
  if (existing !== null) return { ok: false, reason: 'invalid' };

  return {
    ok: true,
    target: { guestId: null, companionId: input.companionId, parentQrId: parent.id },
  };
}

export type QrIssueOutcome =
  | { readonly ok: true; readonly issued: IssuedQr }
  | { readonly ok: false; readonly reason: 'forbidden' | 'invalid' };

export async function issueQr(eventId: string, input: QrIssueInput): Promise<QrIssueOutcome> {
  const token = newToken();
  const tokenHash = hashQrToken(token);

  const created = await getPrisma().$transaction(async (tx) => {
    const resolved = await resolveTarget(tx, eventId, input);
    if (!resolved.ok) return resolved;
    await tx.qrToken.create({
      // Explicit field-by-field construction: client-supplied ids, hashes and
      // event ids are never read (S8 mass-assignment contract).
      data: {
        id: `qr-${randomUUID()}`,
        tokenHash,
        eventId,
        kind: input.kind,
        guestId: resolved.target.guestId,
        companionId: resolved.target.companionId,
        parentQrId: resolved.target.parentQrId,
      },
    });
    return { ok: true as const };
  });

  return created.ok ? { ok: true, issued: { token, verifyUrl: verifyUrlFor(token) } } : created;
}
