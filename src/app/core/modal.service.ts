import { Injectable, signal } from '@angular/core';

import type { ModalRef } from './models';

/**
 * Holds the overlay the app is showing.
 *
 * There is deliberately no stack: the prototype's lightbox reuses its
 * own overlay node instead of stacking (`app.js:447-452`), so approving
 * or rejecting from inside it mutates in place rather than piling up
 * overlays. A single `current` reproduces that behaviour — and it also
 * removes the ambiguity of the prototype's document-level Escape
 * handler, which popped "the last overlay in `#modals`".
 */
@Injectable({ providedIn: 'root' })
export class ModalService {
  readonly current = signal<ModalRef | null>(null);

  open(ref: ModalRef): void {
    this.current.set(ref);
  }

  close(): void {
    this.current.set(null);
  }

  /** Escape path. Identical to `close()` while no stack exists. */
  closeTop(): void {
    this.close();
  }

  /** Update the open overlay in place (lightbox cursor, pass selection). */
  patch(changes: Partial<ModalRef>): void {
    this.current.update((current) => (current ? { ...current, ...changes } : current));
  }
}
