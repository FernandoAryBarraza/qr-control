import { Component, input } from '@angular/core';

import type { PaseUser } from '../../core/models';

/**
 * Initials avatar plus name and role.
 *
 * The prototype builds this with `innerHTML` from a template literal
 * (`app.js:193-196`) — in a dialog the name is the user's only label, so
 * it is spelled out here rather than interpolated as HTML.
 *
 * A plain `div`, not a `button`: the prototype's control opens the
 * security slice (gate logins, pending invites), which does not exist
 * yet, and a button with no handler is a promise the UI cannot keep.
 */
@Component({
  selector: 'app-user-chip',
  templateUrl: './user-chip.html',
  styleUrl: './user-chip.css',
  host: { '[attr.data-role]': 'user().role' },
})
export class UserChip {
  readonly user = input.required<PaseUser>();
}