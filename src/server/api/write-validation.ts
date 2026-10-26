import type { GuestStatus } from '../../app/core/models';
import type { EventWriteInput } from '../data/repositories/events';

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
const EVENT_STATUSES: readonly string[] = ['upcoming', 'active', 'finished'];

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const text = (value: unknown): string | null =>
  typeof value === 'string' && value.trim() !== '' ? value.trim() : null;

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
