import { TestBed } from '@angular/core/testing';

import { NO_VALUE } from '../../core/event-display';
import type { PaseEvent } from '../../core/models';
import { EventRow } from './event-row';

/**
 * The provider's event row renders four families of DISPLAY state the API
 * does not send: the countdown badge, the administrator's contact details
 * and the guards' post and scanner app state. All of them are resolved
 * through the client-side display mock (`event-display.ts`).
 *
 * These specs pin that wiring, and — more importantly — that a row whose
 * event has NO fixture degrades honestly: the em dash, never an empty
 * string and never a plausible-looking invention.
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

/** The four guards of the prototype's first event. */
const EV1_SECURITY = [
  { name: 'Josué Andrade' },
  { name: 'Paola Reyes' },
  { name: 'Iván Cortés' },
  { name: 'Miguel Ángel Ruiz' },
];

/** Collapsed whitespace, so the assertions do not depend on the template's. */
function text(node: Element | null): string {
  return (node?.textContent ?? '').replace(/\s+/g, ' ').trim();
}

function texts(nodes: NodeListOf<Element>): string[] {
  return Array.from(nodes).map(text);
}

async function render(event: PaseEvent, expanded = true): Promise<HTMLElement> {
  await TestBed.configureTestingModule({ imports: [EventRow] }).compileComponents();
  const fixture = TestBed.createComponent(EventRow);
  fixture.componentRef.setInput('event', event);
  fixture.componentRef.setInput('expanded', expanded);
  await fixture.whenStable();
  return fixture.nativeElement as HTMLElement;
}

describe('EventRow', () => {
  describe('the countdown badge', () => {
    it('renders the badge of the upcoming event, resolved through the mock', async () => {
      const el = await render(
        payload({ id: 'ev2', status: 'upcoming', name: 'Boda Hernández · Riva' }),
      );

      expect(text(el.querySelector('.er-cd'))).toBe('EN 42 DÍAS');
    });

    it('renders no badge for an event without one', async () => {
      const el = await render(payload());

      expect(el.querySelector('.er-cd')).toBeNull();
    });
  });

  describe('the administrator contact', () => {
    it('renders the email, the phone and the tenure, resolved through the mock', async () => {
      const el = await render(payload());

      expect(texts(el.querySelectorAll('.adm-line'))).toEqual([
        'mariana.solorzana@valdemar.mx',
        '+52 646 118 44 20',
      ]);
      expect(text(el.querySelector('.adm-since'))).toBe('Cliente desde 2023');
    });
  });

  describe('the guards', () => {
    it('renders the posts and the app states, resolved through the mock', async () => {
      const el = await render(payload({ security: EV1_SECURITY }));

      expect(texts(el.querySelectorAll('.sec-post'))).toEqual([
        'ESCÁNER — PUERTA A',
        'ESCÁNER — PUERTA B',
        'ESCÁNER — JARDÍN',
        'RESERVA — MEDITERRÁNEO',
      ]);
      expect(texts(el.querySelectorAll('.app-state'))).toEqual([
        'EN LÍNEA · 20:41',
        'EN LÍNEA · 20:38',
        'EN LÍNEA · 20:29',
        'SIN ACTIVAR',
      ]);
    });

    it('counts the online scanners of the row, resolved through the mock', async () => {
      const el = await render(payload({ security: EV1_SECURITY }));

      const labels = texts(el.querySelectorAll('.dcol-label'));
      expect(labels[1]).toBe('SEGURIDAD CON APP ESCÁNER · 3/4 EN LÍNEA');
    });
  });

  describe('an event the prototype never had', () => {
    it('degrades honestly instead of rendering empty lines', async () => {
      const el = await render(
        payload({ id: 'ev-404', security: [{ name: 'Guardia Desconocida' }] }),
      );

      // The em dash, never an empty line and never a made-up address.
      expect(texts(el.querySelectorAll('.adm-line'))).toEqual([NO_VALUE, NO_VALUE]);
      expect(text(el.querySelector('.adm-since'))).toBe(NO_VALUE);
      expect(text(el.querySelector('.sec-post'))).toBe(NO_VALUE);
      // The guard has no scanner app: that is a state, not an unknown.
      expect(text(el.querySelector('.app-state'))).toBe('SIN INSTALAR');
      expect(texts(el.querySelectorAll('.dcol-label'))[1]).toBe(
        'SEGURIDAD CON APP ESCÁNER · 0/1 EN LÍNEA',
      );
      expect(el.querySelector('.er-cd')).toBeNull();
    });
  });
});
