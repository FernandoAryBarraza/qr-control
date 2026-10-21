import { Component, afterNextRender, inject, input, signal } from '@angular/core';

import { PaseStore } from '../../core/pase-store';
import { ModalService } from '../../core/modal.service';
import { Icon } from '../icon';
import type { EventPhoto } from '../../core/models';

@Component({
  selector: 'app-photo-lightbox',
  imports: [Icon],
  template: `
    @if (photo(); as p) {
      <!-- ModalShell points aria-labelledby at titleId(). The lightbox
           has no visible heading of its own — the metadata strip is the
           closest thing — so the name lives in an sr-only node rather
           than adding chrome the prototype never had. -->
      <span class="sr-only" [id]="titleId()"
        >Foto de {{ p.author }} · {{ statusLabel(p.state) }}</span
      >
      <div class="lightbox">
        <img [src]="p.big" [alt]="'Foto de ' + p.author" />
        <div class="lb-bar">
          <span class="lb-meta"
            >{{ p.author.toUpperCase() }} · {{ p.time }} · {{ p.size }} MB ·
            {{ statusLabel(p.state) }}</span
          >
          <div class="lb-actions">
            @if (p.state !== 'approved') {
              <button
                type="button"
                class="pbtn ok"
                (click)="approve(p.id)"
                title="Aprobar"
                [attr.aria-label]="'Aprobar la foto de ' + p.author"
              >
                <app-icon name="check" [size]="17" />
              </button>
            }
            @if (p.state !== 'rejected') {
              <button
                type="button"
                class="pbtn bad"
                (click)="reject(p.id)"
                title="Rechazar"
                [attr.aria-label]="'Rechazar la foto de ' + p.author"
              >
                <app-icon name="x" [size]="17" />
              </button>
            }
            <button
              type="button"
              class="ibt"
              [class.on]="p.dl"
              (click)="toggleDl(p.id)"
              [attr.aria-pressed]="p.dl"
              aria-label="Permitir descarga"
              title="Descargable"
            >
              <app-icon name="download" [size]="12" />
            </button>
          </div>
        </div>
      </div>
      <button
        type="button"
        class="lb-nav lb-prev"
        (click)="prev()"
        title="Anterior"
        aria-label="Foto anterior"
      >
        <app-icon name="arrowLeft" [size]="18" />
      </button>
      <button
        type="button"
        class="lb-nav lb-next"
        (click)="next()"
        title="Siguiente"
        aria-label="Foto siguiente"
      >
        <app-icon name="arrowRight" [size]="18" />
      </button>
      <button type="button" class="lb-close" (click)="close()" title="Cerrar" aria-label="Cerrar">
        <app-icon name="x" [size]="18" />
      </button>
    }
  `,
  styles: `
    :host {
      display: contents;
    }
    .lightbox {
      position: relative;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 0;
      animation: pop 0.3s cubic-bezier(0.2, 0.9, 0.3, 1.1) both;
      max-width: min(920px, 94vw);
    }
    .lightbox img {
      max-width: 100%;
      max-height: 74vh;
      border: 1px solid rgba(243, 239, 230, 0.3);
    }
    .lb-bar {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 18px;
      width: 100%;
      padding: 14px 2px;
      flex-wrap: wrap;
    }
    .lb-meta {
      font: 500 10px 'IBM Plex Mono';
      letter-spacing: 0.1em;
      color: rgba(243, 239, 230, 0.75);
    }
    .lb-actions {
      display: flex;
      gap: 8px;
    }
    .lb-actions .pbtn {
      width: 36px;
      height: 36px;
      background: transparent;
      color: var(--cream);
      border-radius: 50%;
      border: 1px solid var(--cream);
      display: grid;
      place-items: center;
    }
    .lb-actions .pbtn.ok:hover {
      background: var(--green);
      border-color: var(--green);
    }
    .lb-actions .pbtn.bad:hover {
      background: var(--accent);
      border-color: var(--accent);
    }
    .ibt {
      width: 26px;
      height: 26px;
      display: grid;
      place-items: center;
      border: 1px solid rgba(243, 239, 230, 0.4);
      border-radius: 3px;
      background: transparent;
      color: var(--cream);
      transition: all 0.2s;
    }
    .ibt.on {
      background: var(--green);
      border-color: var(--green);
      color: var(--cream);
    }
    .ibt:hover {
      background: var(--cream);
      color: var(--ink);
    }
    .ibt.on:hover {
      background: #245530;
      color: var(--cream);
    }
    .lb-nav {
      position: fixed;
      top: 50%;
      transform: translateY(-50%);
      width: 46px;
      height: 46px;
      border-radius: 50%;
      border: 1px solid rgba(243, 239, 230, 0.4);
      background: rgba(27, 22, 17, 0.5);
      color: var(--cream);
      display: grid;
      place-items: center;
      transition: all 0.2s;
    }
    .lb-nav:hover {
      background: var(--cream);
      color: var(--ink);
    }
    .lb-prev {
      left: 26px;
    }
    .lb-next {
      right: 26px;
    }
    .lb-close {
      position: fixed;
      top: 22px;
      right: 26px;
      width: 38px;
      height: 38px;
      border-radius: 50%;
      border: 1px solid rgba(243, 239, 230, 0.4);
      background: rgba(27, 22, 17, 0.5);
      color: var(--cream);
      display: grid;
      place-items: center;
    }
    .lb-close:hover {
      background: var(--cream);
      color: var(--ink);
    }
    @keyframes pop {
      from {
        transform: scale(0.96);
        opacity: 0;
      }
      to {
        transform: scale(1);
        opacity: 1;
      }
    }
  `,
})
export class PhotoLightbox {
  readonly photoList = input.required<readonly string[]>();
  readonly photoIndex = input<number>(0);
  readonly titleId = input<string>('');

  private readonly store = inject(PaseStore);
  private readonly modals = inject(ModalService);

  protected idx = signal(0);

  constructor() {
    afterNextRender(() => {
      this.idx.set(this.photoIndex());
    });
  }

  protected photo(): EventPhoto | undefined {
    const id = this.photoList()[this.idx()];
    return this.store.photos().find((p) => p.id === id);
  }

  protected statusLabel(s: string): string {
    return s === 'approved' ? 'APROBADA · EN WEB' : s === 'rejected' ? 'RECHAZADA' : 'PENDIENTE';
  }

  protected prev(): void {
    const n = this.photoList().length;
    if (!n) return;
    const nextIdx = (this.idx() - 1 + n) % n;
    this.idx.set(nextIdx);
    this.modals.patch({ photoIndex: nextIdx });
  }

  protected next(): void {
    const n = this.photoList().length;
    if (!n) return;
    const nextIdx = (this.idx() + 1) % n;
    this.idx.set(nextIdx);
    this.modals.patch({ photoIndex: nextIdx });
  }

  protected close(): void {
    this.modals.close();
  }

  protected approve(id: string): void {
    this.store.setPhotoState(id, 'approved');
  }

  protected reject(id: string): void {
    this.store.setPhotoState(id, 'rejected');
  }

  protected toggleDl(id: string): void {
    this.store.toggleDownload(id);
  }
}
