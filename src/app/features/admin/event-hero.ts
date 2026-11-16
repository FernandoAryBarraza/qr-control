import { Component, inject } from '@angular/core';

import { PUBLIC_WEB_URL } from '../../core/seed-data';
import { ModalService } from '../../core/modal.service';
import { ToastService } from '../../core/toast.service';
import { Icon } from '../../shared/icon';

@Component({
  selector: 'app-event-hero',
  template: `
    <div class="event-hero">
      <div>
        <div class="tag-live"><span class="dot"></span>EVENTO ACTIVO</div>
        <h1 class="event-title" id="evTitle">Gala <em>Aniversario</em> Valdemar</h1>
        <div class="event-meta">
          <span><app-icon name="calendar" [size]="13" />SÁB 14 JUN 2025 · 20:00 H</span>
          <span><app-icon name="mapPin" [size]="13" />HACIENDA LA MERCED · VALLE DE GUADALUPE</span>
        </div>
      </div>
      <div class="hero-actions">
        <button type="button" class="btn" (click)="openWeb()">
          <app-icon name="externalLink" [size]="14" />Web pública
        </button>
        <button type="button" class="btn solid" (click)="copyLink()">
          <app-icon name="link" [size]="14" />Copiar enlace
        </button>
      </div>
    </div>
  `,
  styles: `
    .event-hero {
      display: flex;
      align-items: flex-end;
      justify-content: space-between;
      gap: 32px;
      padding-bottom: 30px;
      border-bottom: 1px solid var(--ink);
      margin-bottom: 34px;
    }

    .tag-live {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      font: 600 10px 'IBM Plex Mono';
      letter-spacing: 0.2em;
      color: var(--green);
      margin-bottom: 14px;
    }

    .dot {
      width: 7px;
      height: 7px;
      border-radius: 50%;
      background: currentColor;
      animation: pulse 2s infinite;
    }

    @keyframes pulse {
      0%,
      100% {
        box-shadow: 0 0 0 0 rgba(47, 107, 63, 0.45);
      }
      50% {
        box-shadow: 0 0 0 7px rgba(47, 107, 63, 0);
      }
    }

    .event-title {
      font: 550 56px/1.02 'Fraunces';
      letter-spacing: -0.01em;
    }

    .event-title em {
      font-style: italic;
      font-weight: 400;
      color: var(--accent);
    }

    .event-meta {
      margin-top: 16px;
      font: 500 11.5px 'IBM Plex Mono';
      letter-spacing: 0.1em;
      color: var(--soft);
      display: flex;
      align-items: center;
      gap: 18px;
      flex-wrap: wrap;
    }

    .event-meta span {
      display: inline-flex;
      align-items: center;
      gap: 7px;
    }

    .hero-actions {
      display: flex;
      gap: 10px;
      flex-shrink: 0;
      padding-bottom: 6px;
    }

    /* Prototype 920 block (QR_Z_Open/style.css:2104-2110). Enforced here, not
       globally, because these selectors are component-scoped. */
    @media (max-width: 920px) {
      .event-hero {
        align-items: flex-start;
      }

      .event-title {
        font-size: 42px;
      }
    }
  `,
  imports: [Icon],
})
export class EventHero {
  private readonly modals = inject(ModalService);
  private readonly toast = inject(ToastService);

  protected openWeb(): void {
    this.modals.open({ kind: 'publicWeb' });
  }

  protected async copyLink(): Promise<void> {
    try {
      if (navigator.clipboard) {
        await navigator.clipboard.writeText(PUBLIC_WEB_URL);
        this.toast.push('Enlace copiado al portapapeles', 'ok', 'link');
      } else {
        this.toast.push('No se pudo copiar el enlace', 'warn', 'link');
      }
    } catch {
      this.toast.push('No se pudo copiar el enlace', 'warn', 'link');
    }
  }
}
