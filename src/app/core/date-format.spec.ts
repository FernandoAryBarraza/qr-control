import { clockLabel, nowTime, weekdayDayMonth } from './date-format';

/**
 * `date-format.ts` exists because `Intl` is not hydration-safe here.
 *
 * The Node server (TZ `America/Buenos_Aires`, bundled ICU) and Chrome
 * render the same `es-MX` request differently — on this machine Node
 * yields `"sáb 14 de jun"` where Chrome yields `"sáb., 14 jun"` — and
 * under `provideClientHydration()` that divergence is an `NG0500`.
 *
 * So these tests assert two things: the exact output, and the *shape*
 * invariants that no `Intl` call can promise. A future "simplification"
 * back to `toLocaleDateString` would keep some of the first assertions
 * green on a developer machine and still break production, which is
 * exactly the failure mode the hand-rolled tables were written to stop.
 *
 * Every date is built from local components (`new Date(y, m, d, …)`) and
 * every expectation is written against the *local* getters the module
 * uses. That makes the suite timezone-agnostic: it asserts the same bytes
 * under `America/Buenos_Aires`, UTC or `Asia/Tokyo`.
 */

/** The prototype's own headline date, and a known Saturday. */
const SAT_14_JUN_2025 = new Date(2025, 5, 14, 20, 41, 7);

const WEEKDAY_TOKENS = ['DOM', 'LUN', 'MAR', 'MIÉ', 'JUE', 'VIE', 'SÁB'];
const MONTH_TOKENS = [
  'ENE',
  'FEB',
  'MAR',
  'ABR',
  'MAY',
  'JUN',
  'JUL',
  'AGO',
  'SEP',
  'OCT',
  'NOV',
  'DIC',
];

describe('nowTime', () => {
  it('renders a zero-padded 24-hour clock', () => {
    expect(nowTime(SAT_14_JUN_2025)).toBe('20:41:07');
  });

  it('pads every single-digit field', () => {
    expect(nowTime(new Date(2025, 0, 2, 3, 4, 5))).toBe('03:04:05');
    expect(nowTime(new Date(2025, 0, 2, 9, 9, 9))).toBe('09:09:09');
  });

  it('renders midnight as 00:00:00, never the nonstandard 24:00:00', () => {
    // `toLocaleTimeString('es-MX', { hour12: false })` emits `24:00:00`
    // at midnight in some engines; `getHours()` cannot.
    expect(nowTime(new Date(2025, 5, 14, 0, 0, 0))).toBe('00:00:00');
  });

  it('renders the last second of the day as 23:59:59', () => {
    expect(nowTime(new Date(2025, 5, 14, 23, 59, 59))).toBe('23:59:59');
  });

  it('always emits exactly HH:MM:SS', () => {
    for (let h = 0; h < 24; h++) {
      expect(nowTime(new Date(2025, 5, 14, h, 30, 15))).toMatch(/^\d{2}:\d{2}:\d{2}$/);
    }
  });

  it('defaults to the current time rather than throwing', () => {
    expect(nowTime()).toMatch(/^\d{2}:\d{2}:\d{2}$/);
  });
});

describe('weekdayDayMonth', () => {
  it('renders the prototype topbar label for the event date', () => {
    expect(weekdayDayMonth(SAT_14_JUN_2025)).toBe('SÁB, 14 JUN');
  });

  it('maps all seven weekdays, Sunday first', () => {
    // 2026-06-01 is a Monday, so this week walks LUN -> DOM.
    const week = Array.from({ length: 7 }, (_, i) => weekdayDayMonth(new Date(2026, 5, i + 1)));

    expect(week).toEqual([
      'LUN, 01 JUN',
      'MAR, 02 JUN',
      'MIÉ, 03 JUN',
      'JUE, 04 JUN',
      'VIE, 05 JUN',
      'SÁB, 06 JUN',
      'DOM, 07 JUN',
    ]);
  });

  it('maps all twelve months to the three-letter uppercase tokens', () => {
    const months = Array.from({ length: 12 }, (_, i) =>
      weekdayDayMonth(new Date(2025, i, 15, 12, 0, 0)),
    );

    expect(months.map((m) => m.split(' ')[2])).toEqual(MONTH_TOKENS);
  });

  it('abbreviates September as SEP, not the four-letter "sept" some ICU builds emit', () => {
    expect(weekdayDayMonth(new Date(2025, 8, 15, 12, 0, 0))).toBe('LUN, 15 SEP');
  });

  it('zero-pads single-digit days and leaves two-digit days alone', () => {
    expect(weekdayDayMonth(new Date(2025, 5, 1, 12, 0, 0))).toBe('DOM, 01 JUN');
    expect(weekdayDayMonth(new Date(2025, 5, 30, 12, 0, 0))).toBe('LUN, 30 JUN');
  });

  it('never emits the period that es-MX puts after an abbreviated weekday', () => {
    // The prototype stripped it with `.replace(/\./g, '')`; an Intl-based
    // rewrite that forgets the strip would reintroduce "SÁB., 14 JUN".
    for (let day = 1; day <= 28; day++) {
      expect(weekdayDayMonth(new Date(2026, 5, day, 12, 0, 0))).not.toContain('.');
    }
  });

  it('keeps the comma that es-MX abbreviates with', () => {
    expect(weekdayDayMonth(SAT_14_JUN_2025)).toContain(', ');
  });

  it('never emits the "de" infix that Node ICU inserts before the month', () => {
    // Node: "sáb 14 de jun". Chrome: "sáb., 14 jun". Neither may leak through.
    const label = weekdayDayMonth(SAT_14_JUN_2025);

    expect(label).not.toContain(' de ');
    expect(label.split(' ')).toHaveLength(3);
  });

  it('always emits WEEKDAY, DD MON — exactly three space-separated tokens', () => {
    for (let month = 0; month < 12; month++) {
      const label = weekdayDayMonth(new Date(2025, month, 14, 12, 0, 0));
      const [weekday, rest] = label.split(', ');
      const [day, monthToken] = rest.split(' ');

      expect(WEEKDAY_TOKENS).toContain(weekday);
      expect(day).toMatch(/^\d{2}$/);
      expect(MONTH_TOKENS).toContain(monthToken);
    }
  });

  it('is deterministic for a given instant — no locale lookup, no clock read', () => {
    expect(weekdayDayMonth(SAT_14_JUN_2025)).toBe(weekdayDayMonth(SAT_14_JUN_2025));
  });

  it('defaults to the current time rather than throwing', () => {
    expect(weekdayDayMonth()).toMatch(/^[A-ZÁÉÍÓÚÑ]{3}, \d{2} [A-ZÁÉÍÓÚÑ]{3}$/);
  });
});

describe('clockLabel', () => {
  it('joins the date and the time with the prototype separator', () => {
    expect(clockLabel(SAT_14_JUN_2025)).toBe('SÁB, 14 JUN · 20:41:07');
  });

  it('is exactly the composition of its two parts', () => {
    for (let day = 1; day <= 28; day++) {
      const date = new Date(2026, 5, day, 9, 8, 7);
      expect(clockLabel(date)).toBe(`${weekdayDayMonth(date)} · ${nowTime(date)}`);
    }
  });

  it('keeps the shape the topbar reserves space for', () => {
    // `\w` is ASCII-only in JS and would not match the accented tokens.
    expect(clockLabel(SAT_14_JUN_2025)).toMatch(
      /^[A-ZÁÉÍÓÚ]{3}, \d{2} [A-ZÁÉÍÓÚ]{3} · \d{2}:\d{2}:\d{2}$/,
    );
  });

  it('defaults to the current time rather than throwing', () => {
    expect(clockLabel()).toMatch(/ · \d{2}:\d{2}:\d{2}$/);
  });
});
