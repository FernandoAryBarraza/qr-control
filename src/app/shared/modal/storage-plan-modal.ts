import { Component, inject, input, signal } from '@angular/core';

import { PaseStore } from '../../core/pase-store';
import { ModalService } from '../../core/modal.service';
import { Icon } from '../icon';
import { gb } from '../../core/metrics';

@Component({
  selector: 'app-storage-plan-modal',
  imports: [Icon],
  template: `
    @if (event(); as ev) {
      <div class="m-head">
        <span class="m-title" [id]="titleId()">PLAN DE ALMACENAMIENTO · {{ ev.name.toUpperCase() }}</span>
        <button type="button" class="ibtn" (click)="close()">
          <app-icon name="x" [size]="16" />
          <span class="sr-only">Cerrar</span>
        </button>
      </div>
      <div class="m-body">
        <div class="adm-line mono" style="margin-bottom:16px">USO ACTUAL · {{ gb(ev.used) }} GB DE {{ ev.max }} GB</div>
        @for (plan of plans; track plan.gb) {
          <label class="plan" [class.sel]="selectedPlan() === plan.gb">
            <input type="radio" name="plan" [value]="plan.gb" [checked]="selectedPlan() === plan.gb" (change)="selectPlan(plan.gb)" />
            <span class="pnum">{{ plan.gb }}</span>
            <span class="psub">GB de nube<br>para fotos de invitados</span>
            <span class="price mono">USD {{ plan.price }}/MES</span>
          </label>
        }
        <div class="m-actions">
          <button type="button" class="btn" (click)="close()">Cancelar</button>
          <button type="button" class="btn solid" (click)="apply()">
            <app-icon name="check" [size]="12" />Aplicar plan
          </button>
        </div>
      </div>
    }
  `,
  styles: `
    :host { display: block; }
    .m-head { display: flex; justify-content: space-between; align-items: center; padding: 16px 22px; border-bottom: 1px solid var(--line); }
    .m-title { font: 600 10.5px 'IBM Plex Mono'; letter-spacing: .2em; color: var(--soft); }
    .ibtn { width: 30px; height: 30px; display: grid; place-items: center; border: 1px solid var(--line2); border-radius: 3px; background: transparent; transition: all .2s; }
    .ibtn:hover { border-color: var(--ink); }
    .adm-line { font: 500 11px 'IBM Plex Mono'; letter-spacing: .04em; color: var(--soft); margin-bottom: 5px; }
    .plan { display: flex; align-items: center; gap: 16px; border: 1px solid var(--line2); border-radius: 3px; padding: 14px 16px; margin-bottom: 10px; cursor: pointer; transition: all .2s; }
    .plan:hover { border-color: var(--ink); }
    .plan input { accent-color: var(--ink); width: 15px; height: 15px; }
    .plan .pnum { font: 550 26px 'Fraunces'; }
    .plan .psub { font: 400 12px 'Space Grotesk'; color: var(--soft); }
    .plan .price { margin-left: auto; font: 500 11px 'IBM Plex Mono'; letter-spacing: .06em; }
    .plan.sel { border-color: var(--ink); background: rgba(27, 22, 17, .04); box-shadow: inset 0 0 0 1px var(--ink); }
    .m-actions { display: flex; justify-content: flex-end; gap: 10px; margin-top: 20px; }
    .btn.solid { background: var(--ink); color: var(--cream); border-color: var(--ink); }
    .btn.solid:hover { background: rgba(27,22,17,.92); }
  `,
})
export class StoragePlanModal {
  readonly titleId = input.required<string>();
  readonly eventId = input<string | undefined>(undefined);

  private readonly store = inject(PaseStore);
  private readonly modals = inject(ModalService);

  protected readonly gb = gb;
  protected readonly plans = [
    { gb: 50, price: 12 },
    { gb: 100, price: 22 },
    { gb: 200, price: 40 },
  ];

  protected selectedPlan = signal(50);

  protected event() {
    const id = this.eventId();
    const ev = id ? this.store.eventById(id) : undefined;
    if (ev && this.selectedPlan() === 50) {
      this.selectedPlan.set(ev.max);
    }
    return ev;
  }

  protected selectPlan(gbVal: number): void {
    this.selectedPlan.set(gbVal);
  }

  protected apply(): void {
    const ev = this.event();
    if (!ev) return;
    this.store.applyPlan(ev.id, this.selectedPlan());
    this.modals.close();
  }

  protected close(): void {
    this.modals.close();
  }
}
