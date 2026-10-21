import type {
  EventPhoto,
  FilterOption,
  FunnelSegment,
  Guest,
  KpiDef,
  Metrics,
  PaseEvent,
  Pass,
  PhotoState,
  StatTileDef,
} from './models';
import { NO_VALUE, resolvedGuards, storageTotals } from './event-display';
import type { StorageFixture, StorageTotals } from './event-display';

/**
 * Pure derivation of every figure the UI shows. No DOM, no signals, no
 * randomness — a unit test can call these directly with the seed data.
 *
 * Formulas are copied verbatim from `QR_Z_Open/app.js:218-271, 601-626`.
 * The exceptions are spelled out in the doc comments below.
 */

/**
 * Prototype `gb()` — one decimal, always. A figure that is not a finite
 * number never reaches the screen: it renders as the em dash, so no surface
 * can show `NaN`.
 */
export function gb(value: number): string {
  return Number.isFinite(value) ? value.toFixed(1) : NO_VALUE;
}

/**
 * Funnel segment width (`app.js:232`): two decimals, **no clamp**.
 * Four segments at 100% each would overflow the track, and the
 * prototype lets them — preserved on purpose for pixel parity.
 */
export function segmentWidth(ratio: number): string {
  return (ratio * 100).toFixed(2) + '%';
}

/**
 * Stat bar width (`app.js:233`): one decimal, **clamped at 100**.
 * The prototype deliberately uses a different precision here than for
 * the funnel segments; changing it breaks pixel parity.
 */
export function barWidth(ratio: number): string {
  return Math.min(100, ratio * 100).toFixed(1) + '%';
}

/**
 * Event storage bar (`app.js:641`): clamped, no fixed precision.
 *
 * DEVIATION from the prototype, which divides unguarded
 * (`Math.min(100, e.used / e.max * 100)`, `app.js:641`): with `max` of 0
 * the width is `NaN%` — or a full bar when `used` is not 0. The storage
 * counters are not stored (design §3), so an event without a contract
 * reaches this with no figures; `max <= 0` renders an empty bar (`0%`)
 * instead of `NaN`/`Infinity`.
 */
export function storageWidth(used: number, max: number): string {
  if (!(max > 0)) return '0%';
  return Math.min(100, (used / max) * 100) + '%';
}

/**
 * Threshold colouring of the provider storage bars (`app.js:626`).
 *
 * DEVIATION from the prototype, which computes `e.used / e.max` unguarded:
 * an event without a contract would divide by zero and paint its bar `bad`
 * (red) — or leave it uncoloured when the ratio is `NaN`. `max <= 0`
 * therefore returns no modifier.
 */
export function barClass(used: number, max: number): '' | 'warn' | 'bad' {
  if (!(max > 0)) return '';
  const ratio = used / max;
  return ratio > 0.85 ? 'bad' : ratio > 0.65 ? 'warn' : '';
}

/** The used/max figures of an event: "12.4 / 50 GB", or the em dash. */
export function storageLine(storage: StorageFixture | undefined): string {
  return storage === undefined ? NO_VALUE : `${gb(storage.used)} / ${storage.max} GB`;
}

/** The usage line of the storage modal: "12.4 GB DE 50 GB", or the em dash. */
export function storageUsage(storage: StorageFixture | undefined): string {
  return storage === undefined ? NO_VALUE : `${gb(storage.used)} GB DE ${storage.max} GB`;
}

/** The width of an event's storage bar: "24.8%", or "0%" without a contract. */
export function storageBarWidth(storage: StorageFixture | undefined): string {
  return storage === undefined ? '0%' : storageWidth(storage.used, storage.max);
}

/** The threshold class of an event's storage bar. */
export function storageBarClass(storage: StorageFixture | undefined): '' | 'warn' | 'bad' {
  return storage === undefined ? '' : barClass(storage.used, storage.max);
}

/** The share of the contracted storage in use, as whole percent. */
export function usedPercent(totals: StorageTotals): number {
  return totals.max > 0 ? Math.round((totals.used / totals.max) * 100) : 0;
}

export function computeMetrics(guests: readonly Guest[]): Metrics {
  const planned = guests.length;
  const invited = guests.filter((x) => x.status !== 'planned').length;
  const confirmed = guests.filter((x) => x.status === 'confirmed').length;
  const declined = guests.filter((x) => x.status === 'declined').length;
  const sentPend = invited - confirmed - declined;
  const comp = guests
    .filter((x) => x.status === 'confirmed')
    .reduce((a, x) => a + x.party.length, 0);
  const compPrev = guests.reduce((a, x) => a + x.party.length, 0);
  const passes = confirmed + comp;
  const potential = guests.reduce((a, x) => a + 1 + x.party.length, 0);
  return { planned, invited, confirmed, declined, sentPend, comp, compPrev, passes, potential };
}

export function funnelSegments(metrics: Metrics): FunnelSegment[] {
  return [
    { key: 'conf', width: segmentWidth(metrics.confirmed / metrics.planned) },
    { key: 'sent', width: segmentWidth(metrics.sentPend / metrics.planned) },
    { key: 'unsent', width: segmentWidth((metrics.planned - metrics.invited) / metrics.planned) },
    { key: 'dec', width: segmentWidth(metrics.declined / metrics.planned) },
  ];
}

export function statDefs(metrics: Metrics): StatTileDef[] {
  const pct = (value: number) => Math.round((value / metrics.planned) * 100) + '% DE LA LISTA';
  return [
    {
      label: 'INVITADOS PLANEADOS',
      value: metrics.planned,
      ratio: 1,
      barWidth: barWidth(1),
      sub: 'LISTA MAESTRA DEL EVENTO',
      dark: false,
      flexGrow: 1,
    },
    {
      label: 'RECIBIERON EMAIL',
      value: metrics.invited,
      ratio: metrics.invited / metrics.planned,
      barWidth: barWidth(metrics.invited / metrics.planned),
      sub: pct(metrics.invited),
      dark: false,
      flexGrow: 1.08,
    },
    {
      label: 'CONFIRMARON ASISTENCIA',
      value: metrics.confirmed,
      ratio: metrics.confirmed / metrics.planned,
      barWidth: barWidth(metrics.confirmed / metrics.planned),
      sub: pct(metrics.confirmed),
      dark: false,
      flexGrow: 1.15,
    },
    {
      label: 'ACOMPAÑANTES',
      value: metrics.comp,
      ratio: metrics.comp / Math.max(1, metrics.compPrev),
      barWidth: barWidth(metrics.comp / Math.max(1, metrics.compPrev)),
      sub: `DE ${metrics.compPrev} PREVISTOS · C/U CON QR PROPIO`,
      dark: false,
      flexGrow: 0.92,
    },
    {
      label: 'PASES QR EMITIDOS',
      value: metrics.passes,
      ratio: metrics.passes / metrics.potential,
      barWidth: barWidth(metrics.passes / metrics.potential),
      sub: `TITULARES + ACOMPAÑANTES · CAP. ${metrics.potential}`,
      dark: true,
      flexGrow: 1.15,
    },
  ];
}

/**
 * Every pass that a confirmed guest can scan: the holder plus one code
 * per companion (`P-001`, `P-001·A1`, `P-001·A2`, …). Order matters —
 * the live feed draws from this array.
 */
export function passPoolOf(guests: readonly Guest[]): Pass[] {
  const pool: Pass[] = [];
  guests
    .filter((g) => g.status === 'confirmed')
    .forEach((g) => {
      pool.push({ code: g.id, name: g.name });
      g.party.forEach((p, i) => pool.push({ code: `${g.id}·A${i + 1}`, name: p.name }));
    });
  return pool;
}

/** The pass selected inside the ticket modal (`app.js:508-512`). */
export function passOf(guest: Guest, index: number): Pass {
  if (index === 0) return { code: guest.id, name: guest.name };
  const companion = guest.party[index - 1];
  return { code: `${guest.id}·A${index}`, name: companion ? companion.name : 'Acompañante' };
}

export function guestFilters(metrics: Metrics, total: number): FilterOption[] {
  return [
    { value: 'all', label: 'TODOS', count: total },
    { value: 'confirmed', label: 'CONFIRMADOS', count: metrics.confirmed },
    { value: 'sent', label: 'ENVIADOS', count: metrics.sentPend },
    { value: 'planned', label: 'POR INVITAR', count: metrics.planned - metrics.invited },
    { value: 'declined', label: 'DECLINÓ', count: metrics.declined },
  ];
}

/** Photo filters lead with `pending`, unlike the guest filters. */
export function photoFilters(photos: readonly EventPhoto[]): FilterOption[] {
  const count = (state: PhotoState) => photos.filter((p) => p.state === state).length;
  return [
    { value: 'pending', label: 'POR REVISAR', count: count('pending') },
    { value: 'approved', label: 'EN WEB', count: count('approved') },
    { value: 'rejected', label: 'RECHAZADAS', count: count('rejected') },
    { value: 'all', label: 'TODAS', count: photos.length },
  ];
}

/** Event filter counts live in the label (`"TODOS · 3"`), no `<sup>`. */
export function eventFilters(events: readonly PaseEvent[]): FilterOption[] {
  const count = (status: PaseEvent['status']) => events.filter((e) => e.status === status).length;
  return [
    { value: 'all', label: 'TODOS', count: events.length },
    { value: 'active', label: 'ACTIVOS', count: count('active') },
    { value: 'upcoming', label: 'PRÓXIMOS', count: count('upcoming') },
    { value: 'done', label: 'FINALIZADOS', count: count('done') },
  ];
}

export function kpis(events: readonly PaseEvent[]): KpiDef[] {
  // The scanner app state is display-only and the API sends none of it (the
  // scanner service does not exist yet), so the count comes from the
  // client-side display mock — resolved guard by guard, never from the raw
  // payload, which carries nothing to count.
  const online = events.reduce(
    (a, e) => a + resolvedGuards(e).filter((guard) => guard.app === 'online').length,
    0,
  );
  const guards = events.reduce((a, e) => a + e.security.length, 0);
  // The storage figures come from the client's own display mock — the API
  // sends none (they are not stored, design §3). Without a contract the
  // tile shows the em dash, never `NaN`.
  const totals = storageTotals(events);
  return [
    {
      label: 'EVENTOS ACTIVOS',
      value: String(events.filter((e) => e.status === 'active').length),
      unit: '',
      sub: 'LECTURA DE QR EN OPERACIÓN',
      subPrefix: '',
      subBold: '',
      flexGrow: 1,
    },
    {
      label: 'PRÓXIMOS',
      value: String(events.filter((e) => e.status === 'upcoming').length),
      unit: '',
      sub: 'EN PREPARACIÓN CON EL ADMIN',
      subPrefix: '',
      subBold: '',
      flexGrow: 1,
    },
    {
      label: 'ESCÁNERES EN LÍNEA',
      value: String(online),
      unit: `/ ${guards}`,
      sub: 'APP DE SEGURIDAD SINCRONIZADA',
      subPrefix: '',
      subBold: '',
      flexGrow: 1,
    },
    {
      label: 'ALMACENAMIENTO EN NUBE',
      value: totals === undefined ? NO_VALUE : gb(totals.used),
      unit: totals === undefined ? '' : 'GB',
      sub: '',
      subPrefix: totals === undefined ? '' : `DE ${totals.max} GB CONTRATADOS · `,
      subBold: totals === undefined ? '' : `${usedPercent(totals)}% EN USO`,
      flexGrow: 1.3,
    },
  ];
}
