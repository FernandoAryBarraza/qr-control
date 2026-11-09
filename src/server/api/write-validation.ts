import type { GuestStatus, PhotoState } from '../../app/core/models';
import type {
  AdminRequestStatus,
  AdminRequestWriteInput,
} from '../data/repositories/admin-requests';
import type { EventWriteInput } from '../data/repositories/events';
import type { GuestPatchInput, GuestWriteInput } from '../data/repositories/guests';
import type { MemberWriteInput } from '../data/repositories/members';
import type { PhotoPatchInput, PhotoWriteInput } from '../data/repositories/photos';
import type { QrIssueInput, QrKind } from '../data/repositories/qr';

// App-layer payload validation (spec req 16, scenario 3): statuses stay strings in
// SQLite, so write contracts are parsed here before Prisma sees them. The parsers
// are pure and return a result instead of throwing, which keeps route handlers free
// of try/catch and keeps 400 payloads generic.
export type ParseResult<T> = { readonly ok: true; readonly value: T } | { readonly ok: false };

const FAIL: ParseResult<never> = { ok: false };

export const DEFAULT_EVENT_STATUS = 'upcoming';
export const DEFAULT_RETENTION_DAYS = 365;
// W2: sane int4-safe bounds. `retentionDays` and `table` land on SQLite INTEGER
// columns that would silently accept any 64-bit value and 500 on Postgres int4.
export const MAX_RETENTION_DAYS = 3650; // 10 years — generous for event retention
export const MAX_TABLE = 999;
// W2 (photo columns): `sizeKb`/`height` are nullable int4 columns with the same
// int4-safety rule — SQLite would silently accept any 64-bit value.
export const MAX_SIZE_KB = 10_000_000; // 10 GB — generous for a single photo (demo ~3 MB)
export const MAX_HEIGHT = 100_000; // px — generous single-image dimension bound
const DEFAULT_GUEST_STATUS: GuestStatus = 'planned';
const EVENT_STATUSES: readonly string[] = ['upcoming', 'active', 'finished'];
const GUEST_STATUSES: readonly GuestStatus[] = ['planned', 'sent', 'confirmed', 'declined'];
const PHOTO_STATUSES: readonly PhotoState[] = ['pending', 'approved', 'rejected'];

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const text = (value: unknown): string | null =>
  typeof value === 'string' && value.trim() !== '' ? value.trim() : null;

// S7: optional text is trimmed; a whitespace-only value collapses to the empty
// fallback, so the client can never persist '   ' as an email/phone/note.
const optionalText = (value: unknown, fallback: string): string | null => {
  if (value === undefined || value === null) return fallback;
  return typeof value === 'string' ? value.trim() : null;
};

// W3: strict ISO-8601 datetime with an EXPLICIT UTC offset (Z or ±hh:mm). Naive
// wall-clock strings are rejected so the server never guesses a timezone. The
// captured calendar fields are round-tripped through Date.UTC because V8 rolls
// impossible dates over (2026-02-30 parses as 2026-03-02) instead of failing.
const ISO_DATETIME =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,3})?(Z|[+-]\d{2}:\d{2})$/;

const date = (value: unknown): Date | null => {
  if (typeof value !== 'string') return null;
  const match = ISO_DATETIME.exec(value);
  if (match === null) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const calendar = new Date(Date.UTC(year, month - 1, day));
  if (
    calendar.getUTCFullYear() !== year ||
    calendar.getUTCMonth() !== month - 1 ||
    calendar.getUTCDate() !== day
  ) {
    return null; // rolled-over calendar date (e.g. February 30th)
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

export function isGuestStatus(value: unknown): value is GuestStatus {
  return typeof value === 'string' && GUEST_STATUSES.some((status) => status === value);
}

/** `admins` carries the assignment rows: each must declare the admin role explicitly. */
function parseAdmins(value: unknown): readonly string[] | null {
  if (!Array.isArray(value) || value.length === 0) return null;
  const ids: string[] = [];
  for (const entry of value) {
    if (!isRecord(entry) || entry['role'] !== 'admin') return null;
    const userId = text(entry['userId']);
    if (userId === null) return null;
    if (!ids.includes(userId)) ids.push(userId);
  }
  return ids;
}

export function parseEventInput(body: unknown): ParseResult<EventWriteInput> {
  if (!isRecord(body)) return FAIL;

  const name = text(body['name']);
  const start = date(body['start']);
  const end = date(body['end']);
  const admins = parseAdmins(body['admins']);
  if (name === null || start === null || end === null || end <= start || admins === null) {
    return FAIL;
  }

  // S2: the client vocabulary uses `done`; the DB stores `finished` (1b decision).
  // The alias maps FIRST, then the persisted vocabulary is validated, so both
  // spellings of the finished state are accepted and anything else still fails.
  const rawStatus = body['status'] ?? DEFAULT_EVENT_STATUS;
  if (typeof rawStatus !== 'string') return FAIL;
  const status = rawStatus === 'done' ? 'finished' : rawStatus;
  if (!EVENT_STATUSES.includes(status)) return FAIL;

  const retentionDays = body['retentionDays'] ?? DEFAULT_RETENTION_DAYS;
  if (
    typeof retentionDays !== 'number' ||
    !Number.isInteger(retentionDays) ||
    retentionDays < 1 ||
    retentionDays > MAX_RETENTION_DAYS
  ) {
    return FAIL;
  }

  const rawNote = body['note'];
  if (rawNote !== undefined && rawNote !== null && typeof rawNote !== 'string') return FAIL;
  const note = typeof rawNote === 'string' && rawNote.trim() !== '' ? rawNote : null;

  return { ok: true, value: { name, start, end, retentionDays, note, status, admins } };
}

function parseParty(
  value: unknown,
): readonly { readonly name: string; readonly rel: string }[] | null {
  if (value === undefined) return [];
  if (!Array.isArray(value)) return null;
  const party: { name: string; rel: string }[] = [];
  for (const entry of value) {
    if (!isRecord(entry)) return null;
    const name = text(entry['name']);
    const rel = text(entry['rel']);
    if (name === null || rel === null) return null;
    party.push({ name, rel });
  }
  return party;
}

export function parseGuestInput(body: unknown): ParseResult<GuestWriteInput> {
  if (!isRecord(body)) return FAIL;

  const name = text(body['name']);
  const email = optionalText(body['email'], '');
  const phone = optionalText(body['phone'], '');
  const note = optionalText(body['note'], '');
  const party = parseParty(body['party']);
  if (name === null || email === null || phone === null || note === null || party === null) {
    return FAIL;
  }

  const table = body['table'] ?? 0;
  if (typeof table !== 'number' || !Number.isInteger(table) || table < 0 || table > MAX_TABLE) {
    return FAIL;
  }

  const status = body['status'] ?? DEFAULT_GUEST_STATUS;
  if (!isGuestStatus(status)) return FAIL;

  return { ok: true, value: { name, email, phone, table, note, status, party } };
}

export function parseGuestPatch(body: unknown): ParseResult<GuestPatchInput> {
  if (!isRecord(body)) return FAIL;

  const status = body['status'];
  const active = body['active'];
  if (status === undefined && active === undefined) return FAIL;
  if (status !== undefined && !isGuestStatus(status)) return FAIL;
  if (active !== undefined && typeof active !== 'boolean') return FAIL;

  return {
    ok: true,
    value: {
      ...(status === undefined ? {} : { status }),
      ...(active === undefined ? {} : { active }),
    },
  };
}

/** Spec req 16, scenario 3: photo state stays a string, validated at the app layer. */
export function isPhotoState(value: unknown): value is PhotoState {
  return typeof value === 'string' && PHOTO_STATUSES.some((status) => status === value);
}

/**
 * POST /api/events/:id/photos (BR-16): the record holds metadata + an external
 * URL only. `url` and `author` are required; `state`/`dl` default server-side;
 * `size` arrives in domain MB and lands on the int4 `sizeKb` column within
 * MAX_SIZE_KB; `big` (full-size URL) is optional. Unknown fields (`id`,
 * `eventId`, `active`, `authorGuestId`) are never read — the route builds the
 * row explicitly.
 */
export function parsePhotoInput(body: unknown): ParseResult<PhotoWriteInput> {
  if (!isRecord(body)) return FAIL;

  const url = text(body['url']);
  const author = text(body['author']);
  if (url === null || author === null) return FAIL;

  const state = body['state'] ?? 'pending';
  if (!isPhotoState(state)) return FAIL;

  const dl = body['dl'] ?? false;
  if (typeof dl !== 'boolean') return FAIL;

  // Decimal MB allowed (1b: 3.2 MB round-trips to 3200 KB); bounds reject
  // negative, non-finite and int-unsafe values before Prisma sees them.
  const size = body['size'] ?? null;
  if (
    size !== null &&
    (typeof size !== 'number' ||
      !Number.isFinite(size) ||
      size < 0 ||
      Math.round(size * 1000) > MAX_SIZE_KB)
  ) {
    return FAIL;
  }

  const h = body['h'] ?? null;
  if (h !== null && (typeof h !== 'number' || !Number.isInteger(h) || h < 0 || h > MAX_HEIGHT)) {
    return FAIL;
  }

  const rawBig = body['big'];
  if (rawBig !== undefined && rawBig !== null && typeof rawBig !== 'string') return FAIL;
  const big = typeof rawBig === 'string' && rawBig.trim() !== '' ? rawBig.trim() : null;

  return { ok: true, value: { url, author, state, dl, size, h, big } };
}

/**
 * PATCH /api/photos/:id — state, active and/or download flag (BR-13 toggle, never
 * a delete). `dl` is the legacy download flag the admin UI flips; it was writable
 * via POST but omitted from the PATCH contract, so `toggleDownload` had no way to
 * persist (PR-2b contract completion).
 */
export function parsePhotoPatch(body: unknown): ParseResult<PhotoPatchInput> {
  if (!isRecord(body)) return FAIL;

  const state = body['state'];
  const active = body['active'];
  const dl = body['dl'];
  if (state === undefined && active === undefined && dl === undefined) return FAIL;
  if (state !== undefined && !isPhotoState(state)) return FAIL;
  if (active !== undefined && typeof active !== 'boolean') return FAIL;
  if (dl !== undefined && typeof dl !== 'boolean') return FAIL;

  return {
    ok: true,
    value: {
      ...(state === undefined ? {} : { state }),
      ...(active === undefined ? {} : { active }),
      ...(dl === undefined ? {} : { dl }),
    },
  };
}

/**
 * POST /api/events/:id/members (spec req 5 / BR-06): only the `security` role may
 * be created here. A second `admin` goes through the BR-05 approval flow, never
 * this route, and the provider cannot create lower roles at all (the route's
 * scope guard denies them before this parser runs). Client-supplied ids and the
 * owning event id are never read — the route builds the row explicitly.
 */
export function parseMemberInput(body: unknown): ParseResult<MemberWriteInput> {
  if (!isRecord(body)) return FAIL;

  const name = text(body['name']);
  if (name === null || body['role'] !== 'security') return FAIL;

  return { ok: true, value: { name } };
}

const ADMIN_REQUEST_STATUSES: readonly string[] = ['pending', 'approved', 'rejected'];

/**
 * POST /api/events/:id/admin-requests (spec req 4 / BR-05): the payload only
 * carries the candidate's name. Ids, the owning event, the requester and the
 * status are server-set — client-supplied values are never read (S8).
 */
export function parseAdminRequestInput(body: unknown): ParseResult<AdminRequestWriteInput> {
  if (!isRecord(body)) return FAIL;

  const name = text(body['name']);
  if (name === null) return FAIL;

  return { ok: true, value: { name } };
}

/**
 * PATCH /api/admin-requests/:id: spec req 4 — the workflow states are exactly
 * pending|approved|rejected, validated at the app layer (string column, no DB
 * enum). The route additionally rejects `pending` (the server-set initial
 * state is not a decision) and enforces the pending-only transition.
 */
export function parseAdminRequestPatch(
  body: unknown,
): ParseResult<{ readonly status: AdminRequestStatus }> {
  if (!isRecord(body)) return FAIL;

  const status = body['status'];
  if (typeof status !== 'string' || !ADMIN_REQUEST_STATUSES.includes(status)) return FAIL;

  return { ok: true, value: { status: status as AdminRequestStatus } };
}

const QR_KINDS: readonly QrKind[] = ['guest', 'companion', 'emergency'];

/** Spec req 6/9: the issuance kinds are exactly guest | companion | emergency. */
export function isQrKind(value: unknown): value is QrKind {
  return typeof value === 'string' && QR_KINDS.some((kind) => kind === value);
}

/**
 * POST /api/events/:id/qr (spec req 6/9/10): the payload names the kind and, for
 * attendee QRs, the target row. The token, its hash, the record id and the owning
 * event are server-set — client-supplied values are never read (S8). A companion
 * QR needs no parent id: the server resolves it from the companion's guest (BR-07).
 */
export function parseQrIssueInput(body: unknown): ParseResult<QrIssueInput> {
  if (!isRecord(body)) return FAIL;

  const kind = body['kind'];
  if (!isQrKind(kind)) return FAIL;
  if (kind === 'emergency') return { ok: true, value: { kind } };

  if (kind === 'guest') {
    const guestId = text(body['guestId']);
    return guestId === null ? FAIL : { ok: true, value: { kind, guestId } };
  }

  const companionId = text(body['companionId']);
  return companionId === null ? FAIL : { ok: true, value: { kind, companionId } };
}
