import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import type { EventPhoto, Guest, PaseEvent } from './models';
import { PaseStore } from './pase-store';
import { ToastService } from './toast.service';

/** API payload shaped exactly like the 1c repositories serialize it. */
const DB_EVENT: PaseEvent = {
  id: 'ev-001',
  status: 'active',
  name: 'Harbor Lights Festival',
  dateLabel: '14 JUN 2025 · 20:00',
  guests: 3,
  photos: 1,
  admin: { name: 'Mariana Solórzano' },
  security: [{ name: 'Rafael Ortiz' }],
};

const DB_GUESTS: readonly Guest[] = [
  {
    id: 'g-001',
    name: 'Ana Torres',
    email: 'ana.torres@example.com',
    phone: '+34 600 111 222',
    status: 'confirmed',
    table: 4,
    party: [{ name: 'Luis Torres', rel: 'pareja' }],
    note: '',
  },
  {
    id: 'g-002',
    name: 'Marco Vidal',
    email: 'marco.vidal@example.com',
    phone: '+34 600 222 333',
    status: 'declined',
    table: 0,
    party: [],
    note: '',
  },
  {
    id: 'g-003',
    name: 'Sofía Núñez',
    email: 'sofia.nunez@example.com',
    phone: '+34 600 333 444',
    status: 'planned',
    table: 12,
    party: [],
    note: '',
  },
];

const DB_PHOTOS: readonly EventPhoto[] = [
  {
    id: 'ph-001',
    seed: 'ph-001',
    author: 'Ana Torres',
    state: 'approved',
    dl: false,
    size: 3.2,
    h: 800,
    time: '20:15',
    url: 'https://cdn.example.com/ph-001.jpg',
    big: 'https://cdn.example.com/ph-001-big.jpg',
  },
];

/** Lets queued microtasks run so the per-event follow-up requests exist. */
const settle = (): Promise<void> => new Promise<void>((resolve) => setTimeout(resolve, 0));

describe('PaseStore.load() — hydration-safe client read path', () => {
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('starts empty in a loading state without seed data or any request', () => {
    const store = TestBed.inject(PaseStore);

    // Server and client construct the exact same empty state — this identity
    // is what makes the prerendered HTML hydrate without NG05xx (design §4).
    // PR-4 removed the bundled seed snapshot, so no seed literal can leak into
    // the store through construction.
    expect(store.loading()).toBe(true);
    expect(store.guests()).toEqual([]);
    expect(store.photos()).toEqual([]);
    expect(store.events()).toEqual([]);
    expect(store.passPool()).toEqual([]);
    http.expectNone(() => true);
  });

  it('load() populates guests/photos/events from the API and rebuilds the pass pool', async () => {
    const store = TestBed.inject(PaseStore);
    const pending = store.load();

    const eventsReq = http.expectOne('/api/events');
    expect(eventsReq.request.headers.get('x-user-id')).toBe('usr-001');
    eventsReq.flush([DB_EVENT]);
    await settle();

    const guestsReq = http.expectOne('/api/events/ev-001/guests');
    const photosReq = http.expectOne('/api/events/ev-001/photos');
    guestsReq.flush(DB_GUESTS);
    photosReq.flush(DB_PHOTOS);
    await pending;

    expect(store.loading()).toBe(false);
    expect(store.events()).toEqual([DB_EVENT]);
    expect(store.guests()).toEqual(DB_GUESTS);
    expect(store.photos()).toEqual(DB_PHOTOS);

    // The pool must follow the persisted guest IDs (`g-001…`), not the seed
    // snapshot's (`P-001…`), or feed/QR codes would point at phantom records.
    expect(store.passPool().map((pass) => pass.code)).toEqual(['g-001', 'g-001·A1']);
  });

  it('keeps every counter as computed() state derived from the loaded data', async () => {
    const store = TestBed.inject(PaseStore);
    const pending = store.load();
    http.expectOne('/api/events').flush([DB_EVENT]);
    await settle();
    http.expectOne('/api/events/ev-001/guests').flush(DB_GUESTS);
    http.expectOne('/api/events/ev-001/photos').flush(DB_PHOTOS);
    await pending;

    // Seed snapshot has 7 confirmed / 14 guests — the figures must come from
    // the three loaded records instead (metrics/kpis stay computed(), 1d.3).
    expect(store.metrics().confirmed).toBe(1);
    expect(store.metrics().planned).toBe(3);
    expect(store.metrics().passes).toBe(2);
    expect(store.pendingPhotoCount()).toBe(0);
  });

  it('keeps the storage counters out of the payload — the client owns them', async () => {
    const store = TestBed.inject(PaseStore);
    const pending = store.load();
    http.expectOne('/api/events').flush([DB_EVENT]);
    await settle();
    http.expectOne('/api/events/ev-001/guests').flush(DB_GUESTS);
    http.expectOne('/api/events/ev-001/photos').flush(DB_PHOTOS);
    await pending;

    // The API does not own the storage counters (they are not stored —
    // design §3), so the payload carries none; the client's display mock
    // resolves them instead.
    expect(store.events()[0]).not.toHaveProperty('used');
    expect(store.events()[0]).not.toHaveProperty('max');
    expect(store.events()[0]).not.toHaveProperty('br');
  });

  it('stays empty and ends loading when the API rejects', async () => {
    const store = TestBed.inject(PaseStore);
    const toast = TestBed.inject(ToastService);
    const pending = store.load();

    http
      .expectOne('/api/events')
      .flush({ message: 'down' }, { status: 503, statusText: 'Service Unavailable' });
    await expect(pending).resolves.toBeUndefined();

    expect(store.loading()).toBe(false);
    expect(store.guests()).toEqual([]);
    expect(store.events()).toEqual([]);
    expect(store.passPool()).toEqual([]);
    expect(toast.toasts()).toHaveLength(1);
    expect(toast.toasts()[0]?.kind).toBe('warn');
  });
});

describe('PaseStore mutations — optimistic updates with API persistence (PR-2b)', () => {
  let http: HttpTestingController;
  let store: PaseStore;
  let toast: ToastService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    http = TestBed.inject(HttpTestingController);
    store = TestBed.inject(PaseStore);
    toast = TestBed.inject(ToastService);
  });

  afterEach(() => http.verify());

  /** Loads the DB-shaped fixtures so mutations run against persisted `g-*`/`ph-*` rows. */
  async function loadDb(): Promise<void> {
    const pending = store.load();
    http.expectOne('/api/events').flush([DB_EVENT]);
    await settle();
    http.expectOne('/api/events/ev-001/guests').flush(DB_GUESTS);
    http.expectOne('/api/events/ev-001/photos').flush(DB_PHOTOS);
    await pending;
  }

  const guestStatus = (id: string): string | undefined =>
    store.guests().find((g) => g.id === id)?.status;

  const photoOf = (id: string): EventPhoto | undefined => store.photos().find((p) => p.id === id);

  it('sendInvite patches the guest optimistically and keeps it on success', async () => {
    await loadDb();

    store.sendInvite('g-003'); // planned -> sent

    // Optimistic: the signal flips synchronously, before the server confirms.
    expect(guestStatus('g-003')).toBe('sent');

    const req = http.expectOne('/api/guests/g-003');
    expect(req.request.method).toBe('PATCH');
    expect(req.request.body).toEqual({ status: 'sent' });
    expect(req.request.headers.get('x-user-id')).toBe('usr-002'); // assigned admin writes
    req.flush({ ...DB_GUESTS[2], status: 'sent' });
    await settle();

    expect(guestStatus('g-003')).toBe('sent');
    expect(toast.toasts()).toHaveLength(1);
    expect(toast.toasts()[0]?.kind).toBe('ok');
  });

  it('sendInvite reverts the guest and warns when the API rejects', async () => {
    await loadDb();

    store.sendInvite('g-003');
    expect(guestStatus('g-003')).toBe('sent'); // optimistic

    http
      .expectOne('/api/guests/g-003')
      .flush({ message: 'nope' }, { status: 403, statusText: 'Forbidden' });
    await settle();

    expect(guestStatus('g-003')).toBe('planned'); // reverted
    expect(toast.toasts()).toHaveLength(1);
    expect(toast.toasts()[0]?.kind).toBe('warn');
  });

  it('confirmGuest patches status and adds passes optimistically, keeping both on success', async () => {
    await loadDb();

    store.confirmGuest('g-003');
    expect(guestStatus('g-003')).toBe('confirmed');
    expect(store.passPool().map((p) => p.code)).toContain('g-003'); // optimistic pass

    const req = http.expectOne('/api/guests/g-003');
    expect(req.request.body).toEqual({ status: 'confirmed' });
    req.flush({ ...DB_GUESTS[2], status: 'confirmed' });
    await settle();

    expect(guestStatus('g-003')).toBe('confirmed');
    expect(store.passPool().map((p) => p.code)).toContain('g-003');
    expect(toast.toasts()[0]?.kind).toBe('ok');
  });

  it('confirmGuest reverts both status and pass pool when the API rejects', async () => {
    await loadDb();
    const poolBefore = store.passPool().map((p) => p.code);

    store.confirmGuest('g-003');
    http
      .expectOne('/api/guests/g-003')
      .flush({ message: 'nope' }, { status: 500, statusText: 'Server Error' });
    await settle();

    expect(guestStatus('g-003')).toBe('planned');
    expect(store.passPool().map((p) => p.code)).toEqual(poolBefore); // pool restored
    expect(toast.toasts()[0]?.kind).toBe('warn');
  });

  it('setPhotoState patches the photo state optimistically and keeps it on success', async () => {
    await loadDb();

    store.setPhotoState('ph-001', 'rejected'); // approved -> rejected
    expect(photoOf('ph-001')?.state).toBe('rejected');

    const req = http.expectOne('/api/photos/ph-001');
    expect(req.request.body).toEqual({ state: 'rejected' });
    req.flush({ ...DB_PHOTOS[0], state: 'rejected' });
    await settle();

    expect(photoOf('ph-001')?.state).toBe('rejected');
    expect(toast.toasts()[0]?.kind).toBe('warn'); // rejected toast is a warning
  });

  it('setPhotoState reverts the photo and warns when the API rejects', async () => {
    await loadDb();

    store.setPhotoState('ph-001', 'rejected');
    http
      .expectOne('/api/photos/ph-001')
      .flush({ message: 'nope' }, { status: 500, statusText: 'Server Error' });
    await settle();

    expect(photoOf('ph-001')?.state).toBe('approved'); // reverted
    expect(toast.toasts()[0]?.kind).toBe('warn');
  });

  it('toggleDownload patches dl optimistically and keeps it on success', async () => {
    await loadDb();

    store.toggleDownload('ph-001'); // dl false -> true
    expect(photoOf('ph-001')?.dl).toBe(true);

    const req = http.expectOne('/api/photos/ph-001');
    expect(req.request.body).toEqual({ dl: true });
    req.flush({ ...DB_PHOTOS[0], dl: true });
    await settle();

    expect(photoOf('ph-001')?.dl).toBe(true);
    expect(toast.toasts()[0]?.kind).toBe('ok');
  });

  it('toggleDownload reverts dl and warns when the API rejects', async () => {
    await loadDb();

    store.toggleDownload('ph-001');
    http
      .expectOne('/api/photos/ph-001')
      .flush({ message: 'nope' }, { status: 500, statusText: 'Server Error' });
    await settle();

    expect(photoOf('ph-001')?.dl).toBe(false); // reverted
    expect(toast.toasts()[0]?.kind).toBe('warn');
  });

  it('setGuestActive patches the active flag optimistically and reverts it when the API rejects', async () => {
    await loadDb();

    store.setGuestActive('g-001', false);
    expect(store.guests().find((g) => g.id === 'g-001')?.active).toBe(false); // optimistic

    const req = http.expectOne('/api/guests/g-001');
    expect(req.request.method).toBe('PATCH');
    expect(req.request.body).toEqual({ active: false });
    expect(req.request.headers.get('x-user-id')).toBe('usr-002');
    req.flush({ message: 'nope' }, { status: 403, statusText: 'Forbidden' });
    await settle();

    expect(store.guests().find((g) => g.id === 'g-001')?.active).toBeUndefined(); // reverted
    expect(toast.toasts()[0]?.kind).toBe('warn');
  });

  it('setPhotoActive patches the active flag optimistically and reverts it when the API rejects', async () => {
    await loadDb();

    store.setPhotoActive('ph-001', false);
    expect(photoOf('ph-001')?.active).toBe(false); // optimistic

    const req = http.expectOne('/api/photos/ph-001');
    expect(req.request.method).toBe('PATCH');
    expect(req.request.body).toEqual({ active: false });
    expect(req.request.headers.get('x-user-id')).toBe('usr-002');
    req.flush({ message: 'nope' }, { status: 403, statusText: 'Forbidden' });
    await settle();

    expect(photoOf('ph-001')?.active).toBeUndefined(); // reverted
    expect(toast.toasts()[0]?.kind).toBe('warn');
  });

  it('setGuestActive keeps the flag on API success', async () => {
    await loadDb();

    store.setGuestActive('g-001', false);
    expect(store.guests().find((g) => g.id === 'g-001')?.active).toBe(false); // optimistic

    const req = http.expectOne('/api/guests/g-001');
    expect(req.request.body).toEqual({ active: false });
    req.flush({ ...DB_GUESTS[0], active: false });
    await settle();

    expect(store.guests().find((g) => g.id === 'g-001')?.active).toBe(false); // kept
    // Deactivation intentionally uses the warn-styled toast (circleSlash), like
    // the revert styling, so pin the message, not just the kind.
    expect(toast.toasts()[0]?.message).toBe('Invitado desactivado');
  });

  it('setPhotoActive keeps the flag on API success', async () => {
    await loadDb();

    store.setPhotoActive('ph-001', false);
    expect(photoOf('ph-001')?.active).toBe(false); // optimistic

    const req = http.expectOne('/api/photos/ph-001');
    expect(req.request.body).toEqual({ active: false });
    req.flush({ ...DB_PHOTOS[0], active: false });
    await settle();

    expect(photoOf('ph-001')?.active).toBe(false); // kept
    // Same deliberate warn-styled toast as the guest deactivation path.
    expect(toast.toasts()[0]?.message).toBe('Foto desactivada');
  });
});
