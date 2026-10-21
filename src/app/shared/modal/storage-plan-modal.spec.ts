import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { ModalService } from '../../core/modal.service';
import { ModalOutlet } from './modal-outlet';

/**
 * The storage-plan modal used to write a signal WHILE Angular rendered its
 * template (`selectedPlan.set(ev.max)` inside `event()`), which raised NG0600
 * and left the overlay empty — the modal never opened. These specs render the
 * real overlay and prove it opens with the event's figures and with the
 * event's current plan preselected.
 */
describe('StoragePlanModal', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [ModalOutlet],
      // PaseStore depends on DataApiService → HttpClient; the modal never
      // talks to a backend (the seed snapshot answers it).
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
  });

  it('opens the overlay with the event figures and the current plan preselected', async () => {
    TestBed.inject(ModalService).open({ kind: 'storagePlan', eventId: 'ev1' });
    const fixture = TestBed.createComponent(ModalOutlet);
    await fixture.whenStable();

    const el = fixture.nativeElement as HTMLElement;
    const panel = el.querySelector('.overlay .modal');
    expect(panel).not.toBeNull();
    expect(panel?.querySelector('.m-title')?.textContent).toContain('GALA ANIVERSARIO VALDEMAR');
    expect(panel?.querySelector('.adm-line')?.textContent).toContain(
      'USO ACTUAL · 12.4 GB DE 50 GB',
    );

    const checked = Array.from(panel!.querySelectorAll<HTMLInputElement>('input[type="radio"]'))
      .filter((radio) => radio.checked)
      .map((radio) => radio.value);
    expect(checked).toEqual(['50']);
  });
});
