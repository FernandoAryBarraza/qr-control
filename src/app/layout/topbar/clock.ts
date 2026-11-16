import { isPlatformBrowser } from '@angular/common';
import { Component, DestroyRef, PLATFORM_ID, afterNextRender, inject, signal } from '@angular/core';

import { clockLabel } from '../../core/date-format';

/**
 * Live header clock.
 *
 * The prototype ticks `setInterval(tickClock, 1000)` and writes straight
 * into the DOM (`app.js:188`). Rendering that value through Angular would
 * bake a server timestamp into the HTML that hydration then compares
 * against a client timestamp — a guaranteed `NG0500`.
 *
 * So the label starts as the prototype's `—` placeholder (identical on
 * both sides of hydration) and is filled in inside `afterNextRender`.
 * `aria-hidden` keeps the once-a-second change off screen readers.
 */
@Component({
  selector: 'app-clock',
  template: `<div class="clock">{{ label() }}</div>`,
  host: { 'aria-hidden': 'true' },
  styles: `
    :host {
      display: inline-flex;
    }

    .clock {
      font: 500 11.5px 'IBM Plex Mono';
      letter-spacing: 0.08em;
      color: var(--soft);
    }
  `,
})
export class Clock {
  readonly label = signal('—');

  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
  private readonly destroyRef = inject(DestroyRef);

  constructor() {
    afterNextRender(() => {
      if (!this.isBrowser) return;
      this.label.set(clockLabel());
      const timer = setInterval(() => this.label.set(clockLabel()), 1000);
      this.destroyRef.onDestroy(() => clearInterval(timer));
    });
  }
}
