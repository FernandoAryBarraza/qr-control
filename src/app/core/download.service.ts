import { isPlatformBrowser } from '@angular/common';
import { Injectable, PLATFORM_ID, inject } from '@angular/core';

/**
 * Triggers browser downloads. Every method creates a detached anchor and
 * clicks it — browser-only, so each entry point is guarded rather than
 * trusting the caller to remember.
 */
@Injectable({ providedIn: 'root' })
export class DownloadService {
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  /** Serialises a canvas to PNG and saves it under `filename`. */
  canvasPng(canvas: HTMLCanvasElement, filename: string): void {
    if (!this.isBrowser) return;
    const anchor = document.createElement('a');
    anchor.download = filename;
    anchor.href = canvas.toDataURL('image/png');
    anchor.click();
  }

  /** Opens a remote image in a new tab and offers it as a download. */
  openImage(href: string, filename: string): void {
    if (!this.isBrowser) return;
    const anchor = document.createElement('a');
    anchor.href = href;
    anchor.download = filename;
    anchor.target = '_blank';
    anchor.click();
  }
}
