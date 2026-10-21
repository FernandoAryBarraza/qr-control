import { Component, computed, inject, input } from '@angular/core';

import type { PaseEvent } from '../../core/models';
import { kpis } from '../../core/metrics';

@Component({
  selector: 'app-provider-kpi-row',
  // `.kpi-row` is a direct child of `.pv-hero` in the prototype; the custom
  // element needs to be a block for the row to span the hero's padding box.
  styles: `
    :host {
      display: block;
    }
  `,
  // The value sits in its own `<span>` for the same reason as in
  // `SegmentFilter`: Angular preserves the trailing whitespace of an
  // interpolated text node that is followed by a control-flow block, so
  // `{{ kpi.value }}` written directly ahead of `@if` renders "51.4 GB" once
  // the template is split across lines. With the wrapper that gap becomes a
  // whitespace-only text node, which Angular removes, and
  // `.kpi-num .unit`'s `margin-left: 4px` (QR_Z_Open/style.css:1662-1666)
  // stays the only spacing between value and unit.
  template: `
    <div class="kpi-row">
      @for (kpi of kpiDefs(); track $index) {
        <div class="kpi" [style.flex-grow]="kpi.flexGrow">
          <div class="kpi-label">{{ kpi.label }}</div>
          <div class="kpi-num">
            <span>{{ kpi.value }}</span>
            @if (kpi.unit) {
              <span class="unit">{{ kpi.unit }}</span>
            }
          </div>
          <div class="kpi-sub">
            @if (kpi.subPrefix) {
              {{ kpi.subPrefix }}
            }
            @if (kpi.subBold) {
              <b>{{ kpi.subBold }}</b>
            }
            @if (kpi.sub && !kpi.subPrefix) {
              {{ kpi.sub }}
            }
          </div>
        </div>
      }
    </div>
  `,
})
export class ProviderKpiRow {
  readonly events = input.required<readonly PaseEvent[]>();

  protected readonly kpiDefs = computed(() => kpis(this.events()));
}
