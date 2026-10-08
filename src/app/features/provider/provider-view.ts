import { Component, computed, inject } from '@angular/core';

import { PaseStore } from '../../core/pase-store';
import type { EventFilter } from '../../core/models';
import { ModalService } from '../../core/modal.service';
import { FeedService } from '../../core/feed.service';
import { ToastService } from '../../core/toast.service';
import { SegmentFilter } from '../../shared/segment-filter';
import { Icon } from '../../shared/icon';
import { ProviderKpiRow } from './provider-kpi-row';
import { EventList } from './event-list';

@Component({
  selector: 'app-provider-view',
  imports: [SegmentFilter, Icon, ProviderKpiRow, EventList],
  template: `
    <div class="view enter">
      <div class="pv-hero reveal">
        <div class="pv-hero-top">
          <div>
            <span class="sec-label">NÉBULA EVENTS · PANEL DE PROVEEDOR DEL SERVICIO</span>
            <h1>Eventos bajo <em>gestión</em></h1>
          </div>
          <button type="button" class="btn" style="border-color:var(--cream-line);color:var(--cream)" (click)="newEvent()">
            <app-icon name="plus" [size]="12" />Alta de evento
          </button>
        </div>
        <app-provider-kpi-row [events]="store.events()" />
      </div>

      <div class="pv-body">
        <div class="events-col reveal" style="animation-delay:.06s">
          <app-segment-filter
            class="segfilter-wrap"
            ariaLabel="Filtro de eventos"
            [options]="eventFilterOptions()"
            [value]="store.eventFilter()"
            (changed)="onEventFilter($event)"
          />
          <app-event-list
            [events]="store.visibleEvents()"
            [expandedEvents]="store.expandedEvents()"
            (toggleEvent)="store.toggleEvent($event)"
            (contactAdmin)="handleContactAdmin($event)"
            (upgradeStorage)="handleUpgradeStorage($event)"
          />
        </div>
        <aside class="scan-col reveal" style="animation-delay:.12s">
          <div class="scan-head">
            <span class="sec-label">ACTIVIDAD DE ESCÁNERES</span>
            <span class="live-flag"><span class="dot"></span>EN VIVO</span>
            <button type="button" class="ibtn" (click)="toggleFeed()" [title]="feed.paused() ? 'Reanudar feed' : 'Pausar feed'">
              <app-icon [name]="feed.paused() ? 'play' : 'pause'" [size]="12" />
              <span class="sr-only">{{ feed.paused() ? 'Reanudar feed' : 'Pausar feed' }}</span>
            </button>
          </div>
          <div class="feed">
            @for (item of feed.items(); track item.id) {
              <div class="feed-item" [class.fx-ok]="item.result.cls === 'fx-ok'" [class.fx-warn]="item.result.cls === 'fx-warn'" [class.fx-bad]="item.result.cls === 'fx-bad'">
                <span class="ft">{{ item.time }}</span>
                <div>
                  <span class="fcode">{{ item.code }}</span>
                  <span class="fname">{{ item.name }}</span>
                  <span class="fgate">{{ item.gate }}</span>
                </div>
                <span class="fres">{{ item.result.label }}</span>
              </div>
            }
          </div>
          <div class="scan-note">LECTURAS QR DEL EQUIPO DE SEGURIDAD · SIMULACIÓN LOCAL</div>
        </aside>
      </div>
    </div>
  `,
  styles: `
    :host { display: block; }
    .segfilter-wrap { display: block; margin-bottom: 16px; }
    .segfilter-wrap .segf { display: flex; gap: 2px; }
    .segfilter-wrap .segf button {
      border: 0;
      background: transparent;
      padding: 7px 11px 9px;
      font: 600 9.5px 'IBM Plex Mono';
      letter-spacing: .12em;
      color: var(--soft);
      border-bottom: 2px solid transparent;
      transition: all .2s;
    }
    .segfilter-wrap .segf button:hover { color: var(--ink); }
    .segfilter-wrap .segf button.active { color: var(--ink); border-bottom-color: var(--ink); }
    .segfilter-wrap .segf button sup { font-size: 8px; margin-left: 4px; color: var(--accent); }
  `,
})
export class ProviderView {
  protected readonly store = inject(PaseStore);
  protected readonly modals = inject(ModalService);
  protected readonly feed = inject(FeedService);
  private readonly toast = inject(ToastService);

  protected readonly eventFilterOptions = computed(() =>
    this.store.eventFilterOptions().map((o) => ({
      value: o.value,
      label: o.label,
      count: o.count,
    })),
  );

  protected onEventFilter(filter: string): void {
    this.store.setEventFilter(filter as EventFilter);
  }

  protected newEvent(): void {
    this.toast.push('El alta de evento se conecta al módulo de contratación', 'warn', 'plus');
  }

  protected handleContactAdmin(id: string): void {
    this.modals.open({ kind: 'contact', eventId: id });
  }

  protected handleUpgradeStorage(id: string): void {
    this.modals.open({ kind: 'storagePlan', eventId: id });
  }

  protected toggleFeed(): void {
    this.feed.togglePaused();
  }
}
