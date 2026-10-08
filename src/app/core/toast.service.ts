import { isPlatformBrowser } from '@angular/common';
import { DestroyRef, Injectable, PLATFORM_ID, inject, signal } from '@angular/core';

import type { PaseIconName } from '../shared/icons';
import type { Toast, ToastKind } from './models';

/** Visible lifetime of a toast, in ms (`app.js:23`). */
const TOAST_LIFETIME = 3400;

/** How long the exit animation runs before the node is dropped. */
const TOAST_EXIT = 320;

interface ToastTimers {
  expire?: ReturnType<typeof setTimeout>;
  drop?: ReturnType<typeof setTimeout>;
}

/**
 * Transient notification queue. The prototype appends nodes to a
 * container by hand; here the list is a signal and `ToastHost` renders
 * it inside a `role="log"` live region, which the prototype lacks.
 *
 * Every timer is created inside `push()` (user interaction, browser
 * only) and cleared on destroy — nothing is scheduled at module scope,
 * so the Node render never leaves a timer behind.
 */
@Injectable({ providedIn: 'root' })
export class ToastService {
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
  private readonly timers = new Map<number, ToastTimers>();
  private nextId = 0;

  readonly toasts = signal<readonly Toast[]>([]);

  constructor() {
    inject(DestroyRef).onDestroy(() => this.clear());
  }

  /** Server-issued toasts are dropped: there is no one to announce them to. */
  push(message: string, kind: ToastKind = 'ink', icon: PaseIconName = 'check'): void {
    if (!this.isBrowser) return;
    const id = ++this.nextId;
    this.toasts.update((list) => [...list, { id, message, kind, icon, leaving: false }]);

    const expire = setTimeout(() => {
      this.toasts.update((list) => list.map((t) => (t.id === id ? { ...t, leaving: true } : t)));
      const drop = setTimeout(() => {
        this.toasts.update((list) => list.filter((t) => t.id !== id));
        delete this.timers.get(id)?.drop;
      }, TOAST_EXIT);
      const entry = this.timers.get(id);
      if (entry) entry.drop = drop;
    }, TOAST_LIFETIME);

    this.timers.set(id, { expire });
  }

  clear(): void {
    for (const entry of this.timers.values()) {
      if (entry.expire) clearTimeout(entry.expire);
      if (entry.drop) clearTimeout(entry.drop);
    }
    this.timers.clear();
    this.toasts.set([]);
  }
}
