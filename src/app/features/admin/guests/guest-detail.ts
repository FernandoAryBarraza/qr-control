import { Component, input, output } from '@angular/core';

import type { Guest } from '../../../core/models';
import { Icon } from '../../../shared/icon';

@Component({
  selector: 'tr[app-guest-detail]',
  imports: [Icon],
  template: `
    <td colspan="7">
      <div class="gd">
        <div class="gd-col">
          <div class="dcol-label">
            ACOMPAÑANTES · {{ guest().party.length }} · RECIBEN QR DE ACCESO PROPIO
          </div>
          @if (!guest().party.length) {
            <div class="note-txt" style="color: var(--soft)">Sin acompañantes registrados.</div>
          } @else {
            @for (p of guest().party; track $index) {
              <div class="pl-item">
                <span class="pl-name">{{ p.name }}</span>
                <span class="pl-rel mono">{{ p.rel.toUpperCase() }}</span>
                @if (guest().status === 'confirmed') {
                  <button
                    type="button"
                    class="ibtn"
                    (click)="showQrPass.emit($index + 1)"
                    [title]="'QR de ' + p.name"
                  >
                    <app-icon name="qrCode" [size]="14" />
                    <span class="sr-only">QR de {{ p.name }}</span>
                  </button>
                } @else {
                  <span class="pl-rel mono">QR AL CONFIRMAR</span>
                }
              </div>
            }
          }
        </div>
        <div class="gd-col">
          <div class="dcol-label">NOTA DEL ADMINISTRADOR</div>
          <div class="note-txt">{{ guest().note || '—' }}</div>
          <div class="dcol-label" style="margin-top: 20px">TELÉFONO</div>
          <div class="note-txt mono" style="font-size: 13px">{{ guest().phone }}</div>
        </div>
      </div>
    </td>
  `,
  styles: `
    td {
      padding: 0;
      border-bottom: 1px solid var(--line);
      background: rgba(27, 22, 17, 0.025);
    }
    .gd {
      display: grid;
      grid-template-columns: 1.25fr 1fr;
      gap: 0;
      animation: fadeDown 0.35s cubic-bezier(0.2, 0.8, 0.25, 1) both;
    }
    @keyframes fadeDown {
      from {
        opacity: 0;
        transform: translateY(-6px);
      }
      to {
        opacity: 1;
        transform: none;
      }
    }
    .gd-col {
      padding: 20px 24px;
      border-left: 1px dashed var(--line2);
    }
    .gd-col:first-child {
      border-left: 0;
    }
    /* .dcol-label now lives in styles.css: the provider's EventRow reuses it. */
    .pl-item {
      display: flex;
      align-items: center;
      gap: 14px;
      padding: 8px 0;
      border-bottom: 1px solid var(--line);
    }
    .pl-item:last-child {
      border-bottom: 0;
    }
    .pl-name {
      font: 500 14px 'Space Grotesk';
    }
    .pl-rel {
      font: 500 9px 'IBM Plex Mono';
      letter-spacing: 0.14em;
      color: var(--soft);
    }
    .pl-item .ibtn {
      margin-left: auto;
      width: 26px;
      height: 26px;
    }
    .note-txt {
      font: 400 13.5px 'Space Grotesk';
      color: var(--ink);
    }

    /* Prototype 920 block (QR_Z_Open/style.css:2131-2139). Enforced here, not
       globally, because these selectors are component-scoped. */
    @media (max-width: 920px) {
      .gd {
        grid-template-columns: 1fr;
      }
      .gd-col {
        border-left: 0;
        border-top: 1px dashed var(--line2);
      }
      .gd-col:first-child {
        border-top: 0;
      }
    }
  `,
})
export class GuestDetail {
  readonly guest = input.required<Guest>();
  readonly showQrPass = output<number>();
}
