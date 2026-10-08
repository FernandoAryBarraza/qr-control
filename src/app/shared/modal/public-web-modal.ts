import { Component, inject, input } from '@angular/core';

import { PaseStore } from '../../core/pase-store';
import { ModalService } from '../../core/modal.service';
import type { EventPhoto } from '../../core/models';
import { Icon } from '../icon';

@Component({
  selector: 'app-public-web-modal',
  imports: [Icon],
  template: `
    <div class="m-head">
      <span class="m-title" [id]="titleId()">VISTA PÚBLICA · WEB DEL EVENTO PARA INVITADOS</span>
      <button type="button" class="ibtn" (click)="close()">
        <app-icon name="x" [size]="16" />
        <span class="sr-only">Cerrar</span>
      </button>
    </div>
    <div class="wp-head">
      <span class="sec-label">GALERÍA OFICIAL</span>
      <h3>Gala <em style="font-style:italic;color:var(--accent)">Aniversario</em> Valdemar</h3>
      <div class="sub">SÁB 14 JUN 2025 · HACIENDA LA MERCED · SOLO LAS FOTOS APROBADAS POR EL ADMINISTRADOR APARECEN AQUÍ.<br>
      {{ dlCount() }} FOTOS PERMITEN DESCARGA PARA LOS INVITADOS.</div>
    </div>
    @if (approved().length === 0) {
      <div class="wp-empty">Aún no hay fotos aprobadas. Aprueba fotografías en el panel para publicarlas aquí.</div>
    } @else {
      <div class="wp-grid">
        @for (p of approved(); track p.id) {
          <div class="wp-item">
            <img [src]="p.url" [alt]="'Foto de ' + p.author" loading="lazy">
            <span class="wtag">{{ p.author.toUpperCase() }}</span>
            @if (p.dl) {
              <button type="button" class="ibt on wbtn" (click)="download(p)" title="Descargar" [attr.aria-label]="'Descargar la foto de ' + p.author">
                <app-icon name="download" [size]="12" />
              </button>
            } @else {
              <span class="wtag" style="left:auto;right:8px">SOLO VISTA</span>
            }
          </div>
        }
      </div>
    }
  `,
  styles: `
    :host { display: block; }
    .m-head { display: flex; justify-content: space-between; align-items: center; padding: 16px 22px; border-bottom: 1px solid var(--line); }
    .m-title { font: 600 10.5px 'IBM Plex Mono'; letter-spacing: .2em; color: var(--soft); }
    .ibtn { width: 30px; height: 30px; display: grid; place-items: center; border: 1px solid var(--line2); border-radius: 3px; background: transparent; transition: all .2s; }
    .ibtn:hover { border-color: var(--ink); }
    .wp-head { padding: 30px 30px 24px; border-bottom: 1px solid var(--line); }
    .wp-head h3 { font: 550 34px 'Fraunces'; margin: 10px 0 8px; }
    .wp-head .sub { font: 500 10px 'IBM Plex Mono'; letter-spacing: .12em; color: var(--soft); line-height: 1.8; }
    .wp-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(210px, 1fr)); gap: 14px; padding: 24px 30px 30px; }
    .wp-item { position: relative; border: 1px solid var(--line2); border-radius: 3px; overflow: hidden; }
    .wp-item img { width: 100%; aspect-ratio: 4/3; object-fit: cover; }
    .wp-item .wbtn { position: absolute; bottom: 8px; right: 8px; }
    .wp-item .wtag { position: absolute; bottom: 8px; left: 8px; font: 600 8px 'IBM Plex Mono'; letter-spacing: .14em; color: var(--cream); background: rgba(27, 22, 17, .72); padding: 4px 7px; border-radius: 2px; }
    .wp-empty { padding: 60px 30px; text-align: center; color: var(--soft); font: italic 400 17px 'Fraunces'; }
    .ibt { width: 26px; height: 26px; display: grid; place-items: center; border: 1px solid var(--line2); border-radius: 3px; background: transparent; color: var(--soft); transition: all .2s; }
    .ibt.on { background: var(--green); border-color: var(--green); color: var(--cream); }
    .ibt.on:hover { background: #245530; color: var(--cream); }
    .sec-label { font: 600 9.5px 'IBM Plex Mono'; letter-spacing: .18em; color: var(--soft); }
  `,
})
export class PublicWebModal {
  readonly titleId = input.required<string>();

  private readonly store = inject(PaseStore);
  private readonly modals = inject(ModalService);

  protected approved() {
    return this.store.photos().filter((p) => p.state === 'approved');
  }

  protected dlCount() {
    return this.approved().filter((p) => p.dl).length;
  }

  protected close(): void {
    this.modals.close();
  }

  protected download(p: EventPhoto): void {
    const a = document.createElement('a');
    a.href = p.big;
    a.download = `foto-${p.id}.jpg`;
    a.click();
  }
}
