import { EVENTS, GUESTS, PHOTOS } from './seed-data';
import {
  barClass,
  barWidth,
  computeMetrics,
  eventFilters,
  funnelSegments,
  gb,
  guestFilters,
  kpis,
  passOf,
  passPoolOf,
  photoFilters,
  segmentWidth,
  statDefs,
  storageWidth,
} from './metrics';
import type { Guest, Metrics } from './models';

/**
 * `metrics.ts` is pure derivation — no DOM, no signals, no `Intl`, no
 * browser globals — so it is tested by direct call, with no `TestBed`.
 * That is deliberate: a `TestBed` harness would add jsdom to the
 * equation for functions that never touch it.
 *
 * The seed figures asserted here are the contract with the prototype
 * (`QR_Z_Open/app.js`). They are not "expected values" in the sense of
 * being desirable — `funnelSegments` is unclamped and `passPoolOf`
 * trusts the guest list — they are the exact bytes the design was drawn
 * against. A refactor that changes any of them changes pixels.
 */

const metrics: Metrics = computeMetrics(GUESTS);

/** Guest factory for the tests that must not depend on the seed shape. */
function guest(over: Partial<Guest> = {}): Guest {
  return {
    id: 'X-001',
    name: 'Invitado Prueba',
    email: 'prueba@example.com',
    phone: '+52 000 000 00 00',
    status: 'planned',
    table: 0,
    party: [],
    note: '—',
    ...over,
  };
}

describe('computeMetrics', () => {
  it('reproduces the seed figures the prototype renders', () => {
    expect(metrics).toEqual({
      planned: 14,
      invited: 11,
      confirmed: 7,
      declined: 1,
      sentPend: 3,
      comp: 13,
      compPrev: 19,
      passes: 20,
      potential: 33,
    });
  });

  it('splits every guest into exactly one of the four statuses', () => {
    expect(metrics.confirmed + metrics.declined + metrics.sentPend + (metrics.planned - metrics.invited)).toBe(
      metrics.planned,
    );
  });

  it('derives sentPend from the others instead of counting the list', () => {
    const sent = GUESTS.filter((x) => x.status === 'sent').length;
    expect(metrics.sentPend).toBe(sent);
    expect(metrics.sentPend).toBe(metrics.invited - metrics.confirmed - metrics.declined);
  });

  it('counts passes as holders plus their companions, and potential as everyone', () => {
    expect(metrics.passes).toBe(metrics.confirmed + metrics.comp);
    expect(metrics.potential).toBe(metrics.planned + metrics.compPrev);
  });

  it('counts companions of confirmed guests in comp, but of everyone in compPrev', () => {
    const confirmedParty = GUESTS.filter((x) => x.status === 'confirmed').reduce((a, x) => a + x.party.length, 0);
    const allParty = GUESTS.reduce((a, x) => a + x.party.length, 0);

    expect(metrics.comp).toBe(confirmedParty);
    expect(metrics.compPrev).toBe(allParty);
    expect(metrics.comp).toBeLessThan(metrics.compPrev);
  });

  it('is a pure function of the list: no mutation, stable across calls', () => {
    const snapshot = JSON.stringify(GUESTS);
    const first = computeMetrics(GUESTS);
    const second = computeMetrics(GUESTS);

    expect(JSON.stringify(GUESTS)).toBe(snapshot);
    expect(second).toEqual(first);
    expect(second).not.toBe(first); // fresh object, never a shared reference
  });

  it('returns zeroes for an empty list instead of dividing by zero', () => {
    const empty = computeMetrics([]);

    expect(empty).toEqual({
      planned: 0,
      invited: 0,
      confirmed: 0,
      declined: 0,
      sentPend: 0,
      comp: 0,
      compPrev: 0,
      passes: 0,
      potential: 0,
    });
  });

  it('tracks a synthetic list rather than echoing the seed', () => {
    const synthetic = computeMetrics([
      guest({ id: 'A', status: 'confirmed', party: [{ name: 'X', rel: 'Pareja' }] }),
      guest({ id: 'B', status: 'sent' }),
      guest({ id: 'C', status: 'planned', party: [{ name: 'Y', rel: 'Hijo' }] }),
    ]);

    expect(synthetic).toEqual({
      planned: 3,
      invited: 2,
      confirmed: 1,
      declined: 0,
      sentPend: 1,
      comp: 1,
      compPrev: 2,
      passes: 2,
      potential: 5,
    });
  });
});

describe('funnelSegments', () => {
  it('renders the seed funnel with two decimals, in prototype order', () => {
    expect(funnelSegments(metrics)).toEqual([
      { key: 'conf', width: '50.00%' },
      { key: 'sent', width: '21.43%' },
      { key: 'unsent', width: '21.43%' },
      { key: 'dec', width: '7.14%' },
    ]);
  });

  it('does not clamp — four full segments would overflow the track', () => {
    const allConfirmed = computeMetrics([
      guest({ status: 'confirmed' }),
      guest({ status: 'confirmed' }),
      guest({ status: 'confirmed' }),
      guest({ status: 'confirmed' }),
    ]);

    expect(funnelSegments(allConfirmed).map((s) => s.width)).toEqual(['100.00%', '0.00%', '0.00%', '0.00%']);
    expect(segmentWidth(1.5)).toBe('150.00%'); // prototype quirk, preserved
  });
});

describe('statDefs', () => {
  const stats = statDefs(metrics);

  it('renders the seed bars with one decimal, clamped at 100', () => {
    expect(stats.map((s) => s.barWidth)).toEqual(['100.0%', '78.6%', '50.0%', '68.4%', '60.6%']);
  });

  it('renders the seed values, labels and sublabels verbatim', () => {
    expect(stats.map((s) => s.label)).toEqual([
      'INVITADOS PLANEADOS',
      'RECIBIERON EMAIL',
      'CONFIRMARON ASISTENCIA',
      'ACOMPAÑANTES',
      'PASES QR EMITIDOS',
    ]);
    expect(stats.map((s) => s.value)).toEqual([14, 11, 7, 13, 20]);
    expect(stats.map((s) => s.sub)).toEqual([
      'LISTA MAESTRA DEL EVENTO',
      '79% DE LA LISTA',
      '50% DE LA LISTA',
      'DE 19 PREVISTOS · C/U CON QR PROPIO',
      'TITULARES + ACOMPAÑANTES · CAP. 33',
    ]);
  });

  it('marks only the emitted-passes tile as the dark one', () => {
    expect(stats.map((s) => s.dark)).toEqual([false, false, false, false, true]);
  });

  it('keeps the prototype flex-grow weights', () => {
    expect(stats.map((s) => s.flexGrow)).toEqual([1, 1.08, 1.15, 0.92, 1.15]);
  });

  it('rounds the "DE LA LISTA" sublabel to whole percent', () => {
    // 11/14 = 78.57% -> 79%; the bar keeps one decimal, the label does not.
    expect(stats[1].sub).toBe('79% DE LA LISTA');
    expect(stats[1].barWidth).toBe('78.6%');
  });

  it('clamps the companions ratio at 100% even when more show up than expected', () => {
    const defs = statDefs(computeMetrics([guest({ status: 'confirmed', party: [{ name: 'A', rel: 'X' }] })]));

    // comp 1 of compPrev 1 -> 100%, and the first tile is always full.
    expect(defs[3].barWidth).toBe('100.0%');
    expect(defs[3].sub).toBe('DE 1 PREVISTOS · C/U CON QR PROPIO');
  });
});

describe('formatters', () => {
  it('gb always prints one decimal', () => {
    expect(gb(0)).toBe('0.0');
    expect(gb(12.4)).toBe('12.4');
    expect(gb(51.4)).toBe('51.4');
    expect(gb(38)).toBe('38.0');
  });

  it('segmentWidth prints two decimals and never clamps', () => {
    expect(segmentWidth(0)).toBe('0.00%');
    expect(segmentWidth(0.5)).toBe('50.00%');
    expect(segmentWidth(1)).toBe('100.00%');
    expect(segmentWidth(2)).toBe('200.00%');
  });

  it('barWidth prints one decimal and clamps at 100', () => {
    expect(barWidth(0)).toBe('0.0%');
    expect(barWidth(0.5)).toBe('50.0%');
    expect(barWidth(1)).toBe('100.0%');
    expect(barWidth(1.5)).toBe('100.0%');
  });

  it('storageWidth clamps but rounds to no fixed precision', () => {
    expect(storageWidth(25, 100)).toBe('25%');
    expect(storageWidth(12.4, 50)).toBe('24.8%');
    expect(storageWidth(60, 50)).toBe('100%');
  });

  it('barClass switches on strict thresholds, so the boundary itself is not warn', () => {
    expect(barClass(50, 100)).toBe('');
    expect(barClass(13, 20)).toBe(''); // exactly 0.65 -> not > 0.65
    expect(barClass(14, 20)).toBe('warn');
    expect(barClass(17, 20)).toBe('warn'); // exactly 0.85 -> not > 0.85
    expect(barClass(18, 20)).toBe('bad');
  });

  it('barClass returns no modifier for a zero quota instead of throwing', () => {
    expect(barClass(0, 0)).toBe('');
  });
});

describe('passPoolOf', () => {
  const pool = passPoolOf(GUESTS);

  it('yields exactly one pass per emitted QR code', () => {
    expect(pool.length).toBe(metrics.passes);
    expect(pool.length).toBe(20);
  });

  it('codes companions off the holder id with the middle-dot separator', () => {
    expect(pool[0]).toEqual({ code: 'P-001', name: 'Lucía Ferreyra' });
    expect(pool[1]).toEqual({ code: 'P-001·A1', name: 'Martín Ferreyra' });
    expect(pool[2]).toEqual({ code: 'P-001·A2', name: 'Elena Duarte' });
  });

  it('lists the holder before their companions, guests in seed order', () => {
    expect(pool.slice(0, 4).map((p) => p.code)).toEqual(['P-001', 'P-001·A1', 'P-001·A2', 'P-002']);
  });

  it('skips every guest who is not confirmed', () => {
    const codes = pool.map((p) => p.code);

    for (const g of GUESTS.filter((x) => x.status !== 'confirmed')) {
      expect(codes).not.toContain(g.id);
    }
  });

  it('emits no duplicate codes', () => {
    expect(new Set(pool.map((p) => p.code)).size).toBe(pool.length);
  });

  it('is empty for a list with nobody confirmed', () => {
    expect(passPoolOf([guest({ status: 'sent', party: [{ name: 'X', rel: 'Y' }] })])).toEqual([]);
  });
});

describe('passOf', () => {
  const lucia = GUESTS[0];

  it('returns the holder for index 0', () => {
    expect(passOf(lucia, 0)).toEqual({ code: 'P-001', name: 'Lucía Ferreyra' });
  });

  it('returns the nth companion for index n', () => {
    expect(passOf(lucia, 1)).toEqual({ code: 'P-001·A1', name: 'Martín Ferreyra' });
    expect(passOf(lucia, 2)).toEqual({ code: 'P-001·A2', name: 'Elena Duarte' });
  });

  it('agrees with passPoolOf for every code it can produce', () => {
    const pool = passPoolOf([lucia]);

    expect(pool).toEqual([passOf(lucia, 0), passOf(lucia, 1), passOf(lucia, 2)]);
  });

  it('falls back to a generic companion name past the end of the party', () => {
    expect(passOf(lucia, 9)).toEqual({ code: 'P-001·A9', name: 'Acompañante' });
  });
});

describe('guestFilters', () => {
  const filters = guestFilters(metrics, GUESTS.length);

  it('carries the prototype labels and seed counts', () => {
    expect(filters).toEqual([
      { value: 'all', label: 'TODOS', count: 14 },
      { value: 'confirmed', label: 'CONFIRMADOS', count: 7 },
      { value: 'sent', label: 'ENVIADOS', count: 3 },
      { value: 'planned', label: 'POR INVITAR', count: 3 },
      { value: 'declined', label: 'DECLINÓ', count: 1 },
    ]);
  });

  it('partitions the whole list, so the counts add up', () => {
    expect(filters.slice(1).reduce((a, f) => a + f.count, 0)).toBe(GUESTS.length);
  });

  it('uses the passed total for TODOS rather than metrics.planned', () => {
    expect(guestFilters(metrics, 999)[0].count).toBe(999);
  });
});

describe('photoFilters', () => {
  const filters = photoFilters(PHOTOS);

  it('leads with POR REVISAR, unlike the guest filters', () => {
    expect(filters.map((f) => f.value)).toEqual(['pending', 'approved', 'rejected', 'all']);
    expect(filters.map((f) => f.label)).toEqual(['POR REVISAR', 'EN WEB', 'RECHAZADAS', 'TODAS']);
  });

  it('counts each state of the seed gallery', () => {
    expect(filters).toEqual([
      { value: 'pending', label: 'POR REVISAR', count: 3 },
      { value: 'approved', label: 'EN WEB', count: 8 },
      { value: 'rejected', label: 'RECHAZADAS', count: 3 },
      { value: 'all', label: 'TODAS', count: 14 },
    ]);
  });

  it('sums the three states to the total', () => {
    expect(filters.slice(0, 3).reduce((a, f) => a + f.count, 0)).toBe(PHOTOS.length);
  });

  it('counts an empty gallery as zeroes', () => {
    expect(photoFilters([]).map((f) => f.count)).toEqual([0, 0, 0, 0]);
  });
});

describe('eventFilters', () => {
  it('counts the seed events by status', () => {
    expect(eventFilters(EVENTS)).toEqual([
      { value: 'all', label: 'TODOS', count: 3 },
      { value: 'active', label: 'ACTIVOS', count: 1 },
      { value: 'upcoming', label: 'PRÓXIMOS', count: 1 },
      { value: 'done', label: 'FINALIZADOS', count: 1 },
    ]);
  });

  it('keeps the count out of the label — the provider bar renders it as text', () => {
    for (const filter of eventFilters(EVENTS)) {
      expect(filter.label).not.toContain('·');
      expect(filter.label).not.toMatch(/\d/);
    }
  });
});

describe('kpis', () => {
  const defs = kpis(EVENTS);

  it('renders the seed KPI row', () => {
    expect(defs).toEqual([
      {
        label: 'EVENTOS ACTIVOS',
        value: '1',
        unit: '',
        sub: 'LECTURA DE QR EN OPERACIÓN',
        subPrefix: '',
        subBold: '',
        flexGrow: 1,
      },
      {
        label: 'PRÓXIMOS',
        value: '1',
        unit: '',
        sub: 'EN PREPARACIÓN CON EL ADMIN',
        subPrefix: '',
        subBold: '',
        flexGrow: 1,
      },
      {
        label: 'ESCÁNERES EN LÍNEA',
        value: '3',
        unit: '/ 9',
        sub: 'APP DE SEGURIDAD SINCRONIZADA',
        subPrefix: '',
        subBold: '',
        flexGrow: 1,
      },
      {
        label: 'ALMACENAMIENTO EN NUBE',
        value: '51.4',
        unit: 'GB',
        sub: '',
        subPrefix: 'DE 130 GB CONTRATADOS · ',
        subBold: '40% EN USO',
        flexGrow: 1.3,
      },
    ]);
  });

  it('totals storage across every event, not just the active one', () => {
    const total = kpis(EVENTS)[3];
    const used = EVENTS.reduce((a, e) => a + e.used, 0);
    const max = EVENTS.reduce((a, e) => a + e.max, 0);

    // Float addition, so the sum is not exactly 51.4 — `gb` is what rounds it.
    expect(used).toBeCloseTo(51.4, 10);
    expect(max).toBe(130);
    expect(total.value).toBe('51.4');
    expect(total.value).toBe(gb(used));
    expect(total.subPrefix).toBe(`DE ${max} GB CONTRATADOS · `);
    expect(total.subBold).toBe(`${Math.round((used / max) * 100)}% EN USO`);
  });

  it('counts only guards whose app is online', () => {
    const online = EVENTS.reduce(
      (a, e) => a + e.security.filter((s) => s.app === 'online').length,
      0,
    );
    const guards = EVENTS.reduce((a, e) => a + e.security.length, 0);

    expect(online).toBe(3);
    expect(guards).toBe(9);
    expect(defs[2].value).toBe(String(online));
    expect(defs[2].unit).toBe(`/ ${guards}`);
  });

  it('renders four tiles even with no events, without dividing by zero', () => {
    const empty = kpis([]);

    expect(empty).toHaveLength(4);
    expect(empty[3].value).toBe('0.0');
    expect(empty[3].subBold).toBe('NaN% EN USO'); // preserved prototype behaviour
  });
});
