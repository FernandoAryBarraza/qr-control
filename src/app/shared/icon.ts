import { Component, computed, input } from '@angular/core';

import { PASE_ICONS, type PaseIconName } from './icons';

/**
 * Renders one Lucide glyph as a bare `<svg>`.
 *
 * The template deliberately has **no wrapper element** inside the host:
 * the prototype sizes icons with descendant selectors (`.btn svg`,
 * `.ibtn svg`, `.toast svg`, …) and an extra box would break every one
 * of them.
 */
@Component({
  selector: 'app-icon',
  template: `
    <svg
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      stroke="currentColor"
      stroke-linecap="round"
      stroke-linejoin="round"
      viewBox="0 0 24 24"
      [attr.width]="size()"
      [attr.height]="size()"
      [attr.role]="label() ? 'img' : null"
      [attr.aria-label]="label() || null"
      [attr.aria-hidden]="label() ? null : 'true'"
    >
      @for (node of nodes(); track $index) {
        @switch (node[0]) {
          @case ('path') {
            <path [attr.d]="node[1]['d']" />
          }
          @case ('rect') {
            <rect
              [attr.x]="node[1]['x']"
              [attr.y]="node[1]['y']"
              [attr.width]="node[1]['width']"
              [attr.height]="node[1]['height']"
              [attr.rx]="node[1]['rx']"
            />
          }
          @case ('circle') {
            <circle [attr.cx]="node[1]['cx']" [attr.cy]="node[1]['cy']" [attr.r]="node[1]['r']" />
          }
          @case ('line') {
            <line
              [attr.x1]="node[1]['x1']"
              [attr.y1]="node[1]['y1']"
              [attr.x2]="node[1]['x2']"
              [attr.y2]="node[1]['y2']"
            />
          }
        }
      }
    </svg>
  `,
  styles: `
    :host {
      display: inline-flex;
      line-height: 0
    }
  `,
})
export class Icon {
  readonly name = input.required<PaseIconName>();
  /** Fallback size in px. Every sizing rule in the design comes from CSS. */
  readonly size = input<number | string>(24);
  /** Accessible name. Empty means decorative, so the svg is hidden. */
  readonly label = input('');

  protected readonly nodes = computed(() => PASE_ICONS[this.name()]);
}
