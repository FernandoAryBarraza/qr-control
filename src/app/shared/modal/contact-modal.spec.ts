import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { NO_VALUE } from '../../core/event-display';
import type { PaseEvent } from '../../core/models';
import { ModalService } from '../../core/modal.service';
import { PaseStore } from '../../core/pase-store';
import { ToastService } from '../../core/toast.service';
import { ModalOutlet } from './modal-outlet';

/**
 * The contact modal writes to the administrator of an event. The API sends
 * no address at all (the `User` model carries no email column), so the
 * address comes from the client-side display mock.
 *
 * The modal therefore has to be HONEST: with a contact on file it names the
 * real address, and without one it must never claim that a message was
 * sent — to an empty address, or to `undefined`.
 */

/** An event payload exactly as the API sends it: no display-only fields. */
function payload(over: Partial<PaseEvent> = {}): PaseEvent {
  return {
    id: 'ev1',
    status: 'active',
    name: 'Gala Aniversario Valdemar',
    dateLabel: '14 JUN 2025 · 20:00',
    guests: 218,
    photos: 96,
    admin: { name: 'Mariana Solórzano' },
    security: [],
    ...over,
  };
}

/** Collapsed whitespace, so the assertions do not depend on the template's. */
function text(node: Element | null): string {
  return (node?.textContent ?? '').replace(/\s+/g, ' ').trim();
}

describe('ContactModal', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [ModalOutlet],
      // PaseStore depends on DataApiService → HttpClient; the modal never
      // talks to a backend (the seed snapshot answers it).
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
  });

  /** Opens the real overlay for an event and returns the rendered panel. */
  async function open(event: PaseEvent): Promise<HTMLElement> {
    TestBed.inject(PaseStore).events.set([event]);
    TestBed.inject(ModalService).open({ kind: 'contact', eventId: event.id });

    const fixture = TestBed.createComponent(ModalOutlet);
    await fixture.whenStable();

    const panel = (fixture.nativeElement as HTMLElement).querySelector('.overlay .modal');
    expect(panel).not.toBeNull();
    return panel as HTMLElement;
  }

  /** Clicks the "Enviar" button of the rendered panel. */
  function send(panel: HTMLElement): void {
    (panel.querySelector('.btn.solid') as HTMLButtonElement).click();
  }

  it('shows the resolved address of the administrator in the header', async () => {
    const panel = await open(payload());

    expect(text(panel.querySelector('.adm-line'))).toBe(
      'PARA · mariana.solorzana@valdemar.mx · GALA ANIVERSARIO VALDEMAR',
    );
  });

  it('names the real address in the toast when a contact is on file', async () => {
    const panel = await open(payload());
    send(panel);

    const toasts = TestBed.inject(ToastService).toasts();
    expect(toasts.map((toast) => toast.message)).toEqual([
      'Mensaje enviado a mariana.solorzana@valdemar.mx',
    ]);
    expect(toasts[0].kind).toBe('ok');
  });

  it('does NOT claim a message was sent when there is no contact on file', async () => {
    const panel = await open(payload({ id: 'ev-404' }));

    // The header admits there is no address: the em dash, not an empty line.
    expect(text(panel.querySelector('.adm-line'))).toBe(
      `PARA · ${NO_VALUE} · GALA ANIVERSARIO VALDEMAR`,
    );

    send(panel);

    const toasts = TestBed.inject(ToastService).toasts();
    expect(toasts).toHaveLength(1);
    expect(toasts[0].message).not.toContain('Mensaje enviado');
    expect(toasts[0].message).not.toContain('undefined');
    expect(toasts[0].message).toContain('No hay una dirección de correo');
    expect(toasts[0].kind).toBe('warn');
  });

  it('does NOT claim a message was sent to a blank address', async () => {
    // A payload that defaults a missing address to `''` carries no address at
    // all: the toast must not name an empty one.
    const panel = await open(
      payload({ id: 'ev-404', admin: { name: 'Mariana Solórzano', email: '' } }),
    );

    expect(text(panel.querySelector('.adm-line'))).toBe(
      `PARA · ${NO_VALUE} · GALA ANIVERSARIO VALDEMAR`,
    );

    send(panel);

    const toasts = TestBed.inject(ToastService).toasts();
    expect(toasts).toHaveLength(1);
    expect(toasts[0].message).not.toContain('Mensaje enviado');
    expect(toasts[0].message).not.toContain('undefined');
    expect(toasts[0].kind).toBe('warn');
  });
});
