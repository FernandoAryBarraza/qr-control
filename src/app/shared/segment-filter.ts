import { Component, computed, input, output } from '@angular/core';

export interface SegmentFilterOption {
  readonly value: string;
  readonly label: string;
  readonly count?: number;
}

@Component({
  selector: 'app-segment-filter',
  template: `
    <div
      class="segf"
      role="radiogroup"
      [attr.aria-label]="ariaLabel()"
      (keydown)="onKeydown($event)"
    >
      @for (option of options(); track option.value) {
        <button
          type="button"
          role="radio"
          [id]="optionId(option.value)"
          [attr.aria-checked]="option.value === value()"
          [attr.tabindex]="option.value === value() ? 0 : -1"
          [class.active]="option.value === value()"
          (click)="select(option)"
        >
          {{ option.label }}@if (showCount(option)) {<sup>{{ option.count }}</sup>}
        </button>
      }
    </div>
  `,
  styles: `
    :host {
      display: inline-flex;
    }

    .segf {
      display: flex;
      gap: 2px;
    }

    .segf button {
      border: 0;
      background: transparent;
      padding: 8px 12px 10px;
      font: 600 10px 'IBM Plex Mono';
      letter-spacing: 0.12em;
      color: var(--soft);
      border-bottom: 2px solid transparent;
      transition: all 0.2s;
    }

    .segf button sup {
      font-size: 8px;
      margin-left: 4px;
      color: var(--accent);
    }

    .segf button:hover {
      color: var(--ink);
    }

    .segf button.active {
      color: var(--ink);
      border-bottom-color: var(--ink);
    }
  `,
})
export class SegmentFilter {
  readonly options = input.required<readonly SegmentFilterOption[]>();
  readonly value = input.required<string>();
  readonly ariaLabel = input('Filtros');
  readonly countInLabel = input(false); // variant

  readonly changed = output<string>();

  protected readonly optionIds = computed(() => new Map());

  protected showCount(option: SegmentFilterOption): boolean {
    return !this.countInLabel() && option.count !== undefined;
  }

  protected optionId(value: string): string {
    return `segf-${value.replace(/[^a-zA-Z0-9]/g, '-')}`;
  }

  protected select(option: SegmentFilterOption): void {
    if (option.value !== this.value()) {
      this.changed.emit(option.value);
    }
  }

  protected onKeydown(event: KeyboardEvent): void {
    const options = this.options();
    const currentIndex = options.findIndex((o) => o.value === this.value());
    if (currentIndex < 0) return;

    let nextIndex = currentIndex;
    if (event.key === 'ArrowRight') {
      nextIndex = (currentIndex + 1) % options.length;
    } else if (event.key === 'ArrowLeft') {
      nextIndex = (currentIndex - 1 + options.length) % options.length;
    } else {
      return;
    }
    event.preventDefault();
    const next = options[nextIndex];
    this.select(next);
    const element = document.getElementById(this.optionId(next.value));
    element?.focus();
  }
}
