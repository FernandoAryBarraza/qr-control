import { Component, computed, inject, input, output } from '@angular/core';

import type { EventPhoto, PhotoFilter } from '../../../core/models';
import { SegmentFilter } from '../../../shared/segment-filter';
import { PhotoCard } from './photo-card';

export interface PhotoFilterOption {
  readonly value: string;
  readonly label: string;
  readonly count: number;
}

@Component({
  selector: 'app-photo-cloud',
  imports: [SegmentFilter, PhotoCard],
  template: `
    <section class="panel reveal" style="animation-delay:.18s">
      <div class="panel-head">
        <div>
          <span class="sec-label">NUBE INTERNA DEL EVENTO</span>
          <h2 class="panel-title">Fotografía de invitados</h2>
        </div>
        <div class="tools">
          <span class="pending-flag" [class.ok]="pendingCount() === 0">
            <span class="dot"></span>
            {{ pendingCount() === 0 ? 'FOTOTECA AL DÍA' : pendingCount() + ' PENDIENTES DE REVISIÓN' }}
          </span>
          <app-segment-filter
            ariaLabel="Filtros de fotos"
            [options]="filterOptions()"
            [value]="filter()"
            (changed)="filterChanged.emit($event)"
          />
        </div>
      </div>
      <div class="photo-grid">
        @if (photos().length === 0) {
          <div class="wp-empty" style="column-span:all">No hay fotos en esta bandeja por ahora.</div>
        } @else {
          @for (photo of photos(); track photo.id) {
            <app-photo-card
              [photo]="photo"
              (approve)="approve.emit(photo.id)"
              (reject)="reject.emit(photo.id)"
              (toggleDownload)="toggleDownload.emit(photo.id)"
              (openLightbox)="openLightbox.emit(photo.id)"
            />
          }
        }
      </div>
    </section>
  `,
  styles: `
    :host { display: block; }
    .panel { background: var(--paper); border: 1px solid var(--ink); border-radius: 4px; padding: 24px 26px 28px; }
    .panel-head { display: flex; justify-content: space-between; align-items: flex-start; gap: 24px; flex-wrap: wrap; }
    .panel-title { font: 550 28px 'Fraunces'; margin-top: 6px; }
    .panel-title .cnt { margin-left: 10px; font: 600 11px 'IBM Plex Mono'; color: var(--soft); }
    .tools { display: flex; align-items: center; gap: 18px; flex-wrap: wrap; }
    .pending-flag { display: inline-flex; align-items: center; gap: 8px; font: 600 9px 'IBM Plex Mono'; letter-spacing: 0.16em; color: var(--amber); }
    .pending-flag.ok { color: var(--green); }
    .pending-flag .dot { width: 7px; height: 7px; border-radius: 50%; background: currentColor; }
    .sec-label { font: 600 9.5px 'IBM Plex Mono'; letter-spacing: 0.18em; color: var(--soft); }
    .photo-grid { columns: 4 230px; column-gap: 16px; padding-top: 24px; }
    .wp-empty { padding: 60px 30px; text-align: center; color: var(--soft); font: italic 400 17px 'Fraunces'; }
  `,
})
export class PhotoCloud {
  readonly photos = input.required<readonly EventPhoto[]>();
  readonly filter = input.required<PhotoFilter>();
  readonly filterOptions = input.required<readonly PhotoFilterOption[]>();
  readonly pendingCount = input.required<number>();

  readonly filterChanged = output<string>();
  readonly approve = output<string>();
  readonly reject = output<string>();
  readonly toggleDownload = output<string>();
  readonly openLightbox = output<string>();
}
