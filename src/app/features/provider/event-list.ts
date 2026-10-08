import { Component, input, output } from '@angular/core';

import type { PaseEvent } from '../../core/models';
import { EventRow } from './event-row';

@Component({
  selector: 'app-event-list',
  imports: [EventRow],
  // The prototype has a single `.events-col` wrapper (index.html:178) holding
  // both the filter bar and the list; `ProviderView` already renders it, so
  // this component must not nest a second one.
  template: `
    @for (event of events(); track event.id) {
      <app-event-row
        [event]="event"
        [expanded]="expandedEvents().has(event.id)"
        (toggle)="toggleEvent.emit(event.id)"
        (contactAdmin)="contactAdmin.emit(event.id)"
        (upgradeStorage)="upgradeStorage.emit(event.id)"
      />
    }
  `,
  styles: `
    :host {
      display: block
    }
  `,
})
export class EventList {
  readonly events = input.required<readonly PaseEvent[]>();
  readonly expandedEvents = input.required<ReadonlySet<string>>();

  readonly toggleEvent = output<string>();
  readonly contactAdmin = output<string>();
  readonly upgradeStorage = output<string>();
}
