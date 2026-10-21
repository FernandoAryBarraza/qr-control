import {
  Component,
  DestroyRef,
  PLATFORM_ID,
  afterNextRender,
  inject,
  input,
  signal,
} from '@angular/core';
import { isPlatformBrowser } from '@angular/common';

import type { StatTileDef } from '../../../core/models';

@Component({
  selector: 'app-stat-tile',
  template: `
    <div class="stat" [class.dark]="def().dark" [style.flex-grow]="def().flexGrow">
      <div class="stat-label">{{ def().label }}</div>
      <div class="stat-num">{{ displayed() }}</div>
      <div class="stat-bar">
        <span class="stat-fill" [style.width]="def().barWidth"></span>
      </div>
      <div class="stat-sub">{{ def().sub }}</div>
    </div>
  `,
  styles: `
    :host {
      display: contents;
    }
    /* Prototype ruled row (QR_Z_Open/style.css:505-514): cells carry no
       outer card border or radius — only a left divider between siblings. */
    .stat {
      flex: 1 1 0;
      padding: 22px 28px 20px;
      border-left: 1px solid var(--line);
      display: flex;
      flex-direction: column;
      gap: 10px;
      min-width: 0;
    }
    /* The host is display:contents, so each .stat is the only child of its
       own host — :first-child on the cell would match every tile. The first
       cell is selected on the host instead (QR_Z_Open/style.css:511). */
    :host(:first-child) .stat {
      border-left: 0;
      padding-left: 4px;
    }
    .stat-label {
      font: 600 9.5px 'IBM Plex Mono';
      letter-spacing: 0.18em;
      color: var(--soft);
    }
    .stat-num {
      font: 550 60px/0.92 'Fraunces';
      letter-spacing: -0.01em;
    }
    .stat-sub {
      font: 500 10px 'IBM Plex Mono';
      letter-spacing: 0.08em;
      color: var(--soft);
      margin-top: auto;
    }
    /* Restored from QR_Z_Open/style.css:535-549. Without these the track
       had no height and the fill no background, so the verified barWidths
       (100.0 / 78.6 / 50.0 / 68.4 / 60.6) rendered nothing at all. */
    .stat-bar {
      height: 3px;
      background: rgba(27, 22, 17, 0.1);
      margin: 16px 0 10px;
      border-radius: 2px;
      overflow: hidden;
    }
    .stat-fill {
      display: block;
      height: 100%;
      background: var(--ink);
      width: 0;
      transition: width 0.9s cubic-bezier(0.25, 0.8, 0.25, 1);
    }
    /* Dark variant keeps the ink fill, a 3px radius and the accent fill
       (QR_Z_Open/style.css:557-580), but no card border. */
    .stat.dark {
      background: var(--ink);
      color: var(--cream);
      border-left: 0;
      border-radius: 3px;
    }
    .stat.dark .stat-label,
    .stat.dark .stat-sub {
      color: var(--cream-dim);
    }
    .stat.dark .stat-fill {
      background: var(--accent);
    }
    .stat.dark .stat-bar {
      background: rgba(243, 239, 230, 0.15);
    }

    /* Prototype 920 block (QR_Z_Open/style.css:2117-2129). Enforced here, not
       globally, because these selectors are component-scoped. Inline
       [style.flex-grow] still overrides the grow factor; the basis is what
       this rule controls. */
    @media (max-width: 920px) {
      .stat {
        flex: 1 1 46%;
        padding: 18px 20px;
      }
      :host(:first-child) .stat {
        padding-left: 20px;
      }
      .stat.dark {
        flex: 1 1 100%;
      }
    }
  `,
})
export class StatTile {
  readonly def = input.required<StatTileDef>();

  protected displayed = signal(0);

  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
  private readonly destroyRef = inject(DestroyRef);
  private frameId: number | null = null;

  constructor() {
    afterNextRender(() => {
      if (!this.isBrowser) return;
      const target = this.def().value;
      const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      if (prefersReduced) {
        this.displayed.set(target);
        return;
      }
      const from = 0;
      const t0 = performance.now();
      const dur = 900;
      const step = (t: number) => {
        const p = Math.min(1, (t - t0) / dur);
        const e = 1 - Math.pow(1 - p, 3);
        this.displayed.set(Math.round(from + (target - from) * e));
        if (p < 1) {
          this.frameId = requestAnimationFrame(step);
        } else {
          this.displayed.set(target);
        }
      };
      this.frameId = requestAnimationFrame(step);
      this.destroyRef.onDestroy(() => {
        if (this.frameId !== null) cancelAnimationFrame(this.frameId);
      });
    });
  }
}
