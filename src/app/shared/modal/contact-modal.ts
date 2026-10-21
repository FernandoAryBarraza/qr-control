import { Component, inject, input, signal } from '@angular/core';

import { PaseStore } from '../../core/pase-store';
import { ModalService } from '../../core/modal.service';
import { ToastService } from '../../core/toast.service';
import { Icon } from '../icon';

@Component({
  selector: 'app-contact-modal',
  imports: [Icon],
  template: `
    @if (event(); as ev) {
      <div class="m-head">
        <span class="m-title" [id]="titleId()">MENSAJE PARA {{ ev.admin.name.toUpperCase() }}</span>
        <button type="button" class="ibtn" (click)="close()">
          <app-icon name="x" [size]="16" />
          <span class="sr-only">Cerrar</span>
        </button>
      </div>
      <div class="m-body">
        <div class="adm-line mono" style="margin-bottom:14px">
          PARA · {{ ev.admin.email }} · {{ ev.name.toUpperCase() }}
        </div>
        <label class="sr-only" for="msgTxt">Mensaje para la administradora del evento</label>
        <textarea
          class="msg-area"
          id="msgTxt"
          [value]="message()"
          (input)="onInput($event)"
          placeholder="Escribe un mensaje para la administradora del evento…"
        ></textarea>
        <div class="m-actions">
          <button type="button" class="btn" (click)="close()">Cancelar</button>
          <button type="button" class="btn solid" (click)="send()">
            <app-icon name="send" [size]="12" />Enviar
          </button>
        </div>
      </div>
    }
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
    .adm-line {
      font: 500 11px 'IBM Plex Mono';
      letter-spacing: 0.04em;
      color: var(--soft);
      margin-bottom: 5px;
    }
    /* No "outline: 0" here: it outranked the global *:focus-visible ring
       and left the only textarea in the app invisible to the keyboard. */
    .msg-area {
      width: 100%;
      min-height: 110px;
      border: 1px solid var(--line2);
      border-radius: 3px;
      background: var(--paper);
      padding: 14px;
      font: 400 14px 'Space Grotesk';
      color: var(--ink);
      resize: vertical;
    }
    .msg-area:focus {
      border-color: var(--ink);
    }
    .m-actions {
      display: flex;
      justify-content: flex-end;
      gap: 10px;
      margin-top: 20px;
    }
    .btn.solid {
      background: var(--ink);
      color: var(--cream);
      border-color: var(--ink);
    }
    .btn.solid:hover {
      background: rgba(27, 22, 17, 0.92);
    }
  `,
})
export class ContactModal {
  readonly titleId = input.required<string>();
  readonly eventId = input<string | undefined>(undefined);

  private readonly store = inject(PaseStore);
  private readonly modals = inject(ModalService);
  private readonly toast = inject(ToastService);

  protected readonly message = signal('');

  protected event() {
    const id = this.eventId();
    return id ? this.store.eventById(id) : undefined;
  }

  protected onInput(event: Event): void {
    const target = event.target as HTMLTextAreaElement;
    this.message.set(target.value);
  }

  protected send(): void {
    const ev = this.event();
    if (!ev) return;
    this.modals.close();
    this.toast.push(`Mensaje enviado a ${ev.admin.email}`, 'ok', 'mailCheck');
  }

  protected close(): void {
    this.modals.close();
  }
}
