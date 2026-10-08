import { Component, input, output } from '@angular/core';

import { Icon } from './icon';

@Component({
  selector: 'app-search-field',
  imports: [Icon],
  template: `
    <div class="search">
      <app-icon name="search" [size]="14" />
      <label [attr.for]="id()" class="sr-only">Buscar por nombre, email o pase</label>
      <input
        [id]="id()"
        type="text"
        [placeholder]="placeholder()"
        [value]="value()"
        (input)="onInput($event)"
      />
    </div>
  `,
  styles: `
    .search {
      display: flex;
      align-items: center;
      gap: 9px;
      border: 1px solid var(--line2);
      border-radius: 3px;
      padding: 8px 12px;
      min-width: 250px;
      background: var(--paper2);
    }

    .search svg {
      width: 14px;
      height: 14px;
      color: var(--soft);
      flex-shrink: 0;
    }

    /* "outline: 0" is deliberately absent. It outranked the global
       *:focus-visible ring (0,1,1 vs 0,1,0), so the search box — the
       only text input in the admin view — had no focus indicator at all. */
    .search input {
      border: 0;
      background: transparent;
      font: 400 13px 'Space Grotesk';
      color: var(--ink);
      width: 100%;
    }

    .search input::placeholder {
      color: var(--soft);
    }
  `,
})
export class SearchField {
  readonly id = input('search');
  readonly placeholder = input('Buscar por nombre, email o pase…');
  readonly value = input('');

  readonly changed = output<string>();

  protected onInput(event: Event): void {
    const target = event.target as HTMLInputElement;
    this.changed.emit(target.value);
  }
}
