import { Injectable } from '@angular/core';
import qrcode from 'qrcode-generator';

/**
 * Renders a QR matrix onto a canvas, ported from `app.js:480-491`.
 *
 * Browser-only by signature — `draw()` needs a real `HTMLCanvasElement`,
 * so callers must reach it from an `afterNextRender` callback or a user
 * gesture. The prototype's FNV-1a "fallback" branch is dropped: with an
 * npm dependency the CDN cannot fail, and the fallback emitted a
 * deterministic pattern that does not scan.
 */
@Injectable({ providedIn: 'root' })
export class QrRendererService {
  draw(canvas: HTMLCanvasElement, text: string, px = 480): void {
    const dark = '#1B1611';
    const light = '#FFFFFF';
    const quiet = 3;

    const qr = qrcode(0, 'M');
    qr.addData(text);
    qr.make();

    const n = qr.getModuleCount();
    const cell = Math.floor(px / (n + quiet * 2));
    const real = cell * (n + quiet * 2);

    canvas.width = canvas.height = real;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.fillStyle = light;
    ctx.fillRect(0, 0, real, real);
    ctx.fillStyle = dark;
    for (let r = 0; r < n; r++) {
      for (let c = 0; c < n; c++) {
        if (qr.isDark(r, c)) ctx.fillRect((c + quiet) * cell, (r + quiet) * cell, cell, cell);
      }
    }
  }
}
