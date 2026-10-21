import { Component, computed, inject, input, output } from '@angular/core';

import type { PaseEvent } from '../../core/models';
import { gb, barClass } from '../../core/metrics';
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
          @if (event().cd) {
            <span class="er-cd">{{ event().cd }}</span>
          }
        </span>
        <span class="er-facts mono"
          >{{ event().dateLabel }} · {{ event().guests }} INVITADOS ·
          {{ event().photos }} FOTOS</span
        >
        <span class="er-storage">
          <span class="mono">{{ gb(event().used) }} / {{ event().max }} GB</span>
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
            <div class="adm-line mono">{{ event().admin.email }}</div>
            <div class="adm-line mono">{{ event().admin.phone }}</div>
            <div class="adm-since">{{ event().admin.since }}</div>
            <button type="button" class="btn sm" (click)="contactAdmin.emit()">
              <app-icon name="messageSquare" [size]="12" />Enviar mensaje
            </button>
          </div>
          <div class="dcolb">
            <div class="dcol-label">
              SEGURIDAD CON APP ESCÁNER · {{ onlineCount() }}/{{ event().security.length }} EN LÍNEA
            </div>
            @for (s of event().security; track $index) {
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
              {{ gb(event().used) }}<span class="unit"> GB</span
              ><span class="sto-max mono">/ {{ event().max }} GB</span>
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
  protected readonly barCls = computed(() => barClass(this.event().used, this.event().max));
  protected readonly barWidth = computed(() => {
    const ratio = this.event().used / this.event().max;
    return `${Math.min(100, ratio * 100)}%`;
  });
  protected readonly onlineCount = computed(
    () => this.event().security.filter((s) => s.app === 'online').length,
  );
  protected readonly breakdown = computed(() => Object.entries(this.event().br));

  protected statusLabel(status: PaseEvent['status']): string {
    const map = { active: 'ACTIVO', upcoming: 'PRÓXIMO', done: 'FINALIZADO' } as const;
    return map[status];
  }

  protected appLabel(app: PaseEvent['security'][number]['app']): string {
    const map = {
      online: 'EN LÍNEA',
      idle: 'SIN ACTIVAR',
      none: 'SIN INSTALAR',
      archived: 'ARCHIVADA',
    } as const;
    return map[app];
  }
}
