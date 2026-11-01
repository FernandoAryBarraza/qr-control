import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import type { EventPhoto, Guest, PaseEvent } from '../models';
import { DataApiService } from './data-api.service';

/** Domain-shaped payloads exactly as the 1c repositories serialize them. */
const EVENT: PaseEvent = {
  id: 'ev-001',
  status: 'active',
  name: 'Harbor Lights Festival',
  dateLabel: '14 JUN 2025 · 20:00',
  guests: 14,
  photos: 6,
  admin: { name: 'Mariana Solórzano' },
  security: [{ name: 'Rafael Ortiz' }],
};

const GUEST: Guest = {
  id: 'g-001',
  name: 'Ana Torres',
  email: 'ana.torres@example.com',
  phone: '+34 600 111 222',
  status: 'confirmed',
  table: 4,
  party: [{ name: 'Luis Torres', rel: 'pareja' }],
  note: '',
};

const PHOTO: EventPhoto = {
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
};

describe('DataApiService', () => {
  let api: DataApiService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    api = TestBed.inject(DataApiService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('lists events from GET /api/events carrying the trusted caller header', async () => {
    const pending = api.listEvents();

    const req = http.expectOne('/api/events');
    expect(req.request.method).toBe('GET');
    expect(req.request.headers.get('x-user-id')).toBe('usr-001');
    req.flush([EVENT]);

    await expect(pending).resolves.toEqual([EVENT]);
  });

  it('lists the guests of an event from GET /api/events/:id/guests', async () => {
    const pending = api.listGuests('ev-001');

    const req = http.expectOne('/api/events/ev-001/guests');
    expect(req.request.method).toBe('GET');
    expect(req.request.headers.get('x-user-id')).toBe('usr-001');
    req.flush([GUEST]);

    await expect(pending).resolves.toEqual([GUEST]);
  });

  it('lists the photos of an event from GET /api/events/:id/photos', async () => {
    const pending = api.listPhotos('ev-001');

    const req = http.expectOne('/api/events/ev-001/photos');
    expect(req.request.method).toBe('GET');
    expect(req.request.headers.get('x-user-id')).toBe('usr-001');
    req.flush([PHOTO]);

    await expect(pending).resolves.toEqual([PHOTO]);
  });

  it('propagates HTTP errors as rejections so callers can fall back', async () => {
    const pending = api.listEvents();

    http
      .expectOne('/api/events')
      .flush({ message: 'boom' }, { status: 500, statusText: 'Server Error' });

    await expect(pending).rejects.toBeDefined();
  });

  it('patches a guest through PATCH /api/guests/:id with the admin caller header', async () => {
    const patched: Guest = { ...GUEST, status: 'sent' };
    const pending = api.patchGuest('g-001', { status: 'sent' });

    const req = http.expectOne('/api/guests/g-001');
    expect(req.request.method).toBe('PATCH');
    expect(req.request.body).toEqual({ status: 'sent' });
    expect(req.request.headers.get('x-user-id')).toBe('usr-002'); // assigned admin writes
    req.flush(patched);

    await expect(pending).resolves.toEqual(patched);
  });

  it('patches a photo through PATCH /api/photos/:id (state/dl/active)', async () => {
    const pending = api.patchPhoto('ph-001', { dl: true });

    const req = http.expectOne('/api/photos/ph-001');
    expect(req.request.method).toBe('PATCH');
    expect(req.request.body).toEqual({ dl: true });
    expect(req.request.headers.get('x-user-id')).toBe('usr-002');
    req.flush({ ...PHOTO, dl: true });

    await expect(pending).resolves.toEqual({ ...PHOTO, dl: true });
  });

  it('propagates PATCH rejections so the store can revert the optimistic update', async () => {
    const pending = api.patchGuest('g-001', { status: 'sent' });

    http
      .expectOne('/api/guests/g-001')
      .flush({ message: 'nope' }, { status: 403, statusText: 'Forbidden' });

    await expect(pending).rejects.toBeDefined();
  });
});
