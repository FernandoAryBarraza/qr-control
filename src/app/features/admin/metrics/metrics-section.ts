import { Component, DestroyRef, PLATFORM_ID, afterNextRender, computed, inject, input, signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';

import type { FunnelSegment, StatTileDef } from '../../../core/models';
import { FunnelBar } from './funnel-bar';
import { StatTile } from './stat-tile';

@Component({
  selector: 'app-metrics-section',
  imports: [FunnelBar, StatTile],
  template: `
    <section class="metrics">
      <div class="metrics-head">
        <span class="sec-label">CIFRAS DE INVITACIÓN</span>
        <span class="metrics-upd">{{ updatedAt() }}</span>
      </div>
      <app-funnel-bar [segments]="segments()" />
      <div class="legend">
        <span class="lgi"><span class="swatch conf"></span>CONFIRMADOS</span>
        <span class="lgi"><span class="swatch sent"></span>EMAIL ENVIADO · SIN RESPONDER</span>
        <span class="lgi"><span class="swatch unsent"></span>POR INVITAR</span>
        <span class="lgi"><span class="swatch dec"></span>DECLINARON</span>
      </div>
      <div class="stat-row">
        @for (def of stats(); track $index) {
          <app-stat-tile [def]="def" />
        }
      </div>
    </section>
  `,
  styles: `
    .metrics {
      display: flex;
      flex-direction: column;
      gap: 14px;
    }

    .metrics-head {
      display: flex;
      justify-content: space-between;
      align-items: baseline;
      margin-bottom: 14px;
    }

    .metrics-upd {
      font: 500 10px 'IBM Plex Mono';
      letter-spacing: 0.12em;
      color: var(--soft);
    }

    .legend {
      display: flex;
      flex-wrap: wrap;
      gap: 18px;
      margin-top: 12px;
      font: 600 10px 'IBM Plex Mono';
      letter-spacing: 0.12em;
      color: var(--soft);
    }

    .lgi {
      display: inline-flex;
      align-items: center;
      gap: 8px;
    }

    .swatch {
      width: 8px;
      height: 8px;
      display: inline-block;
    }

    .swatch.conf {
      background: var(--green);
    }

    .swatch.sent {
      background: var(--amber);
    }

    .swatch.unsent {
      background: rgba(27, 22, 17, 0.5);
    }

    .swatch.dec {
      background: var(--accent);
    }

    /* Prototype "ruled row" (QR_Z_Open/style.css:499-503): the row itself
       carries the top/bottom ink rules; cells only add inter-cell dividers.
       No flex-wrap here so the global @920px rule can introduce wrapping. */
    .stat-row {
      display: flex;
      gap: 0;
      margin-top: 20px;
      border-top: 1px solid var(--ink);
      border-bottom: 1px solid var(--ink);
    }
  `,
})
export class MetricsSection {
  readonly segments = input.required<readonly FunnelSegment[]>();
  readonly stats = input.required<readonly StatTileDef[]>();

  readonly updatedAt = signal('ACTUALIZADO —');

  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
  private readonly destroyRef = inject(DestroyRef);

  constructor() {
    afterNextRender(() => {
      if (!this.isBrowser) return;
      this.updatedAt.set(`ACTUALIZADO ${this.nowTime()}`);
      const timer = setInterval(() => {
        this.updatedAt.set(`ACTUALIZADO ${this.nowTime()}`);
      }, 1000);
      this.destroyRef.onDestroy(() => clearInterval(timer));
    });
  }

  private nowTime(): string {
    const d = new Date();
    return `${this.pad2(d.getHours())}:${this.pad2(d.getMinutes())}:${this.pad2(d.getSeconds())}`;
  }

  private pad2(v: number): string {
    return v < 10 ? `0${v}` : String(v);
  }
}
