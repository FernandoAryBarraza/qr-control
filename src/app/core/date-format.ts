/**
 * Hand-rolled Spanish date/time formatting.
 *
 * `Intl` and `toLocaleDateString` are deliberately avoided: the Node
 * server (TZ `America/Buenos_Aires`, bundled ICU) and Chrome render the
 * same `es-MX` request differently — Node yields `"sáb 14 de jun"` where
 * Chrome yields `"sáb., 14 jun"`. With `provideClientHydration()` active
 * that divergence is an `NG0500` hydration mismatch. Explicit lookup
 * tables produce the same bytes on both sides.
 */

const WEEKDAYS = ['DOM', 'LUN', 'MAR', 'MIÉ', 'JUE', 'VIE', 'SÁB'] as const;

const MONTHS = [
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
] as const;

function pad2(value: number): string {
  return value < 10 ? `0${value}` : String(value);
}

/**
 * `HH:MM:SS` on a 24-hour clock. Built from `getHours()` rather than
 * `toLocaleTimeString('es-MX', { hour12: false })`, which can emit the
 * nonstandard `24:00:00` at midnight in some engines.
 */
export function nowTime(date: Date = new Date()): string {
  return `${pad2(date.getHours())}:${pad2(date.getMinutes())}:${pad2(date.getSeconds())}`;
}

/**
 * Uppercase `weekday, DD MON`, matching the prototype's
 * `toLocaleDateString('es-MX', { weekday: 'short', day: '2-digit', month: 'short' })`
 * with `.toUpperCase().replace(/\./g, '')` applied — the prototype
 * uppercases and strips the period that `es-MX` abbreviates weekdays
 * with, leaving the comma intact.
 */
export function weekdayDayMonth(date: Date = new Date()): string {
  return `${WEEKDAYS[date.getDay()]}, ${pad2(date.getDate())} ${MONTHS[date.getMonth()]}`;
}

/** Topbar clock label, e.g. `SÁB, 14 JUN · 20:41:07`. */
export function clockLabel(date: Date = new Date()): string {
  return `${weekdayDayMonth(date)} · ${nowTime(date)}`;
}
