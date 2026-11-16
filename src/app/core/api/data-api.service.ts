import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import type { EventPhoto, Guest, GuestStatus, PaseEvent, PhotoState } from '../models';

/**
 * Trusted caller identity for every read (design §2, "no auth in this change"):
 * the deterministic seeded provider user. The server resolves the role from the
 * `User` row and never trusts this value, so the header only answers "who is
 * calling" until a real auth layer swaps the extractor (one function, design §2).
 */
const TRUSTED_USER_ID = 'usr-001';

/**
 * Writes are admin-only server-side (BR-13: `canWriteObject` requires the
 * assigned admin). With no auth layer yet, mutations act as the seeded event
 * admin so the demo can persist; reads keep acting as the provider. A single
 * trusted identity is honest for the no-auth prototype — resolving the caller's
 * own admin id per event belongs to the future auth stage.
 */
const TRUSTED_ADMIN_ID = 'usr-002';

/** `PATCH /api/guests/:id` payload — status and/or the BR-13 active flag. */
export interface GuestPatch {
  readonly status?: GuestStatus;
  readonly active?: boolean;
}

/** `PATCH /api/photos/:id` payload — state, active and/or the download flag. */
export interface PhotoPatch {
  readonly state?: PhotoState;
  readonly active?: boolean;
  readonly dl?: boolean;
}

/**
 * Browser-side read path to the standalone REST API (design §4):
 * components → PaseStore → this service → HTTP `/api/*`. It is the ONLY HTTP
 * surface the client gets — no Prisma import can reach `src/app/**` through it.
 *
 * Payloads are already domain-shaped: the 1c repositories map Prisma rows to the
 * `readonly` interfaces of `models.ts` at the server boundary, so the client
 * only needs the type assertion, not a field-by-field transformation.
 */
@Injectable({ providedIn: 'root' })
export class DataApiService {
  private readonly http = inject(HttpClient);

  /** `GET /api/events` — the caller-scoped event list (BR-03). */
  listEvents(): Promise<readonly PaseEvent[]> {
    return firstValueFrom(
      this.http.get<readonly PaseEvent[]>('/api/events', { headers: this.caller }),
    );
  }

  /** `GET /api/events/:id/guests` — guests (with companions) of one event. */
  listGuests(eventId: string): Promise<readonly Guest[]> {
    const id = encodeURIComponent(eventId);
    return firstValueFrom(
      this.http.get<readonly Guest[]>(`/api/events/${id}/guests`, { headers: this.caller }),
    );
  }

  /** `GET /api/events/:id/photos` — photos of one event. */
  listPhotos(eventId: string): Promise<readonly EventPhoto[]> {
    const id = encodeURIComponent(eventId);
    return firstValueFrom(
      this.http.get<readonly EventPhoto[]>(`/api/events/${id}/photos`, { headers: this.caller }),
    );
  }

  /** `PATCH /api/guests/:id` — admin write (status/active). Returns the updated guest. */
  patchGuest(id: string, patch: GuestPatch): Promise<Guest> {
    const sid = encodeURIComponent(id);
    return firstValueFrom(
      this.http.patch<Guest>(`/api/guests/${sid}`, patch, { headers: this.adminCaller }),
    );
  }

  /** `PATCH /api/photos/:id` — admin write (state/active/dl). Returns the updated photo. */
  patchPhoto(id: string, patch: PhotoPatch): Promise<EventPhoto> {
    const sid = encodeURIComponent(id);
    return firstValueFrom(
      this.http.patch<EventPhoto>(`/api/photos/${sid}`, patch, { headers: this.adminCaller }),
    );
  }

  private get caller(): Record<string, string> {
    return { 'x-user-id': TRUSTED_USER_ID };
  }

  private get adminCaller(): Record<string, string> {
    return { 'x-user-id': TRUSTED_ADMIN_ID };
  }
}
