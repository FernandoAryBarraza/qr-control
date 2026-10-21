import { Component, ElementRef, inject, input, output } from '@angular/core';

import type { Role } from '../../core/models';

/** One of the two views behind the prototype's segmented control. */
export interface RoleOption {
  readonly value: Role;
  readonly label: string;
}

/**
 * Role switch.
 *
 * The prototype is two buttons in a `.role-switch` div with the active
 * state carried only by an `active` class and a sliding `.role-thumb`
 * (`index.html:34-38`, `style.css:116-158`). Purely visual state — AT
 * hears two unlabelled "buttons" with no idea which view is showing.
 *
 * Rebuilt as an ARIA radiogroup (APG radio-group pattern): `aria-checked`
 * carries the state, one tab stop, arrow keys move between options. The
 * sliding thumb and its geometry are untouched.
 *
 * The inner `.role-switch` wrapper is required because the host stays
 * `display: contents` (the stylesheet drives `app-role-switch[data-role]`
 * while the pill surface lives on a real box).
 */
@Component({
  selector: 'app-role-switch',
  templateUrl: './role-switch.html',
  styleUrl: './role-switch.css',
  host: { '[attr.data-role]': 'value()' },
})
export class RoleSwitch {
  readonly options = input.required<readonly RoleOption[]>();
  readonly value = input.required<Role>();
  readonly changed = output<Role>();

  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  /** Arrow keys move focus and selection together. */
  protected onKeydown(event: KeyboardEvent): void {
    const options = this.options();
    const index = options.findIndex((option) => option.value === this.value());
    if (index < 0) return;

    const step = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0;
    if (!step) return;
    event.preventDefault();

    const next = options[(index + step + options.length) % options.length];
    this.select(next);
    this.host.nativeElement.querySelector<HTMLElement>(`#role-${next.value}`)?.focus();
  }

  protected select(option: RoleOption): void {
    if (option.value !== this.value()) this.changed.emit(option.value);
  }
}
