import { Component, input, output } from '@angular/core';

import type { Guest } from '../../../core/models';
import { GuestRow } from './guest-row';
import { GuestDetail } from './guest-detail';

@Component({
  selector: 'app-guest-table',
  imports: [GuestRow, GuestDetail],
  template: `
    <div class="table-wrap">
      <table class="gtable">
        <thead>
          <tr>
            <th scope="col">PASE</th>
            <th scope="col">INVITADO</th>
            <th scope="col">CONTACTO</th>
            <th scope="col">FIESTA</th>
            <th scope="col">ESTADO</th>
            <th scope="col" class="ta-r">ACCIONES</th>
            <th scope="col" class="ta-r"><span class="sr-only">Expandir/Contraer detalle</span></th>
          </tr>
        </thead>
        <tbody>
          @for (guest of guests(); track guest.id) {
            <tr
              app-guest-row
              [guest]="guest"
              [expanded]="expandedGuests().has(guest.id)"
              (toggle)="toggleGuest.emit(guest.id)"
              (sendInvite)="sendInvite.emit(guest.id)"
              (confirm)="confirm.emit(guest.id)"
              (showQr)="showQr.emit(guest.id)"
            ></tr>
            @if (expandedGuests().has(guest.id)) {
              <tr
                app-guest-detail
                [guest]="guest"
                (showQrPass)="showQrPass.emit({ guestId: guest.id, index: $event })"
              ></tr>
            }
          }
          @if (!guests().length) {
            <tr class="empty-row">
              <td colspan="7">Ningún invitado coincide con la búsqueda.</td>
            </tr>
          }
        </tbody>
      </table>
    </div>
  `,
  styles: `
    .table-wrap { overflow-x: auto; }
    .gtable { width: 100%; border-collapse: collapse; min-width: 880px; }
    .gtable th { font: 600 9.5px 'IBM Plex Mono'; letter-spacing: 0.18em; color: var(--soft); text-align: left; padding: 14px 14px; border-bottom: 1px solid var(--line); font-weight: 600; }
    .gtable th.ta-r { text-align: right; }
    .empty-row td { text-align: center; padding: 44px 0; color: var(--soft); font: italic 400 16px 'Fraunces'; }
  `,
})
export class GuestTable {
  readonly guests = input.required<readonly Guest[]>();
  readonly expandedGuests = input.required<ReadonlySet<string>>();

  readonly toggleGuest = output<string>();
  readonly sendInvite = output<string>();
  readonly confirm = output<string>();
  readonly showQr = output<string>();
  readonly showQrPass = output<{ guestId: string; index: number }>();
}
