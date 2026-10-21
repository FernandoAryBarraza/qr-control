import type { PaseEvent } from './models';
import { EVENTS } from './seed-data';
import {
  NO_STORAGE,
  PERSISTED_IDS,
  STORAGE_FIXTURES,
  storageFixture,
  storageOf,
  storageTotals,
} from './storage-display';

/**
 * The storage counters are a client-side display mock: the API does not own
 * them (they are not stored — design §3) and the storage service does not
 * exist yet. These specs pin the prototype's numbers and the rules that
 * resolve them, including the honest fallback for an event without a
 * contract.
 */

/** The row id `prisma/seed.ts` gives the event at `index` (order-derived). */
const seedId = (index: number): string => `ev-${String(index + 1).padStart(3, '0')}`;

/** An event payload exactly as the API sends it: no storage counters. */
function payload(over: Partial<PaseEvent> = {}): PaseEvent {
  return {
    id: 'ev1',
    status: 'active',
    name: 'Gala Aniversario Valdemar',
    dateLabel: '14 JUN 2025 · 20:00',
    cd: null,
    guests: 218,
    photos: 96,
    admin: { name: 'Mariana Solórzano', email: '', phone: '', since: '' },
    security: [],
    ...over,
  };
}

describe('storageFixture', () => {
  it('holds the prototype figures of every seeded event', () => {
    expect(storageFixture('ev1')).toEqual({
      used: 12.4,
      max: 50,
      br: { FOTOS: 11.6, VÍDEOS: 0.6, OTROS: 0.2 },
    });
    expect(storageFixture('ev2')).toEqual({
      used: 0.8,
      max: 30,
      br: { FOTOS: 0.5, VÍDEOS: 0.2, OTROS: 0.1 },
    });
    expect(storageFixture('ev3')).toEqual({
      used: 38.2,
      max: 50,
      br: { FOTOS: 34.9, VÍDEOS: 3.0, OTROS: 0.3 },
    });
  });

  it('has no fixture for an event the prototype never had', () => {
    expect(storageFixture('ev-404')).toBeUndefined();
  });

  it('answers for the persisted spelling of the same event', () => {
    // `prisma/seed.ts` derives the row id from the event ORDER, so the
    // database calls these events `ev-001`, `ev-002`, `ev-003`.
    expect(storageFixture('ev-001')).toEqual(storageFixture('ev1'));
    expect(storageFixture('ev-002')).toEqual(storageFixture('ev2'));
    expect(storageFixture('ev-003')).toEqual(storageFixture('ev3'));
  });

  it('keeps exactly one copy of every number', () => {
    expect(Object.keys(STORAGE_FIXTURES)).toEqual(['ev1', 'ev2', 'ev3']);

    // The fixtures are keyed by the seed snapshot's own event ids, so a rename
    // there would leave the mock answering for nothing.
    expect(Object.keys(STORAGE_FIXTURES)).toEqual(EVENTS.map((event) => event.id));

    // The seed snapshot must not carry a second copy of the prototype's
    // numbers: the counters live only in this module.
    for (const event of EVENTS) {
      expect(event).not.toHaveProperty('used');
      expect(event).not.toHaveProperty('max');
      expect(event).not.toHaveProperty('br');
    }
  });

  it('aliases exactly the ids the seed derives, onto the very same event', () => {
    // `prisma/seed.ts` derives the row id from the event ORDER (`ev-${pad3(index)}`),
    // so the id of position i has to resolve to the prototype id of the event
    // at that same position. A reordered seed would otherwise bind one
    // event's numbers to another — silently, and wrong numbers are the worst
    // failure there is. (The real, seeded ids are checked by the integration
    // spec, which runs the seed itself.)
    expect(Object.keys(PERSISTED_IDS)).toEqual(EVENTS.map((_, index) => seedId(index)));

    EVENTS.forEach((event, index) => {
      expect(PERSISTED_IDS[seedId(index)]).toBe(event.id);
    });
  });

  it('points every alias at a fixture that exists', () => {
    const targets = Object.values(PERSISTED_IDS);

    expect(new Set(targets)).toEqual(new Set(Object.keys(STORAGE_FIXTURES)));
    for (const target of targets) {
      expect(STORAGE_FIXTURES[target]).toBeDefined();
    }
  });
});

describe('storageOf', () => {
  it('fills a payload that carries no counters from the mock', () => {
    expect(storageOf(payload())).toEqual({
      used: 12.4,
      max: 50,
      br: { FOTOS: 11.6, VÍDEOS: 0.6, OTROS: 0.2 },
    });
  });

  it('has no contract for an event the prototype never had', () => {
    expect(storageOf(payload({ id: 'ev-404' }))).toBeUndefined();
  });

  it('lets an applied plan override the contracted capacity', () => {
    // `PaseStore.applyPlan` writes the new plan onto the event, exactly like
    // the prototype mutates `ev.max`.
    const event = payload({ max: 100 });

    expect(storageOf(event)?.used).toBe(12.4);
    expect(storageOf(event)?.max).toBe(100);
  });

  it('never invents a breakdown it does not know', () => {
    expect(storageOf(payload({ id: 'ev-404', max: 50 }))?.br).toBeUndefined();
  });
});

describe('storageTotals', () => {
  it('sums the events that have a contract', () => {
    const totals = storageTotals([
      payload({ id: 'ev1' }),
      payload({ id: 'ev2' }),
      payload({ id: 'ev3' }),
    ]);

    expect(totals?.used).toBeCloseTo(51.4, 10);
    expect(totals?.max).toBe(130);
  });

  it('skips the events without a contract instead of counting them as zero', () => {
    const totals = storageTotals([payload({ id: 'ev1' }), payload({ id: 'ev-404' })]);

    expect(totals?.used).toBe(12.4);
    expect(totals?.max).toBe(50);
  });

  it('has no totals when no event has a contract', () => {
    expect(storageTotals([])).toBeUndefined();
    expect(storageTotals([payload({ id: 'ev-404' })])).toBeUndefined();
  });
});

describe('NO_STORAGE', () => {
  it('is the em dash — the honest "no figure" marker', () => {
    expect(NO_STORAGE).toBe('—');
    expect(NO_STORAGE).not.toContain('NaN');
  });
});
