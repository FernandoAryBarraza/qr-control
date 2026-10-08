import { Component, input } from '@angular/core';

import type { FunnelSegment } from '../../../core/models';

@Component({
  selector: 'app-funnel-bar',
  template: `
    <div class="funnel">
      @for (seg of segments(); track seg.key) {
        <div
          class="fseg"
          [class.conf]="seg.key === 'conf'"
          [class.sent]="seg.key === 'sent'"
          [class.unsent]="seg.key === 'unsent'"
          [class.dec]="seg.key === 'dec'"
          [style.width]="seg.width"
        ></div>
      }
    </div>
  `,
  styles: `
    .funnel {
      display: flex;
      height: 14px;
      border: 1px solid var(--ink);
      background: var(--paper2);
      overflow: hidden;
      border-radius: 2px;
    }

    .fseg {
      height: 100%;
      transition: width 0.8s cubic-bezier(0.25, 0.8, 0.25, 1);
    }

    .fseg.conf {
      background: var(--green);
    }

    .fseg.sent {
      background: var(--amber);
    }

    .fseg.unsent {
      background: rgba(27, 22, 17, 0.5);
    }

    .fseg.dec {
      background: var(--accent);
    }
  `,
})
export class FunnelBar {
  readonly segments = input.required<readonly FunnelSegment[]>();
}
