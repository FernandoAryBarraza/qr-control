import type { PaseEvent } from './models';
import { EVENTS } from './seed-data';
import {
  ADMIN_FIXTURES,
  COUNTDOWN_FIXTURES,
  GUARD_FIXTURES,
  NO_VALUE,
  PERSISTED_IDS,
  STORAGE_FIXTURES,
  adminContact,
  adminContactOf,
  countdown,
  countdownOf,
  guardDetail,
  resolvedGuards,
  storageFixture,
  storageOf,
  storageTotals,
} from './event-display';

/**
 * The prototype's display fixtures live in ONE client-side module: the API
 * does not own them (they are not stored — design §3) and the services that
 * would (storage, scanner, messaging, countdown) do not exist yet. These
 * specs pin the prototype's own values and the rules that resolve them,
 * including the honest fallback for an event or a guard with no fixture.
 */

/** The row id `prisma/seed.ts` gives the event at `index` (order-derived). */
const seedId = (index: number): string => `ev-${String(index + 1).padStart(3, '0')}`;

/** An event payload exactly as the API sends it: no display-only fields. */
function payload(over: Partial<PaseEvent> = {}): PaseEvent {
  return {
    id: 'ev1',
    status: 'active',
    name: 'Gala Aniversario Valdemar',
    dateLabel: '14 JUN 2025 · 20:00',
    guests: 218,
    photos: 96,
    admin: { name: 'Mariana Solórzano' },
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

describe('NO_VALUE', () => {
  it('is the em dash — the honest "nothing to show" marker', () => {
    expect(NO_VALUE).toBe('—');
    expect(NO_VALUE).not.toContain('NaN');
  });
});

/* ---------- Admin contact ---------- */

describe('adminContact', () => {
  it('holds the prototype contact of every seeded event', () => {
    expect(adminContact('ev1')).toEqual({
      email: 'mariana.solorzana@valdemar.mx',
      phone: '+52 646 118 44 20',
      since: 'Cliente desde 2023',
    });
    expect(adminContact('ev2')).toEqual({
      email: 'diego@hernandezriva.wed',
      phone: '+52 55 4021 77 15',
      since: 'Cliente nuevo · 2025',
    });
    expect(adminContact('ev3')).toEqual({
      email: 'c.ibanez@nebulatech.io',
      phone: '+52 81 2233 90 04',
      since: 'Cliente desde 2021',
    });
  });

  it('answers for the persisted spelling of the same event', () => {
    expect(adminContact('ev-001')).toEqual(adminContact('ev1'));
    expect(adminContact('ev-002')).toEqual(adminContact('ev2'));
    expect(adminContact('ev-003')).toEqual(adminContact('ev3'));
  });

  it('has no contact for an event the prototype never had', () => {
    expect(adminContact('ev-404')).toBeUndefined();
  });

  it('keeps exactly one copy of every contact', () => {
    expect(Object.keys(ADMIN_FIXTURES)).toEqual(EVENTS.map((event) => event.id));

    // The contact lives only in this module: the seed snapshot must not carry
    // a second copy of it.
    for (const event of EVENTS) {
      expect(event.admin.email).toBeUndefined();
      expect(event.admin.phone).toBeUndefined();
      expect(event.admin.since).toBeUndefined();
    }
  });
});

describe('adminContactOf', () => {
  it('fills a payload that carries no contact from the mock', () => {
    expect(adminContactOf(payload())).toStrictEqual({
      email: 'mariana.solorzana@valdemar.mx',
      phone: '+52 646 118 44 20',
      since: 'Cliente desde 2023',
    });
  });

  it('has no contact at all for an event the prototype never had', () => {
    expect(adminContactOf(payload({ id: 'ev-404' }))).toBeUndefined();
  });

  it('lets a payload that carries its own contact win over the mock', () => {
    // The `User` model has no email/phone column today, but the moment a
    // contact service exists the API's own value must win.
    const event = payload({
      admin: { name: 'Mariana Solórzano', email: 'otra@valdemar.mx' },
    });

    expect(adminContactOf(event)?.email).toBe('otra@valdemar.mx');
  });

  it('keeps the fields it does not know empty instead of inventing them', () => {
    // No fixture for this event: the payload knows the address and nothing
    // else, so the other two fields stay empty — the UI renders the em dash
    // for them instead of a made-up phone number.
    const event = payload({
      id: 'ev-404',
      admin: { name: 'Mariana Solórzano', email: 'otra@valdemar.mx' },
    });

    expect(adminContactOf(event)?.email).toBe('otra@valdemar.mx');
    expect(adminContactOf(event)?.phone).toBeUndefined();
    expect(adminContactOf(event)?.since).toBeUndefined();
  });

  it('fills the fields the payload does not carry from the mock', () => {
    // Field by field: the payload's own value wins, the mock answers for
    // the rest — the same resolution rule every family follows.
    const event = payload({ admin: { name: 'Mariana Solórzano', email: 'otra@valdemar.mx' } });

    expect(adminContactOf(event)).toStrictEqual({
      email: 'otra@valdemar.mx',
      phone: '+52 646 118 44 20',
      since: 'Cliente desde 2023',
    });
  });

  it('treats a blank field as unknown and lets the mock answer', () => {
    // A future contact service that defaults a missing address to `''` must
    // NOT win over the mock: a blank string is "unknown", not a value. It
    // would otherwise reach the UI as an empty address.
    const event = payload({
      admin: { name: 'Mariana Solórzano', email: '', phone: '   ', since: '' },
    });

    expect(adminContactOf(event)).toStrictEqual({
      email: 'mariana.solorzana@valdemar.mx',
      phone: '+52 646 118 44 20',
      since: 'Cliente desde 2023',
    });
  });
});

/* ---------- Guard details ---------- */

describe('guardDetail', () => {
  it('holds the prototype details of every guard, keyed by name within its event', () => {
    expect(guardDetail('ev1', 'Josué Andrade')).toEqual({
      post: 'ESCÁNER — PUERTA A',
      app: 'online',
      last: '20:41',
    });
    expect(guardDetail('ev1', 'Miguel Ángel Ruiz')).toEqual({
      post: 'RESERVA — MEDITERRÁNEO',
      app: 'idle',
      last: null,
    });
    expect(guardDetail('ev2', 'Marco Toledano')).toEqual({
      post: 'ASIGNADO — SALÓN',
      app: 'none',
      last: null,
    });
    expect(guardDetail('ev3', 'Raúl Prado')).toEqual({
      post: 'ESCÁNER — ACCESO PRINCIPAL',
      app: 'archived',
      last: '—',
    });
  });

  it('does not leak a guard of one event into another', () => {
    // 'Sara Lima' guards the second event only.
    expect(guardDetail('ev1', 'Sara Lima')).toBeUndefined();
    expect(guardDetail('ev2', 'Sara Lima')).toBeDefined();
  });

  it('has no details for a guard the prototype never had', () => {
    expect(guardDetail('ev1', 'Guardia Desconocida')).toBeUndefined();
  });

  it('keeps exactly one copy of every guard detail', () => {
    expect(Object.keys(GUARD_FIXTURES)).toEqual(EVENTS.map((event) => event.id));

    for (const event of EVENTS) {
      for (const guard of event.security) {
        expect(guard.post).toBeUndefined();
        expect(guard.app).toBeUndefined();
        expect(guard.last).toBeUndefined();
      }
    }
  });
});

describe('resolvedGuards', () => {
  it('resolves the payload guards through the mock', () => {
    const guards = resolvedGuards(
      payload({
        security: [{ name: 'Josué Andrade' }, { name: 'Miguel Ángel Ruiz' }],
      }),
    );

    expect(guards).toEqual([
      { name: 'Josué Andrade', post: 'ESCÁNER — PUERTA A', app: 'online', last: '20:41' },
      { name: 'Miguel Ángel Ruiz', post: 'RESERVA — MEDITERRÁNEO', app: 'idle', last: null },
    ]);
  });

  it('degrades honestly for a guard the prototype never had', () => {
    const guards = resolvedGuards(payload({ security: [{ name: 'Guardia Desconocida' }] }));

    // No post to show and no app installed — but never a plausible-looking
    // invention.
    expect(guards).toEqual([
      { name: 'Guardia Desconocida', post: NO_VALUE, app: 'none', last: null },
    ]);
  });

  it('lets a payload that carries its own details win over the mock', () => {
    const guards = resolvedGuards(
      payload({ security: [{ name: 'Josué Andrade', post: 'PUERTA C', app: 'idle', last: null }] }),
    );

    expect(guards).toEqual([{ name: 'Josué Andrade', post: 'PUERTA C', app: 'idle', last: null }]);
  });

  it('treats a blank post as unknown and lets the mock answer', () => {
    const guards = resolvedGuards(payload({ security: [{ name: 'Josué Andrade', post: '   ' }] }));

    expect(guards[0].post).toBe('ESCÁNER — PUERTA A');
  });

  it('keeps an explicit "never synced" and the "no app" state as they are', () => {
    // `null` is not "unknown": the scanner never synced. `none` is a real
    // app state (QR_Z_Open/app.js:172), not a blank value.
    const guards = resolvedGuards(
      payload({ security: [{ name: 'Josué Andrade', app: 'none', last: null }] }),
    );

    expect(guards[0].app).toBe('none');
    expect(guards[0].last).toBeNull();
  });

  it('resolves the seed snapshot through the very same mock', () => {
    const guards = resolvedGuards(EVENTS[0]);

    expect(guards.map((guard) => guard.name)).toEqual([
      'Josué Andrade',
      'Paola Reyes',
      'Iván Cortés',
      'Miguel Ángel Ruiz',
    ]);
    expect(guards.filter((guard) => guard.app === 'online')).toHaveLength(3);
  });
});

/* ---------- Countdown ---------- */

describe('countdown', () => {
  it('holds the prototype badge of the upcoming event', () => {
    expect(countdown('ev2')).toBe('EN 42 DÍAS');
  });

  it('has no badge for the events that never had one', () => {
    expect(countdown('ev1')).toBeUndefined();
    expect(countdown('ev3')).toBeUndefined();
    expect(countdown('ev-404')).toBeUndefined();
  });

  it('answers for the persisted spelling of the same event', () => {
    expect(countdown('ev-002')).toBe('EN 42 DÍAS');
  });

  it('keeps exactly one copy of every badge', () => {
    expect(Object.keys(COUNTDOWN_FIXTURES)).toEqual(['ev2']);

    for (const event of EVENTS) {
      expect(event.cd).toBeUndefined();
    }
  });
});

describe('countdownOf', () => {
  it('resolves the badge of an event through the mock', () => {
    expect(countdownOf(payload({ id: 'ev2' }))).toBe('EN 42 DÍAS');
  });

  it('has no badge for an event that never had one', () => {
    expect(countdownOf(payload())).toBeUndefined();
  });

  it('lets a payload that carries its own badge win over the mock', () => {
    expect(countdownOf(payload({ id: 'ev2', cd: 'MAÑANA' }))).toBe('MAÑANA');
  });

  it('treats a blank badge as unknown instead of rendering an empty one', () => {
    // The badge is a string like the contact fields: a payload that carries a
    // blank one means "no badge", so the mock answers — and an event with
    // neither shows no badge at all rather than an empty pill.
    expect(countdownOf(payload({ id: 'ev2', cd: '   ' }))).toBe('EN 42 DÍAS');
    expect(countdownOf(payload({ id: 'ev-404', cd: '' }))).toBeUndefined();
  });
});
