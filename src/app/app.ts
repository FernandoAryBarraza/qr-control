import { isPlatformBrowser } from '@angular/common';
import { Component, PLATFORM_ID, afterNextRender, computed, inject } from '@angular/core';

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
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  protected readonly modalOpen = computed(() => this.modals.current() !== null);

  constructor() {
    // Hydration-safe read path (spec req 15 / design §4): the prerendered HTML
    // renders the store's empty state, and the API fetch runs only after
    // the first client render has hydrated — identical initial state on both
    // sides, so no NG0500/NG0502 can arise from data loading. Browser-only
    // guard mirrors the FeedService pattern: the Node render never fetches.
    afterNextRender(() => {
      if (!this.isBrowser) return;
      void this.store.load();
    });
  }
}
