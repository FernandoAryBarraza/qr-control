import { Component, computed, inject, input } from '@angular/core';

import type { PaseEvent } from '../../core/models';
import { kpis } from '../../core/metrics';

@Component({
  selector: 'app-provider-kpi-row',
  // `.kpi-row` is a direct child of `.pv-hero` in the prototype; the custom
  // element needs to be a block for the row to span the hero's padding box.
  styles: `
    :host {
      display: block
    }
  `,
  template: `
    <div class="kpi-row">
      @for (kpi of kpiDefs(); track $index) {
        <div class="kpi" [style.flex-grow]="kpi.flexGrow">
          <div class="kpi-label">{{ kpi.label }}</div>
          <div class="kpi-num">
            {{ kpi.value }}@if (kpi.unit) {<span class="unit">{{ kpi.unit }}</span>}
          </div>
          <div class="kpi-sub">
            @if (kpi.subPrefix) {{{ kpi.subPrefix }}}@if (kpi.subBold) {<b>{{ kpi.subBold }}</b>}
            @if (kpi.sub && !kpi.subPrefix) {{{ kpi.sub }}}
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
