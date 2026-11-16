import { Component, computed, inject, input, output } from '@angular/core';

import type { PaseEvent, ScanAppState } from '../../core/models';
import { gb, storageBarClass, storageBarWidth, storageLine } from '../../core/metrics';
import {
  NO_VALUE,
  adminContactOf,
  countdownOf,
  resolvedGuards,
  storageOf,
} from '../../core/event-display';
import { Icon } from '../../shared/icon';

@Component({
  selector: 'app-event-row',
  imports: [Icon],
  template: `
    <article class="event-row">
      <button
        type="button"
        class="er-head"
        (click)="toggle.emit()"
        [attr.aria-expanded]="expanded()"
      >
        <span
          class="er-status"
          [class.st-active]="event().status === 'active'"
          [class.st-upcoming]="event().status === 'upcoming'"
          [class.st-done]="event().status === 'done'"
        >
          <span class="dot"></span>
          <span>{{ statusLabel(event().status) }}</span>
        </span>
        <span class="er-name">
          {{ event().name }}
          @if (countdown(); as cd) {
            <span class="er-cd">{{ cd }}</span>
          }
        </span>
        <span class="er-facts mono"
          >{{ event().dateLabel }} · {{ event().guests }} INVITADOS ·
          {{ event().photos }} FOTOS</span
        >
        <span class="er-storage">
          <span class="mono">{{ line() }}</span>
          <span class="er-bar" [class.warn]="barCls() === 'warn'" [class.bad]="barCls() === 'bad'">
            <span [style.width]="barWidth()"></span>
          </span>
        </span>
        <span class="er-chev chev" [class.open]="expanded()">
          <app-icon name="chevronDown" [size]="16" />
        </span>
      </button>
      @if (expanded()) {
        <div class="er-detail">
          <div class="dcolb">
            <div class="dcol-label">ADMINISTRADOR DEL EVENTO</div>
            <div class="adm-name">{{ event().admin.name }}</div>
            <div class="adm-line mono">{{ email() }}</div>
            <div class="adm-line mono">{{ phone() }}</div>
            <div class="adm-since">{{ since() }}</div>
            <button type="button" class="btn sm" (click)="contactAdmin.emit()">
              <app-icon name="messageSquare" [size]="12" />Enviar mensaje
            </button>
          </div>
          <div class="dcolb">
            <div class="dcol-label">
              SEGURIDAD CON APP ESCÁNER · {{ onlineCount() }}/{{ guards().length }} EN LÍNEA
            </div>
            @for (s of guards(); track $index) {
              <div class="sec-item">
                <div>
                  <div class="sec-name">{{ s.name }}</div>
                  <div class="sec-post mono">{{ s.post }}</div>
                </div>
                <span
                  class="app-state"
                  [class.online]="s.app === 'online'"
                  [class.idle]="s.app === 'idle'"
                  [class.none]="s.app === 'none'"
                  [class.archived]="s.app === 'archived'"
                >
                  <span>{{ appLabel(s.app) }}</span>
                  @if (s.app === 'online' && s.last) {
                    · {{ s.last }}
                  }
                </span>
              </div>
            }
          </div>
          <div class="dcolb">
            <div class="dcol-label">ALMACENAMIENTO OCUPADO POR INVITADOS</div>
            <div class="sto-num">
              @if (storage(); as s) {
                {{ gb(s.used) }}<span class="unit"> GB</span
                ><span class="sto-max mono">/ {{ s.max }} GB</span>
              } @else {
                <span>—</span>
              }
            </div>
            <span
              class="er-bar big"
              [class.warn]="barCls() === 'warn'"
              [class.bad]="barCls() === 'bad'"
            >
              <span [style.width]="barWidth()"></span>
            </span>
            @for (item of breakdown(); track item[0]) {
              <div class="bd-row">
                <span>{{ item[0] }}</span
                ><span>{{ gb(item[1]) }} GB</span>
              </div>
            }
            @if (event().note) {
              <div class="sto-note">{{ event().note }}</div>
            }
            <button
              type="button"
              class="btn sm"
              style="margin-top:12px"
              (click)="upgradeStorage.emit()"
            >
              <app-icon name="hardDrive" [size]="12" />Ampliar plan
            </button>
          </div>
        </div>
      }
    </article>
  `,
})
export class EventRow {
  readonly event = input.required<PaseEvent>();
  readonly expanded = input<boolean>(false);

  readonly toggle = output<void>();
  readonly contactAdmin = output<void>();
  readonly upgradeStorage = output<void>();

  protected readonly gb = gb;
  /** The event's storage, resolved through the client-side display mock. */
  protected readonly storage = computed(() => storageOf(this.event()));
  protected readonly line = computed(() => storageLine(this.storage()));
  protected readonly barCls = computed(() => storageBarClass(this.storage()));
  protected readonly barWidth = computed(() => storageBarWidth(this.storage()));

  /** The countdown badge, resolved through the client-side display mock. */
  protected readonly countdown = computed(() => countdownOf(this.event()));

  /** The administrator's contact, resolved through the client-side display mock. */
  protected readonly contact = computed(() => adminContactOf(this.event()));
  protected readonly email = computed(() => this.contact()?.email ?? NO_VALUE);
  protected readonly phone = computed(() => this.contact()?.phone ?? NO_VALUE);
  protected readonly since = computed(() => this.contact()?.since ?? NO_VALUE);

  /** The guards, every display field resolved through the display mock. */
  protected readonly guards = computed(() => resolvedGuards(this.event()));
  protected readonly onlineCount = computed(
    () => this.guards().filter((guard) => guard.app === 'online').length,
  );
  protected readonly breakdown = computed(() => {
    const br = this.storage()?.br;
    return br === undefined ? [] : Object.entries(br);
  });

  protected statusLabel(status: PaseEvent['status']): string {
    const map = { active: 'ACTIVO', upcoming: 'PRÓXIMO', done: 'FINALIZADO' } as const;
    return map[status];
  }

  protected appLabel(app: ScanAppState | undefined): string {
    const map = {
      online: 'EN LÍNEA',
      idle: 'SIN ACTIVAR',
      none: 'SIN INSTALAR',
      archived: 'ARCHIVADA',
    } as const;
    // An unknown state is the em dash — never a label that was never there.
    return app === undefined ? NO_VALUE : map[app];
  }
}
