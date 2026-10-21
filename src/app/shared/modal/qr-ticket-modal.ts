import {
  Component,
  PLATFORM_ID,
  afterNextRender,
  inject,
  input,
  signal,
  viewChild,
  ElementRef,
} from '@angular/core';
import { isPlatformBrowser } from '@angular/common';

import { PaseStore } from '../../core/pase-store';
import { ModalService } from '../../core/modal.service';
import { QrRendererService } from '../../core/qr-renderer.service';
import { Icon } from '../icon';
import type { Guest } from '../../core/models';

@Component({
  selector: 'app-qr-ticket-modal',
  imports: [Icon],
  template: `
    <div class="m-head">
      <span class="m-title" [id]="titleId()"
        >PASES DE ACCESO · {{ selectedPass().name.toUpperCase() }}</span
      >
      <button type="button" class="ibtn" (click)="close()">
        <app-icon name="x" [size]="16" />
        <span class="sr-only">Cerrar</span>
      </button>
    </div>
    <div class="ticket">
      <div class="t-left">
        <div class="sec-label">GALA ANIVERSARIO VALDEMAR</div>
        <div class="t-name">{{ selectedPass().name }}</div>
        <div class="t-sub">
          SÁB 14 JUN 2025 · 20:00 H<br />HACIENDA LA MERCED · VALLE DE GUADALUPE
        </div>
        <div
          class="t-passes"
          role="radiogroup"
          aria-label="Pase del invitado"
          (keydown)="onPassKeydown($event)"
        >
          <button
            type="button"
            role="radio"
            id="tpass-0"
            [attr.aria-checked]="idx() === 0"
            [attr.tabindex]="idx() === 0 ? 0 : -1"
            class="tpass"
            [class.sel]="idx() === 0"
            (click)="selectPass(0)"
          >
            <span class="nm">Titular</span><span>{{ guest()?.id }}</span>
          </button>
          @for (p of guest()?.party || []; track $index) {
            <button
              type="button"
              role="radio"
              [id]="'tpass-' + ($index + 1)"
              [attr.aria-checked]="idx() === $index + 1"
              [attr.tabindex]="idx() === $index + 1 ? 0 : -1"
              class="tpass"
              [class.sel]="idx() === $index + 1"
              (click)="selectPass($index + 1)"
            >
              <span class="nm">{{ p.name }}</span
              ><span>{{ guest()?.id }}·A{{ $index + 1 }}</span>
            </button>
          }
        </div>
        <div class="t-code">CODE · {{ selectedPass().code }}</div>
      </div>
      <div class="t-right">
        <div class="t-qrbox"><canvas #qrCanvas></canvas></div>
        <button type="button" class="btn sm" (click)="download()">
          <app-icon name="download" [size]="14" />Descargar PNG
        </button>
      </div>
    </div>
  `,
  styles: `
    :host {
      display: block;
    }
    .m-head {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 16px 22px;
      border-bottom: 1px solid var(--line);
    }
    .m-title {
      font: 600 10.5px 'IBM Plex Mono';
      letter-spacing: 0.2em;
      color: var(--soft);
    }
    .ibtn {
      width: 30px;
      height: 30px;
      display: grid;
      place-items: center;
      border: 1px solid var(--line2);
      border-radius: 3px;
      background: transparent;
      transition: all 0.2s;
    }
    .ibtn:hover {
      border-color: var(--ink);
    }
    .ticket {
      display: grid;
      grid-template-columns: 1fr 250px;
      gap: 0;
    }
    .t-left {
      padding: 26px 24px;
      border-right: 1px dashed var(--line2);
    }
    .t-right {
      padding: 26px 22px;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 16px;
      justify-content: center;
    }
    .sec-label {
      font: 600 9.5px 'IBM Plex Mono';
      letter-spacing: 0.18em;
      color: var(--soft);
    }
    .t-name {
      font: 550 26px/1.1 'Fraunces';
      margin: 10px 0 6px;
    }
    .t-sub {
      font: 500 9px 'IBM Plex Mono';
      letter-spacing: 0.14em;
      color: var(--soft);
      line-height: 1.8;
    }
    .t-passes {
      display: flex;
      flex-direction: column;
      gap: 6px;
      margin: 20px 0 16px;
    }
    .tpass {
      display: flex;
      justify-content: space-between;
      gap: 14px;
      align-items: center;
      text-align: left;
      border: 1px solid var(--line2);
      background: transparent;
      border-radius: 3px;
      padding: 8px 11px;
      font: 500 11px 'IBM Plex Mono';
      letter-spacing: 0.04em;
      transition: all 0.2s;
    }
    .tpass:hover {
      border-color: var(--ink);
    }
    .tpass.sel {
      background: var(--ink);
      color: var(--cream);
      border-color: var(--ink);
    }
    .tpass .nm {
      font-family: 'Space Grotesk';
      font-size: 12.5px;
    }
    .t-code {
      font: 600 15px 'IBM Plex Mono';
      letter-spacing: 0.14em;
      border-top: 1px solid var(--line);
      padding-top: 14px;
      margin-top: auto;
    }
    .t-qrbox {
      border: 1px solid var(--ink);
      border-radius: 4px;
      padding: 14px;
      background: #fff;
    }
    .t-qrbox canvas {
      display: block;
      width: 200px;
      height: 200px;
      image-rendering: pixelated;
    }
    .btn.sm {
      padding: 8px 12px;
      font: 600 10px 'IBM Plex Mono';
      letter-spacing: 0.12em;
      text-transform: uppercase;
    }

    /* Prototype 920 block (QR_Z_Open/style.css:2141-2149). Enforced here, not
       globally, because these selectors are component-scoped. */
    @media (max-width: 920px) {
      .ticket {
        grid-template-columns: 1fr;
      }
      .t-left {
        border-right: 0;
        border-bottom: 1px dashed var(--line2);
      }
    }
  `,
})
export class QrTicketModal {
  readonly guestId = input.required<string>();
  readonly passIndex = input<number>(0);
  readonly titleId = input.required<string>();

  protected readonly canvas = viewChild.required<ElementRef<HTMLCanvasElement>>('qrCanvas');

  private readonly store = inject(PaseStore);
  private readonly modals = inject(ModalService);
  private readonly qr = inject(QrRendererService);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  protected idx = signal(0);

  constructor() {
    afterNextRender(() => {
      this.idx.set(this.passIndex());
      this.draw();
    });
  }

  protected guest(): Guest | undefined {
    return this.store.guestById(this.guestId());
  }

  protected selectedPass() {
    const g = this.guest();
    if (!g) return { code: '', name: '' };
    if (this.idx() === 0) return { code: g.id, name: g.name };
    const p = g.party[this.idx() - 1];
    return { code: `${g.id}·A${this.idx()}`, name: p ? p.name : 'Acompañante' };
  }

  protected selectPass(i: number): void {
    this.idx.set(i);
    this.modals.patch({ passIndex: i });
    this.draw();
  }

  /**
   * Arrow keys move focus and selection together, per the APG radio-group
   * pattern — same approach as `RoleSwitch`. The list is a vertical column,
   * so Up/Down are the primary keys; Left/Right are accepted because the
   * radiogroup is rendered inside a horizontally-laid-out ticket.
   */
  protected onPassKeydown(event: KeyboardEvent): void {
    const total = 1 + (this.guest()?.party.length ?? 0);
    if (total < 2) return;

    const step =
      event.key === 'ArrowDown' || event.key === 'ArrowRight'
        ? 1
        : event.key === 'ArrowUp' || event.key === 'ArrowLeft'
          ? -1
          : 0;
    if (!step) return;
    event.preventDefault();

    const next = (this.idx() + step + total) % total;
    this.selectPass(next);
    this.host.nativeElement.querySelector<HTMLElement>(`#tpass-${next}`)?.focus();
  }

  protected draw(): void {
    if (!this.isBrowser) return;
    const sel = this.selectedPass();
    if (!sel.code) return;
    this.qr.draw(
      this.canvas().nativeElement,
      `PASE|GALA-VALDEMAR-XII|${sel.code}|${sel.name.toUpperCase()}`,
    );
  }

  protected download(): void {
    if (!this.isBrowser) return;
    const g = this.guest();
    if (!g) return;
    const sel = this.selectedPass();
    const canvas = this.canvas().nativeElement;
    const a = document.createElement('a');
    a.download = `pase-${sel.code.replace(/[^A-Z0-9\-]/gi, '')}.png`;
    a.href = canvas.toDataURL('image/png');
    a.click();
  }

  protected close(): void {
    this.modals.close();
  }
}
