import type { PaseEvent, StorageBreakdown } from './models';

/**
 * Client-side display mock for the storage counters.
 *
 * The storage service does not exist yet — BR-16 keeps the image bytes on an
 * external storage vendor — and the persistence design decided that the
 * counters are NOT stored (design §3: "Counters (`PaseEvent.guests/max/used`)
 * are not stored — they become client `computed()` over fetched data"). The
 * API therefore promises no storage figures at all, and the prototype's
 * per-event numbers live HERE, on the client.
 *
 * Every number below is a verbatim transcription of the prototype
 * (`QR_Z_Open/app.js:125,136,145`). This module is the ONLY place they
 * exist — `seed-data.ts` does not repeat them.
 */

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
 * The ids the persistence layer gives the same three events: `prisma/seed.ts`
 * derives the row id from the event ORDER (`ev-001`, `ev-002`, `ev-003`), so
 * the client's `ev1`, `ev2`, `ev3` and the database's `ev-001`… name the same
 * demo events under two spellings. Both have to resolve to the same fixture,
 * otherwise the storage KPI would silently go blank as soon as
 * `PaseStore.load()` succeeds.
 */
export const PERSISTED_IDS: Readonly<Record<string, string>> = {
  'ev-001': 'ev1',
  'ev-002': 'ev2',
  'ev-003': 'ev3',
};

/** Rendered wherever there is no storage contract: never `NaN`, never a fake `0`. */
export const NO_STORAGE = '—';

/**
 * The prototype's figures for an event id, or `undefined` when the event has
 * no storage contract at all (e.g. one created later through the API).
 */
export function storageFixture(eventId: string): StorageFixture | undefined {
  return STORAGE_FIXTURES[PERSISTED_IDS[eventId] ?? eventId];
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
