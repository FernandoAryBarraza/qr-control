import { Component, input, output } from '@angular/core';

import type { Guest, GuestFilter } from '../../../core/models';
import type { SegmentFilterOption } from '../../../shared/segment-filter';
import { SearchField } from '../../../shared/search-field';
import { SegmentFilter } from '../../../shared/segment-filter';
import { GuestTable } from './guest-table';

@Component({
  selector: 'app-guest-registry',
  imports: [SearchField, SegmentFilter, GuestTable],
  template: `
    <section class="panel">
      <div class="panel-head">
        <div>
          <span class="sec-label">REGISTRO DE ACCESO</span>
          <h2 class="panel-title">
            Lista de invitados<span class="cnt"> ({{ guests().length }})</span>
          </h2>
        </div>
        <div class="tools">
          <app-search-field [value]="search()" (changed)="searchChanged.emit($event)" />
          <app-segment-filter
            [options]="filterOptions()"
            [value]="guestFilter()"
            ariaLabel="Filtro de invitados"
            (changed)="filterChanged.emit($any($event))"
          />
        </div>
      </div>
      <app-guest-table
        [guests]="guests()"
        [expandedGuests]="expandedGuests()"
        (toggleGuest)="toggleGuest.emit($event)"
        (sendInvite)="sendInvite.emit($event)"
        (confirm)="confirm.emit($event)"
        (showQr)="showQr.emit($event)"
        (showQrPass)="showQrPass.emit($event)"
      />
    </section>
  `,
  styles: `
    .panel {
      margin-top: 56px;
    }
    .panel-head {
      display: flex;
      align-items: flex-end;
      justify-content: space-between;
      gap: 24px;
      flex-wrap: wrap;
      padding-bottom: 18px;
      border-bottom: 1px solid var(--ink);
      margin-bottom: 0;
    }
    .panel-title {
      font: 550 30px/1.1 'Fraunces';
      letter-spacing: -0.01em;
      margin-top: 6px;
    }
    .panel-title .cnt {
      font: italic 400 18px 'Fraunces';
      color: var(--soft);
      margin-left: 10px;
    }
    .tools {
      display: flex;
      align-items: center;
      gap: 20px;
      flex-wrap: wrap;
    }
  `,
})
export class GuestRegistry {
  readonly guests = input.required<readonly Guest[]>();
  readonly expandedGuests = input.required<ReadonlySet<string>>();
  readonly guestFilter = input.required<string>();
  readonly filterOptions = input.required<readonly SegmentFilterOption[]>();
  readonly search = input('');

  readonly searchChanged = output<string>();
  readonly filterChanged = output<GuestFilter>();
  readonly toggleGuest = output<string>();
  readonly sendInvite = output<string>();
  readonly confirm = output<string>();
  readonly showQr = output<string>();
  readonly showQrPass = output<{ guestId: string; index: number }>();
}
