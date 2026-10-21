import { isPlatformBrowser } from '@angular/common';
import {
  DestroyRef,
  Injectable,
  PLATFORM_ID,
  afterNextRender,
  inject,
  signal,
} from '@angular/core';

import { nowTime } from './date-format';
import type { FeedItem, FeedResultClass } from './models';
import { PaseStore } from './pase-store';
import { GATES } from './seed-data';

/** Ring-buffer size of the scan feed (`app.js:694`). */
const FEED_CAPACITY = 30;

/** Cadence of the simulated scanner, in ms (`app.js:696`). */
const FEED_INTERVAL = 3600;

/**
 * Simulated scanner activity. Purely cosmetic and deliberately random —
 * the prototype seeds nothing here, and neither does this.
 *
 * Note that the prototype's `seedFeed()` (`app.js:697, 880`) is a no-op:
 * `feedTick()` bails out while the provider view is hidden, which it is at
 * boot, so all six priming calls return immediately. Seeding is therefore
 * omitted rather than "fixed".
 *
 * The interval lives inside `afterNextRender` and is torn down via
 * `DestroyRef`, so the Node render never spins a timer and never touches
 * a DOM node.
 *
 * The `DestroyRef` is resolved in the field initializer, NOT inside the
 * `afterNextRender` callback: the callback runs outside any injection
 * context, and `inject()` there raises NG0203.
 */
@Injectable({ providedIn: 'root' })
export class FeedService {
  private readonly store = inject(PaseStore);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
  private readonly destroyRef = inject(DestroyRef);
  private nextId = 0;

  readonly items = signal<readonly FeedItem[]>([]);
  readonly paused = signal(false);

  constructor() {
    afterNextRender(() => {
      if (!this.isBrowser) return;
      const timer = setInterval(() => this.tick(), FEED_INTERVAL);
      this.destroyRef.onDestroy(() => clearInterval(timer));
    });
  }

  togglePaused(): void {
    this.paused.update((paused) => !paused);
  }

  /** Exposed for tests; the interval is the only production caller. */
  tick(): void {
    // The prototype read `$('#view-provider').hidden`; the role signal is
    // the equivalent source of truth here.
    if (this.paused() || this.store.role() !== 'provider') return;

    const pool = this.store.passPool();
    if (!pool.length) return;

    const pass = pool[Math.floor(Math.random() * pool.length)];
    const gate = GATES[Math.floor(Math.random() * GATES.length)];

    const roll = Math.random();
    const [label, cls]: readonly [string, FeedResultClass] =
      roll < 0.86
        ? ['VÁLIDO', 'fx-ok']
        : roll < 0.96
          ? ['RE-INGRESO', 'fx-warn']
          : ['PASE DUPLICADO', 'fx-bad'];

    const item: FeedItem = {
      id: ++this.nextId,
      time: nowTime(),
      code: pass.code,
      name: pass.name,
      gate,
      result: { label, cls },
    };

    this.items.update((list) => {
      const next = [item, ...list];
      return next.length > FEED_CAPACITY ? next.slice(0, FEED_CAPACITY) : next;
    });
  }
}
