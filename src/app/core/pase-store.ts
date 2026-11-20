import { Injectable, computed, inject, signal } from '@angular/core';

import { DataApiService } from './api/data-api.service';
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
// v1 display fixture (same category as GATES/PUBLIC_WEB_URL), not seed state.
import { USERS } from './seed-data';
import { ToastService } from './toast.service';

/** Immutable set toggle — expanded rows/records are held as a whole set. */
function toggleIn(set: ReadonlySet<string>, id: string): ReadonlySet<string> {
  const next = new Set(set);
  if (!next.delete(id)) next.add(id);
  return next;
}

/**
 * Single source of truth for the UI state.
 *
 * Every record is treated as immutable: a mutation replaces the object
 * and the array (`update`, never `mutate`), which is what lets `guests`,
 * `photos` and `events` be shared with the derived `computed()`s without
 * surprises.
 *
 * Hydration-safe read path (design §4 / spec req 15): the store starts empty
 * in a `loading` state — identical on server and client, so the prerendered
 * HTML hydrates without mismatch — and `load()` (browser-only,
 * `afterNextRender`) fills the data signals with the persisted snapshot fetched
 * over HTTP. Mutations apply optimistically to the signals and persist through
 * `DataApiService`, reverting on API failure (PR-2b). PR-4 removed the bundled
 * seed snapshot: a failed `load()` leaves the store empty, not seeded.
 */
@Injectable({ providedIn: 'root' })
export class PaseStore {
  protected readonly toast = inject(ToastService);
  private readonly api = inject(DataApiService);

  /* ---------- Datos ---------- */
  readonly guests = signal<readonly Guest[]>([]);
  readonly photos = signal<readonly EventPhoto[]>([]);
  readonly events = signal<readonly PaseEvent[]>([]);
  readonly passPool = signal<readonly Pass[]>([]);

  /** True while the initial post-hydration fetch has not settled yet (design §4). */
  readonly loading = signal(true);

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

  /* ---------- Carga inicial (post-hidratación) ---------- */
  /**
   * Fetches the persisted snapshot (`GET /api/events` + per-event guests and
   * photos) and writes it into the signals. Called from `afterNextRender` in
   * the root component, so the Node render and the first client render only
   * ever see the empty state above — no hydration divergence is possible.
   *
   * On failure the store stays empty (no seed fallback after PR-4) and a toast
   * surfaces the error; either way the loading state ends, so UI guards can
   * never spin forever. `passPool` is built from the persisted guest IDs so
   * feed/QR codes cannot point at records the server does not know.
   */
  async load(): Promise<void> {
    try {
      const events = await this.api.listEvents();
      const [guestLists, photoLists] = await Promise.all([
        Promise.all(events.map((event) => this.api.listGuests(event.id))),
        Promise.all(events.map((event) => this.api.listPhotos(event.id))),
      ]);

      const guests = guestLists.flat();
      const photos = photoLists.flat();

      this.events.set(events);
      this.guests.set(guests);
      this.photos.set(photos);
      this.passPool.set(passPoolOf(guests));
      this.loading.set(false);
    } catch {
      this.loading.set(false);
      this.toast.push('No se pudo cargar la información del servidor', 'warn', 'circleSlash');
    }
  }

  /* ---------- Mutaciones ---------- */
  /**
   * Sends the invitation: optimistically marks the guest `sent`, then persists
   * via `PATCH /api/guests/:id`. On API failure the status reverts (PR-2b).
   */
  sendInvite(id: string): void {
    const guest = this.guests().find((g) => g.id === id);
    if (!guest) return;
    const before = this.guests();
    void this.persist(
      () => this.api.patchGuest(id, { status: 'sent' }),
      () => this.setGuestStatus(id, 'sent'),
      () => this.guests.set(before),
      () => this.toast.push(`Invitación enviada por email a ${guest.name}`, 'ok', 'mail'),
      'No se pudo enviar la invitación',
    );
  }

  /**
   * The prototype pushes the guest and their companions into the pass
   * pool unconditionally (`app.js:781-782`), so confirming twice yields
   * duplicate codes. Poses are deduplicated here instead. The guest status
   * AND the pass pool are optimistic and revert together on API failure.
   */
  confirmGuest(id: string): void {
    const guest = this.guests().find((g) => g.id === id);
    if (!guest) return;
    const guestsBefore = this.guests();
    const poolBefore = this.passPool();
    void this.persist(
      () => this.api.patchGuest(id, { status: 'confirmed' }),
      () => {
        this.setGuestStatus(id, 'confirmed');
        const confirmed: Guest = { ...guest, status: 'confirmed' };
        const added = passPoolOf([confirmed]);
        this.passPool.update((pool) => {
          const known = new Set(pool.map((pass) => pass.code));
          return pool.concat(added.filter((pass) => !known.has(pass.code)));
        });
      },
      () => {
        this.guests.set(guestsBefore);
        this.passPool.set(poolBefore);
      },
      () =>
        this.toast.push(
          `${guest.name} confirmó — ${1 + guest.party.length} pases QR emitidos`,
          'ok',
          'badgeCheck',
        ),
      'No se pudo confirmar al invitado',
    );
  }

  setPhotoState(id: string, state: PhotoState): void {
    const photo = this.photos().find((p) => p.id === id);
    if (!photo || photo.state === state) return;
    const before = this.photos();
    void this.persist(
      () => this.api.patchPhoto(id, { state }),
      () => this.photos.update((list) => list.map((p) => (p.id === id ? { ...p, state } : p))),
      () => this.photos.set(before),
      () =>
        this.toast.push(
          state === 'approved'
            ? `Foto de ${photo.author} aprobada — visible en la web del evento`
            : `Foto de ${photo.author} rechazada — oculta para invitados`,
          state === 'approved' ? 'ok' : 'warn',
          state === 'approved' ? 'badgeCheck' : 'circleSlash',
        ),
      'No se pudo cambiar el estado de la foto',
    );
  }

  toggleDownload(id: string): void {
    const photo = this.photos().find((p) => p.id === id);
    if (!photo) return;
    const dl = !photo.dl;
    const before = this.photos();
    void this.persist(
      () => this.api.patchPhoto(id, { dl }),
      () => this.photos.update((list) => list.map((p) => (p.id === id ? { ...p, dl } : p))),
      () => this.photos.set(before),
      () =>
        this.toast.push(
          dl
            ? 'Descarga habilitada para los invitados'
            : 'Descarga deshabilitada — solo vista en web',
          dl ? 'ok' : 'warn',
          'download',
        ),
      'No se pudo actualizar la descarga',
    );
  }

  /**
   * BR-13 guest soft toggle, wired to `PATCH /api/guests/:id`. The prototype
   * admin view has no toggle control yet (UI deferred), but the store surface is
   * API-backed and covered by specs so a future control is a one-line binding.
   */
  setGuestActive(id: string, active: boolean): void {
    const before = this.guests();
    void this.persist(
      () => this.api.patchGuest(id, { active }),
      () => this.guests.update((list) => list.map((g) => (g.id === id ? { ...g, active } : g))),
      () => this.guests.set(before),
      () =>
        this.toast.push(
          active ? 'Invitado reactivado' : 'Invitado desactivado',
          active ? 'ok' : 'warn',
          active ? 'badgeCheck' : 'circleSlash',
        ),
      'No se pudo actualizar el invitado',
    );
  }

  /** BR-13 photo soft toggle, wired to `PATCH /api/photos/:id` (see setGuestActive). */
  setPhotoActive(id: string, active: boolean): void {
    const before = this.photos();
    void this.persist(
      () => this.api.patchPhoto(id, { active }),
      () => this.photos.update((list) => list.map((p) => (p.id === id ? { ...p, active } : p))),
      () => this.photos.set(before),
      () =>
        this.toast.push(
          active ? 'Foto reactivada' : 'Foto desactivada',
          active ? 'ok' : 'warn',
          active ? 'badgeCheck' : 'circleSlash',
        ),
      'No se pudo actualizar la foto',
    );
  }

  /**
   * Widens the storage plan. The breakdown figures are intentionally
   * left untouched, matching the prototype — the bar can therefore read
   * above a fifth of a freshly widened plan. Stays in-memory: the storage
   * counters are client-owned (design §3) and the API has no event PATCH
   * endpoint yet (event writes land in PR-4).
   */
  applyPlan(eventId: string, max: number): void {
    const event = this.events().find((e) => e.id === eventId);
    if (!event) return;
    this.events.update((list) => list.map((e) => (e.id === eventId ? { ...e, max } : e)));
    this.toast.push(`Plan ampliado a ${max} GB para ${event.name}`, 'ok', 'hardDrive');
  }

  /**
   * Applies `apply` optimistically, then issues `request`. On success the
   * optimistic state stands (the patches are deterministic); on failure the
   * captured `revert` restores the pre-mutation signals and a warning surfaces —
   * so a rejected write can never leave the UI claiming a state the server did
   * not persist.
   */
  private async persist(
    request: () => Promise<unknown>,
    apply: () => void,
    revert: () => void,
    success: () => void,
    errorMessage: string,
  ): Promise<void> {
    apply();
    try {
      await request();
      success();
    } catch {
      revert();
      this.toast.push(errorMessage, 'warn', 'circleSlash');
    }
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
