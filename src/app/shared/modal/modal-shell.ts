import { isPlatformBrowser } from '@angular/common';
import {
  Component,
  DestroyRef,
  ElementRef,
  PLATFORM_ID,
  afterNextRender,
  inject,
  input,
  output,
  viewChild,
} from '@angular/core';

const FOCUSABLE = [
  'a[href]',
  'button:not([disabled])',
  'textarea:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(', ');

/**
 * Dialog chrome: scrim, surface, focus management.
 *
 * The prototype's `openModal()` provides none of this — no `role`, no
 * `aria-modal`, no focus trap, no focus restore, no background `inert`,
 * no scroll lock (`app.js:558-568`). All of it is built here, browser-only.
 *
 * Contract: projected content must render its own heading with
 * `class="m-title"` and `[id]="titleId()"`, because `aria-labelledby`
 * points at it.
 *
 * `.overlay`, `.modal`, `.m-head`, `.m-title`, `.m-body`, `.m-actions`
 * and the `fadeIn`/`pop` keyframes all live in `src/styles.css`.
 */
@Component({
  selector: 'app-modal-shell',
  templateUrl: './modal-shell.html',
})
export class ModalShell {
  readonly titleId = input.required<string>();
  readonly wide = input(false);
  readonly dark = input(false);
  readonly closed = output<void>();

  protected readonly panel = viewChild.required<ElementRef<HTMLElement>>('panel');

  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
  private readonly destroyRef = inject(DestroyRef);
  private restoreTarget: HTMLElement | null = null;
  private previousOverflow: string | null = null;

  constructor() {
    // Every DOM effect waits for the browser: nothing here may run while
    // the server renders this component.
    afterNextRender(() => {
      if (!this.isBrowser) return;

      this.restoreTarget = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      this.previousOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';

      // Capturing, so Escape still closes when focus ended up outside.
      const onKeydown = (event: KeyboardEvent) => {
        if (event.key === 'Escape') {
          event.preventDefault();
          this.closed.emit();
          return;
        }
        if (event.key === 'Tab') this.trapTab(event);
      };
      document.addEventListener('keydown', onKeydown, true);

      this.destroyRef.onDestroy(() => {
        document.removeEventListener('keydown', onKeydown, true);
        this.release();
      });

      this.focusFirst();
    });
  }

  protected onBackdrop(event: MouseEvent): void {
    if (event.target === event.currentTarget) this.closed.emit();
  }

  private trapTab(event: KeyboardEvent): void {
    const panel = this.panel().nativeElement;
    const focusable = this.focusables();
    if (!focusable.length) {
      event.preventDefault();
      panel.focus();
      return;
    }

    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    const active = document.activeElement;
    const inside = active instanceof HTMLElement && panel.contains(active);

    if (!inside) {
      event.preventDefault();
      (event.shiftKey ? last : first).focus();
      return;
    }
    if (event.shiftKey && active === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && active === last) {
      event.preventDefault();
      first.focus();
    }
  }

  private focusables(): HTMLElement[] {
    return Array.from(
      this.panel().nativeElement.querySelectorAll<HTMLElement>(FOCUSABLE),
    ).filter((el) => el.getClientRects().length > 0);
  }

  private focusFirst(): void {
    const [first] = this.focusables();
    (first ?? this.panel().nativeElement).focus();
  }

  /** Undo the scroll lock and hand focus back to the trigger. */
  private release(): void {
    if (!this.isBrowser) return;
    if (this.previousOverflow !== null) {
      document.body.style.overflow = this.previousOverflow;
      this.previousOverflow = null;
    }
    this.restoreTarget?.focus();
    this.restoreTarget = null;
  }
}
