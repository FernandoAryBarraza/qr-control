import { Component, inject } from '@angular/core';

import { ToastService } from '../../core/toast.service';
import { Icon } from '../icon';

/**
 * Toast container. The prototype has no live region at all, so screen
 * readers announce nothing when an invitation is sent or a photo is
 * approved — `role="log"` + `aria-live="polite"` fixes that.
 *
 * `.toasts` / `.toast` come from `src/styles.css`.
 */
@Component({
  selector: 'app-toast-host',
  imports: [Icon],
  template: `
    <div class="toasts" role="log" aria-live="polite" aria-label="Notificaciones">
      @for (toast of toasts.toasts(); track toast.id) {
        <div
          class="toast"
          [class.ok]="toast.kind === 'ok'"
          [class.warn]="toast.kind === 'warn'"
          [class.out]="toast.leaving"
        >
          <app-icon [name]="toast.icon" [size]="15" />
          <span>{{ toast.message }}</span>
        </div>
      }
    </div>
  `,
})
export class ToastHost {
  protected readonly toasts = inject(ToastService);
}
