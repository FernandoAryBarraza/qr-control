import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import type { EventPhoto, Guest, PaseEvent } from '../models';

/**
 * Trusted caller identity for every read (design §2, "no auth in this change"):
 * the deterministic seeded provider user. The server resolves the role from the
 * `User` row and never trusts this value, so the header only answers "who is
 * calling" until a real auth layer swaps the extractor (one function, design §2).
 */
const TRUSTED_USER_ID = 'usr-001';

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

  private get caller(): Record<string, string> {
    return { 'x-user-id': TRUSTED_USER_ID };
  }
}
