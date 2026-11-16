import { Component, input, output } from '@angular/core';

import type { EventPhoto } from '../../../core/models';
import { Icon } from '../../../shared/icon';

@Component({
  selector: 'app-photo-card',
  imports: [Icon],
  template: `
    <figure
      class="photo"
      [class.st-approved]="photo().state === 'approved'"
      [class.st-pending]="photo().state === 'pending'"
      [class.st-rejected]="photo().state === 'rejected'"
    >
      <div class="photo-media" (click)="openLightbox.emit()">
        <img [src]="photo().url" [alt]="'Foto subida por ' + photo().author" loading="lazy" />
        <div class="pactions">
          @if (photo().state !== 'approved') {
            <button
              type="button"
              class="pbtn ok"
              (click)="$event.stopPropagation(); approve.emit()"
              title="Aprobar y publicar"
              [attr.aria-label]="'Aprobar y publicar la foto de ' + photo().author"
            >
              <app-icon name="check" [size]="17" />
            </button>
          }
          @if (photo().state !== 'rejected') {
            <button
              type="button"
              class="pbtn bad"
              (click)="$event.stopPropagation(); reject.emit()"
              title="Rechazar"
              [attr.aria-label]="'Rechazar la foto de ' + photo().author"
            >
              <app-icon name="x" [size]="17" />
            </button>
          }
        </div>
        @if (photo().state === 'pending') {
          <span class="pbadge">REVISAR</span>
        }
        @if (photo().state === 'rejected') {
          <span class="stamp rej">RECHAZADA</span>
        }
      </div>
      <figcaption class="pcap">
        <!-- The prototype opens the lightbox from a click handler on the
             whole media area, which no keyboard can reach. The media div
             stays a mouse-only shortcut; this button is the real control,
             so the card is operable without a pointer. Keeping them
             separate also avoids nesting buttons inside a role="button". -->
        <button type="button" class="pcap-btn" (click)="openLightbox.emit()">
          <span class="pcap-txt"
            >{{ photo().author.toUpperCase() }} · {{ photo().time }} · {{ photo().size }} MB</span
          >
          <span class="sr-only">Ver la foto completa de {{ photo().author }}</span>
        </button>
        <span class="pcap-flags">
          @if (photo().state === 'approved') {
            <span class="webflag"> <app-icon name="eye" [size]="11" />EN WEB </span>
            <button
              type="button"
              class="ibt"
              [class.on]="photo().dl"
              (click)="toggleDownload.emit()"
              [attr.aria-pressed]="photo().dl"
              aria-label="Permitir descarga"
              [title]="photo().dl ? 'Descarga habilitada' : 'Habilitar descarga'"
            >
              <app-icon name="download" [size]="12" />
            </button>
          }
        </span>
      </figcaption>
    </figure>
  `,
  styles: `
    :host {
      display: block;
      break-inside: avoid;
    }
    .photo {
      break-inside: avoid;
      margin: 0 0 16px;
      border: 1px solid var(--line2);
      border-radius: 3px;
      overflow: hidden;
      background: var(--paper2);
    }
    .photo-media {
      position: relative;
      overflow: hidden;
      cursor: zoom-in;
    }
    .photo-media img {
      width: 100%;
      transition:
        transform 0.5s cubic-bezier(0.2, 0.8, 0.25, 1),
        filter 0.4s;
    }
    .photo:hover .photo-media img {
      transform: scale(1.045);
    }
    .photo.st-rejected .photo-media img {
      filter: grayscale(1) contrast(0.92);
      opacity: 0.5;
    }
    .pactions {
      position: absolute;
      inset: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 10px;
      background: rgba(27, 22, 17, 0.42);
      opacity: 0;
      transition: opacity 0.25s;
    }
    .photo:hover .pactions,
    .photo.st-pending .pactions {
      opacity: 1;
    }
    .pbtn {
      width: 40px;
      height: 40px;
      border-radius: 50%;
      border: 1px solid var(--cream);
      display: grid;
      place-items: center;
      background: var(--cream);
      color: var(--ink);
      transition: all 0.2s;
    }
    .pbtn.ok:hover {
      background: var(--green);
      color: var(--cream);
      border-color: var(--green);
    }
    .pbtn.bad:hover {
      background: var(--accent);
      color: var(--cream);
      border-color: var(--accent);
    }
    .pbadge {
      position: absolute;
      top: 10px;
      right: 10px;
      font: 600 8.5px 'IBM Plex Mono';
      letter-spacing: 0.16em;
      color: var(--amber);
      border: 1px solid var(--amber);
      background: rgba(251, 248, 241, 0.92);
      padding: 4px 7px;
      border-radius: 2px;
    }
    .stamp {
      position: absolute;
      top: 50%;
      left: 50%;
      font: 600 13px 'IBM Plex Mono';
      letter-spacing: 0.22em;
      white-space: nowrap;
      border: 2.5px solid currentColor;
      padding: 8px 14px;
      border-radius: 3px;
      pointer-events: none;
      transform: translate(-50%, -50%) rotate(-7deg);
    }
    .stamp.rej {
      color: #f0a088;
      background: rgba(60, 20, 10, 0.5);
    }
    .stamp.anim {
      animation: stampIn 1.7s cubic-bezier(0.2, 0.9, 0.3, 1) both;
    }
    @keyframes stampIn {
      0% {
        opacity: 0;
        transform: translate(-50%, -50%) rotate(-7deg) scale(2.4);
      }
      38% {
        opacity: 1;
        transform: translate(-50%, -50%) rotate(-7deg) scale(0.94);
      }
      50% {
        transform: translate(-50%, -50%) rotate(-7deg) scale(1);
      }
      78% {
        opacity: 1;
      }
      100% {
        opacity: 0;
        transform: translate(-50%, -50%) rotate(-7deg) scale(1);
      }
    }
    .pcap {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 8px;
      padding: 9px 11px;
      border-top: 1px solid var(--line);
    }
    /* Reset only — the caption must keep rendering as the plain text it was. */
    .pcap-btn {
      background: transparent;
      border: 0;
      padding: 0;
      margin: 0;
      font: inherit;
      color: inherit;
      text-align: left;
      cursor: zoom-in;
      min-width: 0;
    }
    .pcap-txt {
      font: 500 9px 'IBM Plex Mono';
      letter-spacing: 0.07em;
      color: var(--soft);
    }
    .pcap-flags {
      display: flex;
      align-items: center;
      gap: 8px;
      flex-shrink: 0;
    }
    .webflag {
      font: 600 8.5px 'IBM Plex Mono';
      letter-spacing: 0.14em;
      color: var(--green);
      display: inline-flex;
      align-items: center;
      gap: 5px;
    }
    .ibt {
      width: 26px;
      height: 26px;
      display: grid;
      place-items: center;
      border: 1px solid var(--line2);
      border-radius: 3px;
      background: transparent;
      color: var(--soft);
      transition: all 0.2s;
    }
    .ibt.on {
      background: var(--green);
      border-color: var(--green);
      color: var(--cream);
    }
    .ibt:hover {
      border-color: var(--ink);
      color: var(--ink);
    }
    .ibt.on:hover {
      background: #245530;
      color: var(--cream);
    }
  `,
})
export class PhotoCard {
  readonly photo = input.required<EventPhoto>();

  readonly approve = output<void>();
  readonly reject = output<void>();
  readonly toggleDownload = output<void>();
  readonly openLightbox = output<void>();
}
