import { TestBed } from '@angular/core/testing';

import type { Guest } from '../../../core/models';
import { GuestTable } from './guest-table';

/**
 * Parser round-trip tests: serialize the rendered table wrapper and reparse it
 * with the HTML5 parser (jsdom uses parse5, the same tree-construction
 * algorithm as browsers). SSR markup and browser-parsed markup must be
 * parse-identical — see specs/admin-role-view-integrity (No Foster-Parented
 * Hosts, Semantic Table Markup).
 */
describe('GuestTable parser round-trip', () => {
  const GUESTS: readonly Guest[] = [
    {
      id: 'G-001',
      name: 'Ana Torres',
      email: 'ana.torres@example.com',
      phone: '+34 600 111 222',
      status: 'confirmed',
      table: 4,
      party: [
        { name: 'Luis Torres', rel: 'pareja' },
        { name: 'Nora Vidal', rel: 'hermana' },
      ],
      note: 'Llega tarde.',
    },
    {
      id: 'G-002',
      name: 'Marco Vidal',
      email: 'marco.vidal@example.com',
      phone: '+34 633 444 555',
      status: 'planned',
      table: 0,
      party: [],
      note: '',
    },
    {
      id: 'G-003',
      name: 'Sofía Núñez',
      email: 'sofia.nunez@example.com',
      phone: '+34 688 777 999',
      status: 'sent',
      table: 12,
      party: [
        { name: 'Paula Serra', rel: 'amiga' },
        { name: 'Diego Serra', rel: 'hermano' },
        { name: 'Rita Coll', rel: 'prima' },
        { name: 'Teo Marín', rel: 'amigo' },
      ],
      note: '',
    },
    {
      id: 'G-004',
      name: 'Iván Prat',
      email: 'ivan.prat@example.com',
      phone: '+34 612 000 111',
      status: 'declined',
      table: 7,
      party: [{ name: 'Eva Prat', rel: 'madre' }],
      note: 'No podrá asistir.',
    },
  ];

  async function renderTable(guests: readonly Guest[], expanded: ReadonlySet<string> = new Set()) {
    await TestBed.configureTestingModule({ imports: [GuestTable] }).compileComponents();
    const fixture = TestBed.createComponent(GuestTable);
    fixture.componentRef.setInput('guests', guests);
    fixture.componentRef.setInput('expandedGuests', expanded);
    await fixture.whenStable();
    return fixture;
  }

  /** Serialize `.table-wrap` and reparse through the HTML5 parser. */
  function reparse(el: HTMLElement): HTMLElement {
    const wrap = el.querySelector('.table-wrap') as HTMLElement;
    const holder = document.createElement('div');
    holder.innerHTML = wrap.innerHTML;
    return holder;
  }

  it('reparses collapsed rows as valid table content with no foster-parented hosts', async () => {
    const fixture = await renderTable(GUESTS);
    const reparsed = reparse(fixture.nativeElement as HTMLElement);

    const table = reparsed.querySelector('table');
    expect(table).not.toBeNull();

    // No element may be relocated before the table inside the wrapper.
    expect(table!.previousElementSibling).toBeNull();

    // Row components must emit real <tr> elements, never custom hosts.
    expect(reparsed.getElementsByTagName('app-guest-row').length).toBe(0);
    expect(reparsed.getElementsByTagName('app-guest-detail').length).toBe(0);

    const tbody = reparsed.querySelector('tbody');
    expect(tbody).not.toBeNull();
    expect(tbody!.children.length).toBe(GUESTS.length);
    expect(reparsed.querySelectorAll('tbody > tr[app-guest-row]').length).toBe(GUESTS.length);
    expect(Array.from(tbody!.children).every((child) => child.tagName === 'TR')).toBe(true);
  });

  it('reparses an expanded guest detail as a valid <tr> inside tbody', async () => {
    const fixture = await renderTable(GUESTS);
    const el = fixture.nativeElement as HTMLElement;

    // Expanding a row emits toggleGuest for that guest (real interaction).
    const toggled: string[] = [];
    const subscription = fixture.componentInstance.toggleGuest.subscribe((id: string) =>
      toggled.push(id),
    );
    (el.querySelector('.gname-btn') as HTMLButtonElement).click();
    expect(toggled).toEqual([GUESTS[0].id]);

    fixture.componentRef.setInput('expandedGuests', new Set([GUESTS[0].id]));
    await fixture.whenStable();

    const reparsed = reparse(el);
    const detail = reparsed.querySelector('tbody > tr[app-guest-detail]');
    expect(detail).not.toBeNull();
    expect(reparsed.getElementsByTagName('app-guest-detail').length).toBe(0);
    expect(detail!.querySelector('td')?.getAttribute('colspan')).toBe('7');

    const tbody = reparsed.querySelector('tbody');
    // 4 data rows + 1 detail row, all <tr>.
    expect(tbody!.children.length).toBe(GUESTS.length + 1);
    expect(Array.from(tbody!.children).every((child) => child.tagName === 'TR')).toBe(true);
    subscription.unsubscribe();
  });

  it('keeps seven scoped column headers after the round-trip', async () => {
    const fixture = await renderTable(GUESTS);
    const reparsed = reparse(fixture.nativeElement as HTMLElement);

    expect(reparsed.querySelectorAll('thead th[scope="col"]').length).toBe(7);
  });

  it('keeps the empty-state row valid when there are no guests', async () => {
    const fixture = await renderTable([]);
    const reparsed = reparse(fixture.nativeElement as HTMLElement);

    const table = reparsed.querySelector('table');
    expect(table).not.toBeNull();
    expect(table!.previousElementSibling).toBeNull();
    expect(reparsed.getElementsByTagName('app-guest-row').length).toBe(0);

    const tbody = reparsed.querySelector('tbody');
    expect(tbody!.children.length).toBe(1);
    expect(tbody!.firstElementChild!.tagName).toBe('TR');
    expect(tbody!.textContent).toContain('Ningún invitado coincide con la búsqueda.');
  });
});
