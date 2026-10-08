import { Component } from '@angular/core';

/**
 * Film-grain overlay. Sits at `z-index: 200` — above the modal scrim
 * (90) and the sticky topbar (50), below the toast stack (300) — and is
 * pointer-transparent, so it never intercepts a click.
 *
 * The rule itself lives in `src/styles.css` (`.grain`) to keep the
 * noise data-URI out of a component stylesheet.
 */
@Component({
  selector: 'app-grain-overlay',
  template: '<div class="grain"></div>',
  host: {
    'aria-hidden': 'true',
    role: 'presentation',
  },
})
export class GrainOverlay {}
