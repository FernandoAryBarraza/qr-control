import { Component, input, output } from '@angular/core';

import type { Guest } from '../../../core/models';
import { Icon } from '../../../shared/icon';

@Component({
  selector: 'tr[app-guest-row]',
  imports: [Icon],
  template: `
    <td class="gcode mono">{{ guest().id }}</td>
    <td>
      <button
        type="button"
        class="gname-btn"
        [attr.aria-expanded]="expanded()"
        (click)="toggle.emit()"
      >
        {{ guest().name }}
      </button>
      <div class="gsub mono">{{ guest().table ? 'MESA ' + guest().table : 'SIN MESA' }}</div>
    </td>
    <td>
      <div class="gmail">{{ guest().email }}</div>
      <div class="gsub mono">{{ guest().phone }}</div>
    </td>
    <td>
      <div class="party-chips">
        @if (!guest().party.length) {
          <span class="gsub mono">SIN ACOMPAÑANTES</span>
        } @else {
          @for (p of guest().party.slice(0, 3); track $index) {
            <span class="chipini" [title]="p.name">{{ initials(p.name) }}</span>
          }
          @if (guest().party.length > 3) {
            <span class="chipmore">+{{ guest().party.length - 3 }}</span>
          }
        }
      </div>
    </td>
    <td>
      <span
        class="pill"
        [class.ok]="guest().status === 'confirmed'"
        [class.warn]="guest().status === 'sent'"
        [class.off]="guest().status === 'planned'"
        [class.bad]="guest().status === 'declined'"
      >
        <span class="dot"></span>
        <span>{{ pillLabel(guest().status) }}</span>
      </span>
    </td>
    <td class="ta-r">
      <div class="row-actions">
        @if (guest().status === 'planned') {
          <button type="button" class="btn sm" (click)="sendInvite.emit()">
            <app-icon name="send" [size]="12" />Enviar invitación
          </button>
        } @else if (guest().status === 'sent') {
          <button type="button" class="btn sm" (click)="confirm.emit()">
            <app-icon name="check" [size]="12" />Confirmar
          </button>
        } @else if (guest().status === 'confirmed') {
          <button type="button" class="ibtn" (click)="showQr.emit()" title="Ver pases QR">
            <app-icon name="qrCode" [size]="14" />
            <span class="sr-only">Ver pases QR</span>
          </button>
        } @else {
          <span class="gsub mono">—</span>
        }
      </div>
    </td>
    <td class="ta-r">
      <button
        type="button"
        class="chev"
        [class.open]="expanded()"
        (click)="toggle.emit()"
        [attr.aria-label]="expanded() ? 'Ocultar detalle' : 'Mostrar detalle'"
        [attr.aria-expanded]="expanded()"
      >
        <app-icon name="chevronDown" [size]="16" />
      </button>
    </td>
  `,
  styles: `
    :host {
      transition: background 0.2s;
    }
    :host:hover {
      background: rgba(27, 22, 17, 0.035);
    }
    .gcode {
      font: 500 11px 'IBM Plex Mono';
      color: var(--soft);
      letter-spacing: 0.06em;
    }
    .gname-btn {
      font: 550 17px 'Fraunces';
      background: transparent;
      border: 0;
      color: inherit;
      cursor: pointer;
      text-align: left;
    }
    .gname-btn:hover {
      color: var(--accent);
    }
    .gsub {
      font: 500 10px 'IBM Plex Mono';
      letter-spacing: 0.08em;
      color: var(--soft);
      margin-top: 3px;
    }
    .gmail {
      font: 400 12.5px 'Space Grotesk';
    }
    .party-chips {
      display: flex;
      gap: 5px;
      align-items: center;
    }
    .chipini {
      width: 24px;
      height: 24px;
      border: 1px solid var(--line2);
      border-radius: 3px;
      display: grid;
      place-items: center;
      font: 600 9px 'IBM Plex Mono';
    }
    .chipmore {
      font: 600 9px 'IBM Plex Mono';
      color: var(--soft);
    }
    .ta-r {
      text-align: right;
    }
    .row-actions {
      display: flex;
      gap: 8px;
      justify-content: flex-end;
      align-items: center;
    }
    .chev {
      width: 32px;
      height: 32px;
      display: inline-grid;
      place-items: center;
      border: 1px solid transparent;
      border-radius: 3px;
      background: transparent;
      transition: all 0.25s;
    }
    .chev svg {
      transition: transform 0.3s;
    }
    .chev:hover {
      border-color: var(--line2);
    }
    .chev.open svg {
      transform: rotate(180deg);
    }
  `,
})
export class GuestRow {
  readonly guest = input.required<Guest>();
  readonly expanded = input(false);

  readonly toggle = output<void>();
  readonly sendInvite = output<void>();
  readonly confirm = output<void>();
  readonly showQr = output<void>();

  protected pillLabel(status: Guest['status']): string {
    const map = {
      confirmed: 'CONFIRMADO',
      sent: 'ENVIADO',
      planned: 'POR INVITAR',
      declined: 'DECLINÓ',
    };
    return map[status];
  }

  protected initials(n: string): string {
    return n
      .split(' ')
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0])
      .join('')
      .toUpperCase();
  }
}
