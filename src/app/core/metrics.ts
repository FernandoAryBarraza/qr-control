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

/**
 * Pure derivation of every figure the UI shows. No DOM, no signals, no
 * randomness — a unit test can call these directly with the seed data.
 *
 * Formulas are copied verbatim from `QR_Z_Open/app.js:218-271, 601-626`.
 */

/** Prototype `gb()` — one decimal, always. */
export function gb(value: number): string {
  return value.toFixed(1);
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

/** Event storage bar (`app.js:641`): clamped, no fixed precision. */
export function storageWidth(used: number, max: number): string {
  return Math.min(100, (used / max) * 100) + '%';
}

/** Threshold colouring of the provider storage bars (`app.js:626`). */
export function barClass(used: number, max: number): '' | 'warn' | 'bad' {
  const ratio = used / max;
  return ratio > 0.85 ? 'bad' : ratio > 0.65 ? 'warn' : '';
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
  const online = events.reduce(
    (a, e) => a + e.security.filter((s) => s.app === 'online').length,
    0,
  );
  const guards = events.reduce((a, e) => a + e.security.length, 0);
  const used = events.reduce((a, e) => a + e.used, 0);
  const max = events.reduce((a, e) => a + e.max, 0);
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
      value: gb(used),
      unit: 'GB',
      sub: '',
      subPrefix: `DE ${max} GB CONTRATADOS · `,
      subBold: `${Math.round((used / max) * 100)}% EN USO`,
      flexGrow: 1.3,
    },
  ];
}
