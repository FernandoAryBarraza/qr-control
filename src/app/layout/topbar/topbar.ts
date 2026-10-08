import { Component, inject } from '@angular/core';

import { PaseStore } from '../../core/pase-store';
import type { Role } from '../../core/models';
import { Clock } from './clock';
import { RoleSwitch, type RoleOption } from './role-switch';
import { UserChip } from './user-chip';

/**
 * Sticky application bar: mark, role switch, live clock, user chip.
 *
 * Mirrors `index.html:29-43`. The prototype also renders an event picker,
 * a search field and a mobile hamburger in this bar; those belong to the
 * admin and provider feature slices and are absent here. The search box
 * is omitted rather than rendered `disabled`, because the prototype's own
 * styling drops disabled inputs to `opacity:.4`, and shipping a dead
 * control that looks broken is worse than shipping none.
 */
@Component({
  selector: 'app-topbar',
  imports: [Clock, RoleSwitch, UserChip],
  templateUrl: './topbar.html',
  styleUrl: './topbar.css',
})
export class Topbar {
  protected readonly store = inject(PaseStore);

  protected readonly roleOptions: readonly RoleOption[] = [
    { value: 'admin', label: 'Administrador' },
    { value: 'provider', label: 'Proveedor' },
  ];

  protected setRole(role: Role): void {
    this.store.setRole(role);
  }
}