import { Component, inject } from '@angular/core';

import { ModalService } from '../../core/modal.service';
import { ModalShell } from './modal-shell';
import { QrTicketModal } from './qr-ticket-modal';
import { PhotoLightbox } from './photo-lightbox';
import { PublicWebModal } from './public-web-modal';
import { ContactModal } from './contact-modal';
import { StoragePlanModal } from './storage-plan-modal';

/**
 * Renders whichever overlay `ModalService` is holding.
 *
 * One shell for all five kinds, so focus trapping, focus restore, the
 * `inert` background and the scroll lock are written once. Every branch
 * must render an element carrying `[titleId]` — `ModalShell` points
 * `aria-labelledby` at it, so a branch that forgets leaves the dialog
 * with no accessible name.
 */
@Component({
  selector: 'app-modal-outlet',
  imports: [
    ModalShell,
    QrTicketModal,
    PhotoLightbox,
    PublicWebModal,
    ContactModal,
    StoragePlanModal,
  ],
  template: `
    @if (modals.current(); as ref) {
      <app-modal-shell
        [titleId]="'modal-title-' + ref.kind"
        [wide]="ref.kind === 'ticket' || ref.kind === 'publicWeb'"
        [dark]="ref.kind === 'lightbox'"
        (closed)="modals.close()"
      >
        @switch (ref.kind) {
          @case ('ticket') {
            <app-qr-ticket-modal
              [guestId]="ref.guestId!"
              [passIndex]="ref.passIndex || 0"
              [titleId]="'modal-title-' + ref.kind"
            />
          }
          @case ('publicWeb') {
            <app-public-web-modal [titleId]="'modal-title-' + ref.kind" />
          }
          @case ('lightbox') {
            <app-photo-lightbox
              [photoList]="ref.photoList || []"
              [photoIndex]="ref.photoIndex || 0"
              [titleId]="'modal-title-' + ref.kind"
            />
          }
          @case ('contact') {
            <app-contact-modal [eventId]="ref.eventId" [titleId]="'modal-title-' + ref.kind" />
          }
          @case ('storagePlan') {
            <app-storage-plan-modal [eventId]="ref.eventId" [titleId]="'modal-title-' + ref.kind" />
          }
        }
      </app-modal-shell>
    }
  `,
})
export class ModalOutlet {
  protected readonly modals = inject(ModalService);
}
