import type { PaseIconName } from '../shared/icons';

/** Which of the two single-page views is showing. */
export type Role = 'admin' | 'provider';

export type GuestStatus = 'confirmed' | 'sent' | 'planned' | 'declined';
export type GuestFilter = 'all' | GuestStatus;

export interface PartyMember {
  readonly name: string;
  readonly rel: string;
}

export interface Guest {
  readonly id: string;
  readonly name: string;
  readonly email: string;
  readonly phone: string;
  readonly status: GuestStatus;
  readonly table: number;
  readonly party: readonly PartyMember[];
  readonly note: string;
}

/** A single scannable credential. Code for companions is `P-001·A1`. */
export interface Pass {
  readonly code: string;
  readonly name: string;
}

export type PhotoState = 'approved' | 'pending' | 'rejected';
export type PhotoFilter = 'pending' | 'approved' | 'rejected' | 'all';

export interface EventPhoto {
  readonly id: string;
  readonly seed: string;
  readonly author: string;
  readonly state: PhotoState;
  readonly dl: boolean;
  readonly size: number;
  readonly h: number;
  readonly time: string;
  readonly url: string;
  readonly big: string;
}

export type EventStatus = 'active' | 'upcoming' | 'done';
export type EventFilter = 'all' | EventStatus;

export type ScanAppState = 'online' | 'idle' | 'none' | 'archived';

export interface SecurityGuard {
  readonly name: string;
  readonly post: string;
  readonly app: ScanAppState;
  readonly last: string | null;
}

export interface EventAdmin {
  readonly name: string;
  readonly email: string;
  readonly phone: string;
  readonly since: string;
}

export interface StorageBreakdown {
  readonly FOTOS: number;
  readonly 'VÍDEOS': number;
  readonly OTROS: number;
}

export interface PaseEvent {
  readonly id: string;
  readonly status: EventStatus;
  readonly name: string;
  readonly dateLabel: string;
  readonly cd: string | null;
  readonly guests: number;
  readonly photos: number;
  readonly used: number;
  readonly max: number;
  readonly br: StorageBreakdown;
  readonly note?: string;
  readonly admin: EventAdmin;
  readonly security: readonly SecurityGuard[];
}

export type AppStateKey = ScanAppState;

export interface AppStateDef {
  readonly label: string;
  readonly cls: string;
}

export interface PaseUser {
  readonly ini: string;
  readonly name: string;
  readonly role: string;
}

/** Aggregate invitation figures. Pure function of the guest list. */
export interface Metrics {
  readonly planned: number;
  readonly invited: number;
  readonly confirmed: number;
  readonly declined: number;
  readonly sentPend: number;
  readonly comp: number;
  readonly compPrev: number;
  readonly passes: number;
  readonly potential: number;
}

export type FunnelKey = 'conf' | 'sent' | 'unsent' | 'dec';

export interface FunnelSegment {
  readonly key: FunnelKey;
  /** Already formatted, two decimals, unclamped — see `segmentWidth`. */
  readonly width: string;
}

export interface StatTileDef {
  readonly label: string;
  readonly value: number;
  readonly ratio: number;
  /** Already formatted, one decimal, clamped at 100 — see `barWidth`. */
  readonly barWidth: string;
  readonly sub: string;
  readonly dark: boolean;
  readonly flexGrow: number;
}

export interface KpiDef {
  readonly label: string;
  readonly value: string;
  readonly unit: string;
  readonly sub: string;
  /** Rendered before `subBold` when set; empty otherwise. */
  readonly subPrefix: string;
  /** Rendered emphasised (`<b>`) inside the sub-line when set. */
  readonly subBold: string;
  readonly flexGrow: number;
}

export interface FilterOption {
  readonly value: string;
  readonly label: string;
  readonly count: number;
}

export interface StoragePlan {
  readonly gb: number;
  readonly price: number;
}

export type FeedResultClass = 'fx-ok' | 'fx-warn' | 'fx-bad';

export interface FeedResult {
  readonly label: string;
  readonly cls: FeedResultClass;
}

export interface FeedItem {
  readonly id: number;
  readonly time: string;
  readonly code: string;
  readonly name: string;
  readonly gate: string;
  readonly result: FeedResult;
}

export type ToastKind = 'ink' | 'ok' | 'warn';

export interface Toast {
  readonly id: number;
  readonly message: string;
  readonly kind: ToastKind;
  readonly icon: PaseIconName;
  /** `true` once the 3400 ms lifetime elapsed; drives the exit animation. */
  readonly leaving: boolean;
}

export type ModalKind = 'ticket' | 'publicWeb' | 'lightbox' | 'contact' | 'storagePlan';

/**
 * Payload of the single overlay the app can show at a time. The
 * prototype's lightbox reuses its own overlay instead of stacking, so
 * the app never holds a stack — see `ModalService`.
 */
export interface ModalRef {
  readonly kind: ModalKind;
  readonly guestId?: string;
  readonly passIndex?: number;
  readonly eventId?: string;
  readonly photoList?: readonly string[];
  readonly photoIndex?: number;
}
