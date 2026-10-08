import { Component, input } from '@angular/core';

import type { Role } from '../core/models';

/**
 * Slice-1 stand-in for the two role views.
 *
 * The admin and provider screens are feature slices; until they land the
 * shell renders this so the topbar, footer, overlays and toasts are all
 * reachable and reviewable on their own.
 */
@Component({
  selector: 'app-view-placeholder',
  templateUrl: './view-placeholder.html',
  styleUrl: './view-placeholder.css',
})
export class ViewPlaceholder {
  readonly role = input.required<Role>();

  protected get heading(): string {
    return this.role() === 'admin' ? 'Vista del administrador' : 'Vista del proveedor';
  }

  protected get body(): string {
    return this.role() === 'admin'
      ? 'Las cifras de invitación, la lista de invitados y la galería de fotos se incorporan en el siguiente corte.'
      : 'La lectura de códigos QR, la acreditación de pases y el corte de accesos se incorporan en el siguiente corte.';
  }
}