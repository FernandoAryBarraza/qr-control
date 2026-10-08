import { Component, computed, inject } from '@angular/core';

import { PaseStore } from '../../core/pase-store';
import type { PhotoFilter } from '../../core/models';
import { ModalService } from '../../core/modal.service';
import { EventHero } from './event-hero';
import { MetricsSection } from './metrics/metrics-section';
import { GuestRegistry } from './guests/guest-registry';
import { PhotoCloud } from './photos/photo-cloud';

@Component({
  selector: 'app-admin-view',
  imports: [EventHero, MetricsSection, GuestRegistry, PhotoCloud],
  template: `
    <div class="view enter">
      <div class="reveal">
        <app-event-hero />
      </div>
      <div class="reveal" style="animation-delay: 0.06s">
        <app-metrics-section [segments]="store.funnel()" [stats]="store.stats()" />
      </div>
      <div class="reveal" style="animation-delay: 0.12s">
        <app-guest-registry
          [guests]="store.visibleGuests()"
          [expandedGuests]="store.expandedGuests()"
          [guestFilter]="store.guestFilter()"
          [filterOptions]="filterOptions()"
          [search]="store.guestQuery()"
          (searchChanged)="store.setGuestQuery($event)"
          (filterChanged)="store.setGuestFilter($event)"
          (toggleGuest)="store.toggleGuest($event)"
          (sendInvite)="store.sendInvite($event)"
          (confirm)="store.confirmGuest($event)"
          (showQr)="handleShowQr($event)"
          (showQrPass)="handleShowQrPass($event)"
        />
      </div>
      <div class="reveal" style="animation-delay: 0.18s">
        <app-photo-cloud
          [photos]="store.visiblePhotos()"
          [filter]="store.photoFilter()"
          [filterOptions]="photoFilterOptions()"
          [pendingCount]="store.pendingPhotoCount()"
          (filterChanged)="onPhotoFilter($event)"
          (approve)="store.setPhotoState($event, 'approved')"
          (reject)="store.setPhotoState($event, 'rejected')"
          (toggleDownload)="store.toggleDownload($event)"
          (openLightbox)="handleOpenLightbox($event)"
        />
      </div>
    </div>
  `,
})
export class AdminView {
  protected readonly store = inject(PaseStore);
  private readonly modals = inject(ModalService);

  protected readonly filterOptions = computed(() => this.store.guestFilterOptions());

  protected readonly photoFilterOptions = computed(() =>
    this.store.photoFilterOptions().map((o) => ({
      value: o.value,
      label: o.label,
      count: o.count,
    })),
  );

  protected onPhotoFilter(filter: string): void {
    this.store.setPhotoFilter(filter as PhotoFilter);
  }

  protected handleShowQr(guestId: string): void {
    this.modals.open({ kind: 'ticket', guestId, passIndex: 0 });
  }

  protected handleShowQrPass(event: { guestId: string; index: number }): void {
    this.modals.open({ kind: 'ticket', guestId: event.guestId, passIndex: event.index });
  }

  protected handleOpenLightbox(photoId: string): void {
    const photos = this.store.visiblePhotos();
    const idx = photos.findIndex((p) => p.id === photoId);
    this.modals.open({ kind: 'lightbox', photoList: photos.map((p) => p.id), photoIndex: idx >= 0 ? idx : 0 });
  }
}
