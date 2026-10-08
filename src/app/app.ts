import { Component, computed, inject } from '@angular/core';

import { ModalService } from './core/modal.service';
import { PaseStore } from './core/pase-store';
import { AdminView } from './features/admin/admin-view';
import { ProviderView } from './features/provider/provider-view';
import { Topbar } from './layout/topbar/topbar';
import { GrainOverlay } from './shared/grain-overlay';
import { ModalOutlet } from './shared/modal/modal-outlet';
import { ToastHost } from './shared/toasts/toast-host';

@Component({
  selector: 'app-root',
  imports: [AdminView, ProviderView, GrainOverlay, ModalOutlet, ToastHost, Topbar],
  templateUrl: './app.html',
})
export class App {
  protected readonly store = inject(PaseStore);
  private readonly modals = inject(ModalService);

  protected readonly modalOpen = computed(() => this.modals.current() !== null);
}
