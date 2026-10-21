import type { PaseEvent, ScanAppState, StorageBreakdown } from './models';

/**
 * The prototype's display fixtures — the ONE place they exist.
 *
 * The database owns the domain data (names, dates, the counters it can
 * count). Four families of DISPLAY state have no database source at all:
 *
 * - the storage counters: not stored (design §3) and the storage service
 *   does not exist yet (BR-16);
 * - the admin contact details: the `User` model carries no email or phone;
 * - the guard details (post, app state, last sync): the scanner service
 *   does not exist yet;
 * - the countdown badge: not stored.
 *
 * The API therefore promises NONE of them, and the prototype's values live
 * HERE, on the client. Every figure and every string below is a verbatim
 * transcription of the prototype (`QR_Z_Open/app.js:124-154`); `seed-data.ts`
 * does not repeat them.
 *
 * The resolution rule is the same for every family: the payload's own value
 * wins (the day a real service sends it), the fixture answers for the rest,
 * and whatever NEITHER of them knows stays unknown — never a plausible-looking
 * invention. Each family then renders its own honest marker: the em dash for
 * a contact field and for a post, `null` for a last sync that never happened,
 * `'none'` for a scanner app that was never installed, and no badge at all
 * for a countdown.
 *
 * A BLANK string counts as unknown: a payload that defaults a missing
 * address to `''` must neither win over the fixture nor reach the UI as an
 * empty address. Two values keep their own meaning and are never blanked
 * away: `'none'` is a real app state (QR_Z_Open/app.js:172), and an explicit
 * `null` last sync means "it never synced", not "unknown".
 */

/** Rendered wherever there is nothing to show: never `NaN`, never a fake `0`. */
export const NO_VALUE = '—';

/**
 * The ids the persistence layer gives the same three events: `prisma/seed.ts`
 * derives the row id from the event ORDER (`ev-001`, `ev-002`, `ev-003`), so
 * the client's `ev1`, `ev2`, `ev3` and the database's `ev-001`… name the same
 * demo events under two spellings. Both have to resolve to the same fixture,
 * otherwise the display state would silently go blank as soon as
 * `PaseStore.load()` succeeds.
 */
export const PERSISTED_IDS: Readonly<Record<string, string>> = {
  'ev-001': 'ev1',
  'ev-002': 'ev2',
  'ev-003': 'ev3',
};

/** The seed id of an event, whichever of the two spellings the caller uses. */
function fixtureKey(eventId: string): string {
  return PERSISTED_IDS[eventId] ?? eventId;
}

/**
 * A string the payload knows, or `undefined` when it knows nothing: `null`,
 * `undefined` and a BLANK string (empty or whitespace only) all mean
 * "unknown", because `??` alone would let `''` through as a real value.
 */
function knownString(value: string | null | undefined): string | undefined {
  if (value === undefined || value === null) return undefined;
  return value.trim() === '' ? undefined : value;
}

/* ---------- Almacenamiento ---------- */

/** The prototype's storage figures of one event. */
export interface StorageFixture {
  /** Gigabytes already consumed by the event's photos. */
  readonly used: number;
  /** Gigabytes contracted for the event. */
  readonly max: number;
  /** How the consumed gigabytes split across the media types, when known. */
  readonly br?: StorageBreakdown;
}

/**
 * The prototype's per-event figures, keyed by the id the client seed uses
 * (`ev1`, `ev2`, `ev3`).
 */
export const STORAGE_FIXTURES: Readonly<Record<string, StorageFixture>> = {
  ev1: { used: 12.4, max: 50, br: { FOTOS: 11.6, VÍDEOS: 0.6, OTROS: 0.2 } },
  ev2: { used: 0.8, max: 30, br: { FOTOS: 0.5, VÍDEOS: 0.2, OTROS: 0.1 } },
  ev3: { used: 38.2, max: 50, br: { FOTOS: 34.9, VÍDEOS: 3.0, OTROS: 0.3 } },
};

/**
 * The prototype's figures for an event id, or `undefined` when the event has
 * no storage contract at all (e.g. one created later through the API).
 */
export function storageFixture(eventId: string): StorageFixture | undefined {
  return STORAGE_FIXTURES[fixtureKey(eventId)];
}

/**
 * The storage of an event: its own figures when it carries any (the API may
 * send them once a storage service exists), the prototype's fixture for the
 * rest. `undefined` means "no contract" — the UI must render `—`.
 */
export function storageOf(event: PaseEvent): StorageFixture | undefined {
  const fixture = storageFixture(event.id);
  const used = event.used ?? fixture?.used;
  const max = event.max ?? fixture?.max;
  if (used === undefined || max === undefined) return undefined;
  const br = event.br ?? fixture?.br;
  return br === undefined ? { used, max } : { used, max, br };
}

/** The summed figures of a set of events. */
export interface StorageTotals {
  readonly used: number;
  readonly max: number;
}

/**
 * The aggregate over the events that have a contract. Events without one are
 * skipped, so an event created later never lowers the total. `undefined`
 * when NO event has a contract — the KPI then renders `—`.
 */
export function storageTotals(events: readonly PaseEvent[]): StorageTotals | undefined {
  let used = 0;
  let max = 0;
  let contracted = 0;
  for (const event of events) {
    const storage = storageOf(event);
    if (storage === undefined) continue;
    used += storage.used;
    max += storage.max;
    contracted += 1;
  }
  return contracted === 0 ? undefined : { used, max };
}

/* ---------- Contacto del administrador ---------- */

/**
 * The prototype's contact details of one event's administrator. Every field
 * is optional: a contact service that only knows the email would leave the
 * rest empty, and the UI would render the em dash for them.
 */
export interface AdminContactFixture {
  /** The address the provider writes to. */
  readonly email?: string;
  /** The phone number the provider calls. */
  readonly phone?: string;
  /** Since when the provider works with this client. */
  readonly since?: string;
}

/**
 * The prototype's administrator contacts, keyed by the id the client seed
 * uses (`ev1`, `ev2`, `ev3`).
 */
export const ADMIN_FIXTURES: Readonly<Record<string, AdminContactFixture>> = {
  ev1: {
    email: 'mariana.solorzana@valdemar.mx',
    phone: '+52 646 118 44 20',
    since: 'Cliente desde 2023',
  },
  ev2: {
    email: 'diego@hernandezriva.wed',
    phone: '+52 55 4021 77 15',
    since: 'Cliente nuevo · 2025',
  },
  ev3: {
    email: 'c.ibanez@nebulatech.io',
    phone: '+52 81 2233 90 04',
    since: 'Cliente desde 2021',
  },
};

/**
 * The prototype's contact for an event id, or `undefined` when the event has
 * no administrator on file (e.g. one created later through the API).
 */
export function adminContact(eventId: string): AdminContactFixture | undefined {
  return ADMIN_FIXTURES[fixtureKey(eventId)];
}

/**
 * The contact of an event's administrator: its own when the payload carries
 * a real one, the prototype's fixture for the rest. A blank field counts as
 * "not carried" — it never wins over the fixture. `undefined` when NEITHER
 * knows anything — there is no address on file, and the UI must say so
 * instead of writing to an empty address.
 */
export function adminContactOf(event: PaseEvent): AdminContactFixture | undefined {
  const fixture = adminContact(event.id);
  const email = knownString(event.admin.email) ?? knownString(fixture?.email);
  const phone = knownString(event.admin.phone) ?? knownString(fixture?.phone);
  const since = knownString(event.admin.since) ?? knownString(fixture?.since);
  if (email === undefined && phone === undefined && since === undefined) return undefined;
  return { email, phone, since };
}

/* ---------- Seguridad ---------- */

/** The prototype's scanner details of one guard. */
export interface GuardDetailFixture {
  /** The post the guard covers, e.g. 'ESCÁNER — PUERTA A'. */
  readonly post: string;
  /** The state of the scanner app on the guard's phone. */
  readonly app: ScanAppState;
  /** The last sync of the scanner app, `null` when it never synced. */
  readonly last: string | null;
}

/**
 * The prototype's guard details, keyed by the event id and then by the
 * guard's NAME — the database owns the names, so the mock resolves the pair
 * (`eventId`, `guardName`).
 */
export const GUARD_FIXTURES: Readonly<
  Record<string, Readonly<Record<string, GuardDetailFixture>>>
> = {
  ev1: {
    'Josué Andrade': { post: 'ESCÁNER — PUERTA A', app: 'online', last: '20:41' },
    'Paola Reyes': { post: 'ESCÁNER — PUERTA B', app: 'online', last: '20:38' },
    'Iván Cortés': { post: 'ESCÁNER — JARDÍN', app: 'online', last: '20:29' },
    'Miguel Ángel Ruiz': { post: 'RESERVA — MEDITERRÁNEO', app: 'idle', last: null },
  },
  ev2: {
    'Sara Lima': { post: 'ASIGNADA — RECEPCIÓN', app: 'idle', last: null },
    'Marco Toledano': { post: 'ASIGNADO — SALÓN', app: 'none', last: null },
  },
  ev3: {
    'Raúl Prado': { post: 'ESCÁNER — ACCESO PRINCIPAL', app: 'archived', last: '—' },
    'Ana Sofía Cruz': { post: 'ESCÁNER — TERRAZA', app: 'archived', last: '—' },
    'Leo Márquez': { post: 'ESCÁNER — ESTACIONAMIENTO', app: 'archived', last: '—' },
  },
};

/**
 * The prototype's details of one guard of one event, or `undefined` when the
 * prototype never had that guard in that event.
 */
export function guardDetail(eventId: string, guardName: string): GuardDetailFixture | undefined {
  return GUARD_FIXTURES[fixtureKey(eventId)]?.[guardName];
}

/** A guard with every display field resolved. */
export interface ResolvedGuard {
  readonly name: string;
  /** The post the guard covers, or the em dash when it is unknown. */
  readonly post: string;
  /** The scanner app state; `none` for a guard the prototype never had. */
  readonly app: ScanAppState;
  /** The last sync of the scanner app, `null` when it never synced. */
  readonly last: string | null;
}

/**
 * The guards of an event, every field resolved: the payload's own when it
 * carries one, the prototype's fixture for the rest. A guard nobody knows
 * anything about gets the em dash for its post, the `none` app state (the
 * scanner was never installed) and `null` for a last sync that never
 * happened — never a post invented out of thin air.
 */
export function resolvedGuards(event: PaseEvent): readonly ResolvedGuard[] {
  return event.security.map((guard) => {
    const fixture = guardDetail(event.id, guard.name);
    return {
      name: guard.name,
      // A blank post is "not carried": the fixture answers for it.
      post: knownString(guard.post) ?? knownString(fixture?.post) ?? NO_VALUE,
      app: guard.app ?? fixture?.app ?? 'none',
      // `undefined` means "the payload says nothing"; an explicit `null` means
      // "it never synced" and must not be overwritten by the fixture.
      last: guard.last !== undefined ? guard.last : (fixture?.last ?? null),
    };
  });
}

/* ---------- Cuenta regresiva ---------- */

/**
 * The prototype's countdown badges, keyed by the id the client seed uses
 * (`ev1`, `ev2`, `ev3`). Only the upcoming event carries one.
 */
export const COUNTDOWN_FIXTURES: Readonly<Record<string, string>> = {
  ev2: 'EN 42 DÍAS',
};

/**
 * The prototype's badge for an event id, or `undefined` when the event has
 * no countdown (an event that already happened, or one created later).
 */
export function countdown(eventId: string): string | undefined {
  return COUNTDOWN_FIXTURES[fixtureKey(eventId)];
}

/**
 * The countdown of an event: its own when the payload carries one, the
 * prototype's fixture for the rest. `undefined` means "no badge".
 */
export function countdownOf(event: PaseEvent): string | undefined {
  return knownString(event.cd) ?? countdown(event.id);
}
