import { Injectable, computed, inject, signal } from '@angular/core';

import {
  computeMetrics,
  eventFilters,
  funnelSegments,
  guestFilters,
  kpis,
  passPoolOf,
  photoFilters,
  statDefs,
} from './metrics';
import type {
  EventFilter,
  EventPhoto,
  Guest,
  GuestFilter,
  GuestStatus,
  PaseEvent,
  Pass,
  PhotoFilter,
  PhotoState,
  Role,
} from './models';
import { EVENTS, GUESTS, PHOTOS, USERS } from './seed-data';
import { ToastService } from './toast.service';

/** Immutable set toggle — expanded rows/records are held as a whole set. */
function toggleIn(set: ReadonlySet<string>, id: string): ReadonlySet<string> {
  const next = new Set(set);
  if (!next.delete(id)) next.add(id);
  return next;
}

/**
 * Single source of truth for both the seed data and the UI state.
 *
 * Every record is treated as immutable: a mutation replaces the object
 * and the array (`update`, never `mutate`), which is what lets `guests`,
 * `photos` and `events` be shared with the derived `computed()`s without
 * surprises. There is no persistence — the prototype has none either, so
 * a reload replays the seed snapshot exactly.
 */
@Injectable({ providedIn: 'root' })
export class PaseStore {
  protected readonly toast = inject(ToastService);

  /* ---------- Datos ---------- */
  readonly guests = signal<readonly Guest[]>(GUESTS);
  readonly photos = signal<readonly EventPhoto[]>(PHOTOS);
  readonly events = signal<readonly PaseEvent[]>(EVENTS);
  readonly passPool = signal<readonly Pass[]>(passPoolOf(GUESTS));

  /* ---------- Estado de interfaz ---------- */
  readonly role = signal<Role>('admin');
  readonly guestFilter = signal<GuestFilter>('all');
  readonly guestQuery = signal('');
  readonly photoFilter = signal<PhotoFilter>('pending');
  readonly eventFilter = signal<EventFilter>('all');
  readonly expandedGuests = signal<ReadonlySet<string>>(new Set<string>());
  readonly expandedEvents = signal<ReadonlySet<string>>(new Set<string>());

  /* ---------- Derivados ---------- */
  readonly metrics = computed(() => computeMetrics(this.guests()));
  readonly funnel = computed(() => funnelSegments(this.metrics()));
  readonly stats = computed(() => statDefs(this.metrics()));
  readonly guestFilterOptions = computed(() => guestFilters(this.metrics(), this.guests().length));
  readonly photoFilterOptions = computed(() => photoFilters(this.photos()));
  readonly eventFilterOptions = computed(() => eventFilters(this.events()));
  readonly kpis = computed(() => kpis(this.events()));
  readonly user = computed(() => USERS[this.role()]);

  /** Guests matching the active filter and search box (`app.js:324-328`). */
  readonly visibleGuests = computed(() => {
    const query = this.guestQuery().trim().toLowerCase();
    const filter = this.guestFilter();
    return this.guests().filter(
      (g) =>
        (filter === 'all' || g.status === filter) &&
        (!query ||
          g.name.toLowerCase().includes(query) ||
          g.email.toLowerCase().includes(query) ||
          g.id.toLowerCase().includes(query)),
    );
  });

  /** Photos matching the active filter (`app.js:363-365`). */
  readonly visiblePhotos = computed(() => {
    const filter = this.photoFilter();
    return this.photos().filter((p) => filter === 'all' || p.state === filter);
  });

  readonly visibleEvents = computed(() => {
    const filter = this.eventFilter();
    return this.events().filter((e) => filter === 'all' || e.status === filter);
  });

  readonly pendingPhotoCount = computed(
    () => this.photos().filter((p) => p.state === 'pending').length,
  );

  /* ---------- Roles ---------- */
  setRole(role: Role): void {
    if (this.role() === role) return;
    this.role.set(role);
  }

  /* ---------- Filtros y expansión ---------- */
  setGuestFilter(filter: GuestFilter): void {
    this.guestFilter.set(filter);
  }

  setGuestQuery(query: string): void {
    this.guestQuery.set(query);
  }

  setPhotoFilter(filter: PhotoFilter): void {
    this.photoFilter.set(filter);
  }

  setEventFilter(filter: EventFilter): void {
    this.eventFilter.set(filter);
  }

  toggleGuest(id: string): void {
    this.expandedGuests.update((set) => toggleIn(set, id));
  }

  toggleEvent(id: string): void {
    this.expandedEvents.update((set) => toggleIn(set, id));
  }

  /* ---------- Mutaciones ---------- */
  sendInvite(id: string): void {
    const guest = this.guests().find((g) => g.id === id);
    if (!guest) return;
    this.setGuestStatus(id, 'sent');
    this.toast.push(`Invitación enviada por email a ${guest.name}`, 'ok', 'mail');
  }

  /**
   * The prototype pushes the guest and their companions into the pass
   * pool unconditionally (`app.js:781-782`), so confirming twice yields
   * duplicate codes. Poses are deduplicated here instead.
   */
  confirmGuest(id: string): void {
    const guest = this.guests().find((g) => g.id === id);
    if (!guest) return;
    this.setGuestStatus(id, 'confirmed');

    const confirmed: Guest = { ...guest, status: 'confirmed' };
    const added = passPoolOf([confirmed]);
    this.passPool.update((pool) => {
      const known = new Set(pool.map((pass) => pass.code));
      return pool.concat(added.filter((pass) => !known.has(pass.code)));
    });

    this.toast.push(
      `${guest.name} confirmó — ${1 + guest.party.length} pases QR emitidos`,
      'ok',
      'badgeCheck',
    );
  }

  setPhotoState(id: string, state: PhotoState): void {
    const photo = this.photos().find((p) => p.id === id);
    if (!photo || photo.state === state) return;
    this.photos.update((list) => list.map((p) => (p.id === id ? { ...p, state } : p)));
    this.toast.push(
      state === 'approved'
        ? `Foto de ${photo.author} aprobada — visible en la web del evento`
        : `Foto de ${photo.author} rechazada — oculta para invitados`,
      state === 'approved' ? 'ok' : 'warn',
      state === 'approved' ? 'badgeCheck' : 'circleSlash',
    );
  }

  toggleDownload(id: string): void {
    const photo = this.photos().find((p) => p.id === id);
    if (!photo) return;
    const dl = !photo.dl;
    this.photos.update((list) => list.map((p) => (p.id === id ? { ...p, dl } : p)));
    this.toast.push(
      dl ? 'Descarga habilitada para los invitados' : 'Descarga deshabilitada — solo vista en web',
      dl ? 'ok' : 'warn',
      'download',
    );
  }

  /**
   * Widens the storage plan. The breakdown figures are intentionally
   * left untouched, matching the prototype — the bar can therefore read
   * above a fifth of a freshly widened plan.
   */
  applyPlan(eventId: string, max: number): void {
    const event = this.events().find((e) => e.id === eventId);
    if (!event) return;
    this.events.update((list) => list.map((e) => (e.id === eventId ? { ...e, max } : e)));
    this.toast.push(`Plan ampliado a ${max} GB para ${event.name}`, 'ok', 'hardDrive');
  }

  guestById(id: string): Guest | undefined {
    return this.guests().find((g) => g.id === id);
  }

  eventById(id: string): PaseEvent | undefined {
    return this.events().find((e) => e.id === id);
  }

  private setGuestStatus(id: string, status: GuestStatus): void {
    this.guests.update((list) => list.map((g) => (g.id === id ? { ...g, status } : g)));
  }
}
