import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { passPoolOf } from './metrics';
import type { EventPhoto, Guest, PaseEvent } from './models';
import { PaseStore } from './pase-store';
import { EVENTS, GUESTS, PHOTOS } from './seed-data';
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

  it('starts from the bundled snapshot in a loading state without issuing any request', () => {
    const store = TestBed.inject(PaseStore);

    // Server and client construct the exact same bundled constants — this
    // identity is what makes the prerendered HTML hydrate without NG05xx
    // (design §4): nothing here can differ between the two environments.
    expect(store.loading()).toBe(true);
    expect(store.guests()).toBe(GUESTS);
    expect(store.photos()).toBe(PHOTOS);
    expect(store.events()).toBe(EVENTS);
    expect(store.passPool()).toEqual(passPoolOf(GUESTS));
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

  it('falls back to the seed snapshot and ends loading when the API rejects', async () => {
    const store = TestBed.inject(PaseStore);
    const toast = TestBed.inject(ToastService);
    const pending = store.load();

    http
      .expectOne('/api/events')
      .flush({ message: 'down' }, { status: 503, statusText: 'Service Unavailable' });
    await expect(pending).resolves.toBeUndefined();

    expect(store.loading()).toBe(false);
    expect(store.guests()).toBe(GUESTS);
    expect(store.events()).toBe(EVENTS);
    expect(toast.toasts()).toHaveLength(1);
    expect(toast.toasts()[0]?.kind).toBe('warn');
  });
});
