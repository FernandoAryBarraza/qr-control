# Delta for Event Persistence (Prisma + SQLite)

## ADDED Requirements

### Requirement: Persisted Role Model Without Authentication

The system SHALL persist users as records carrying exactly one of three roles: `provider`, `admin`, `security` (BR-01). There SHALL be no authentication, login, session, or token mechanism in this change; role enforcement SHALL read from a trusted caller context that can later be replaced by an auth layer without rewriting authorization logic.

#### Scenario: Three roles are the only roles

- GIVEN the persistence schema and API are in place
- WHEN a user record is created or queried through any API path
- THEN its role is exactly `provider`, `admin`, or `security`
- AND no login, session, or credential field exists on the user model or API surface

#### Scenario: Authorization is separable from caller identity

- GIVEN the authorization checks run on an admin-scoped endpoint
- WHEN the trusted caller context is inspected
- THEN role and event-scope resolution happen in a dedicated authorization layer, not inside route handlers or UI code
- AND swapping the context source requires no change to the authorization decision logic

### Requirement: Provider-Only Event Creation

Only a user with the `provider` role MAY create an event, and every event MUST be assigned at least one `admin` at creation time (BR-02).

#### Scenario: Provider creates an event

- GIVEN the caller role is `provider`
- WHEN an event creation request is submitted with at least one admin
- THEN the event is persisted with `start`, `end`, and retention settings

#### Scenario: Non-provider cannot create an event

- GIVEN the caller role is `admin` or `security`
- WHEN an event creation request is submitted
- THEN the request is rejected server-side (403-equivalent) and no event record is created

#### Scenario: Event without an admin is rejected

- GIVEN the caller role is `provider`
- WHEN an event creation request omits any admin assignment
- THEN the request is rejected and no event record is created

### Requirement: Event-Scoped Admin Authorization

An `admin` SHALL only read or write data belonging to events they are assigned to (BR-03). Every event-scoped entity (guests, companions, photos, check-ins, QRs) MUST be unreachable for an admin of a different event through ANY API path, including direct object access by ID — object-level authorization, not list filtering only (BR-04). Rejections MUST happen server-side regardless of what the UI shows.

#### Scenario: Admin reads own event data

- GIVEN an `admin` assigned to event A
- WHEN they request guests, photos, check-ins, or QRs of event A
- THEN the request succeeds and returns only event A data

#### Scenario: Admin read of another event is rejected

- GIVEN an `admin` assigned to event A only
- WHEN they request any list or object belonging to event B
- THEN the server responds with a 403-equivalent rejection
- AND no event B data is returned in the payload

#### Scenario: Object-level access by ID is rejected

- GIVEN an `admin` assigned to event A only
- WHEN they request a specific guest, photo, check-in, or QR record of event B by its exact ID
- THEN the server responds with a 403-equivalent rejection
- AND the record's contents are not disclosed

#### Scenario: Admin write to another event is rejected

- GIVEN an `admin` assigned to event A only
- WHEN they submit any mutation targeting an event B entity
- THEN the server rejects the mutation
- AND the event B record is unchanged

### Requirement: Second-Admin Approval Workflow

An `admin` MAY request creation of a second `admin` for their own event (BR-05). The request MUST start as `pending` and MUST NOT grant any scoped access until the event's `provider` sets it to `approved`. A `rejected` request grants nothing and MUST be retained as a record. The workflow states are exactly `pending`, `approved`, `rejected`.

#### Scenario: Pending request grants nothing

- GIVEN an `admin` of event A submitted a second-admin request
- WHEN the request status is `pending`
- THEN the candidate user has no access to event A data through any API path

#### Scenario: Provider approval grants scoped access

- GIVEN a `pending` second-admin request for event A
- WHEN the `provider` sets it to `approved`
- THEN the candidate gains exactly event A scoped access
- AND access remains limited to event A (BR-3 scope applies)

#### Scenario: Rejection is terminal but retained

- GIVEN a `pending` second-admin request
- WHEN the `provider` sets it to `rejected`
- THEN the candidate gains no access
- AND the rejected request record remains queryable as a record

#### Scenario: Admin cannot self-approve

- GIVEN an `admin` of event A with a `pending` second-admin request
- WHEN the admin attempts to set it to `approved`
- THEN the server rejects the transition
- AND the request stays `pending`

### Requirement: Admin-Created Lower Roles

The `admin` of an event SHALL create all lower roles for that event, including `security` staff (BR-06). The `provider` MAY read who holds permissions in an event but MUST NOT create or approve lower roles — only that event's `admin` decides those.

#### Scenario: Admin creates security staff for own event

- GIVEN the caller is the `admin` of event A
- WHEN they create a `security` user scoped to event A
- THEN the record is persisted and usable as trusted caller context for event A scanning endpoints

#### Scenario: Provider cannot create lower roles

- GIVEN the caller is the `provider`
- WHEN they attempt to create a `security` or lower `admin` role directly (outside the BR-05 approval flow)
- THEN the server rejects the request

#### Scenario: Provider can view role holders

- GIVEN the caller is the `provider`
- WHEN they query permission holders for any event
- THEN the server returns the current admins and security staff of that event

### Requirement: Per-Attendee QR Issuance

Every guest SHALL have their own QR record, and every companion MUST have their own separate QR record linked to the parent guest's QR record (BR-07). Companion QRs are never aliases or printings of the guest QR.

#### Scenario: Guest and each companion get distinct QRs

- GIVEN a confirmed guest with N companions
- WHEN QRs are issued for the party
- THEN there are N+1 distinct QR records
- AND each companion QR record references its parent guest QR record

#### Scenario: Companion QR verification resolves to the companion

- GIVEN a companion's QR token
- WHEN it is verified at the server endpoint
- THEN the response identifies the specific companion and its parent guest

### Requirement: Single-Use QR Enforcement

A QR SHALL be single-use: the first successful check-in consumes it, and every subsequent scan of the same token MUST be rejected (BR-08), regardless of scanner role or endpoint path.

#### Scenario: First scan succeeds

- GIVEN an unconsumed, unexpired QR for an active event
- WHEN a check-in is submitted with its token
- THEN the check-in is recorded and the QR is marked consumed

#### Scenario: Reuse is rejected

- GIVEN a consumed QR token
- WHEN any subsequent scan or check-in is submitted with that token
- THEN the request is rejected as already-used
- AND no second check-in record is created

### Requirement: QR Expiry at Event End

A QR SHALL be valid only before the owning event's `end` datetime (BR-09). This MUST apply to guest, companion, and emergency QRs alike — all expire at event end.

#### Scenario: Scan before event end succeeds

- GIVEN a valid unconsumed QR for an event whose `end` is in the future
- WHEN the QR is scanned
- THEN the check-in succeeds

#### Scenario: Scan at or after event end is rejected

- GIVEN a valid unconsumed QR for an event whose `end` has passed
- WHEN the QR is scanned
- THEN the request is rejected as expired
- AND no check-in record is created

#### Scenario: Emergency QRs expire too

- GIVEN an emergency QR issued for an event whose `end` has passed
- WHEN the QR is scanned
- THEN the request is rejected as expired

### Requirement: Emergency QR Issuance by Event Admin

An `admin` MAY issue emergency QRs for their own event only (BR-10); the BR-03 event scope applies to issuance exactly as to any other write.

#### Scenario: Admin issues emergency QR for own event

- GIVEN the caller is the `admin` of event A
- WHEN they request an emergency QR for event A
- THEN a QR record is created, marked as emergency, scoped to event A

#### Scenario: Admin cannot issue emergency QR for another event

- GIVEN the caller is the `admin` of event A only
- WHEN they request an emergency QR for event B
- THEN the server rejects the request and no QR record is created

### Requirement: Opaque Server-Generated QR Tokens

QR payload generation SHALL be server-side only, and tokens MUST be opaque strings containing no personal data — no guest name, email, phone, table, or any other PII substring (BR-11, BR-17). A token MUST be verifiable by a server endpoint and stable enough to be embedded in an email as-is; email transport itself is out of scope.

#### Scenario: Token carries no PII

- GIVEN QR tokens issued for guests, companions, and emergencies
- WHEN each token is scanned for known PII values (name, email, phone fragments)
- THEN no PII value appears as a substring of any token

#### Scenario: Token is server-verifiable

- GIVEN an issued opaque token
- WHEN it is submitted to the verification endpoint
- THEN the server resolves it to the correct attendee record and validity state

#### Scenario: Client never generates tokens

- GIVEN the Angular client requests QR issuance
- WHEN the request reaches the server
- THEN the token value is generated server-side and returned; the client supplies no token content

### Requirement: Provider-Only Hard Delete with Cascade

Only the `provider` MAY hard-delete an event's data, and only when the event's status is `finished` — regardless of `start`/`end` dates (BR-12). Deletion MUST cascade across all event-scoped entities (guests, companions, photos, check-ins, QRs, approval requests). An `admin` MUST NEVER delete any record through any API path (BR-13).

#### Scenario: Provider deletes a finished event

- GIVEN the caller is the `provider` and the event status is `finished`
- WHEN a delete request is submitted for the event
- THEN the event and all its scoped entity records are removed

#### Scenario: Provider cannot delete an unfinished event

- GIVEN the caller is the `provider` and the event status is not `finished`
- WHEN a delete request is submitted (even if `end` has passed by date)
- THEN the request is rejected and all records remain

#### Scenario: Admin delete attempts are always rejected

- GIVEN the caller is an `admin` of the event
- WHEN they submit a delete request for the event or any of its records
- THEN the server rejects the request
- AND all records remain intact

### Requirement: Admin Soft Toggles

An `admin` SHALL NOT delete records; instead they toggle a per-row `active` flag on guests, companions, photos, and check-ins (BR-13). Toggling MUST be reversible, scoped per individual row, and subject to BR-03 event scoping.

#### Scenario: Admin deactivates a guest

- GIVEN the admin of event A toggles a guest of event A to inactive
- WHEN the guest list is read
- THEN the guest record still exists with `active` false

#### Scenario: Toggle is reversible

- GIVEN an inactive guest row
- WHEN its `active` flag is toggled back on
- THEN the guest returns to its previous active state with all other fields unchanged

#### Scenario: Toggle targets exactly one row

- GIVEN an admin toggles one photo row
- WHEN sibling rows in the same event are read
- THEN their `active` values are unchanged

### Requirement: Retention as Provider-Set Policy

Event `start`/`end` datetimes SHALL define QR validity only (BR-09/BR-14), not data lifetime. The `provider` MAY set a per-event retention value controlling how long the event's data is kept (BR-15); data MAY outlive the event end. Deletion remains gated solely by BR-12 (provider + finished); retention MUST be policy metadata enforced/returned by the API, not an implicit TTL that deletes data in this change.

#### Scenario: Retention does not affect QR validity

- GIVEN an event with a retention value longer than its duration
- WHEN QRs are validated against the event timeline
- THEN validity depends only on the event `end` datetime

#### Scenario: Data outlives event end

- GIVEN an event whose `end` has passed with a retention window still open
- WHEN event data is queried
- THEN all records remain readable per role scope

#### Scenario: Provider sets retention, others cannot

- GIVEN the caller is the `provider`
- WHEN they set a per-event retention value
- THEN it is persisted and returned by the API
- AND an `admin` attempting to change retention is rejected

### Requirement: Image Storage Contract

The database SHALL store only image metadata and an external URL for each photo (BR-16). No image bytes SHALL be written to SQLite. The DB record MUST NOT depend on any specific storage vendor — the URL is an opaque external reference so the storage service can be swapped independently.

#### Scenario: Photo record holds metadata + URL only

- GIVEN a photo is registered in the system
- WHEN its database record is inspected
- THEN it contains metadata fields (state, size, timestamps, author reference) and an external URL
- AND no blob, byte array, or file path into local storage exists on the record

#### Scenario: Storage vendor is swappable

- GIVEN photo records exist with external URLs
- WHEN the storage service behind those URLs is replaced
- THEN no schema change or data migration of photo records is required

### Requirement: Hydration-Safe Client Read Path

The Angular client SHALL load persisted data via HTTP into the `PaseStore` signals AFTER hydration, browser-only (the `afterNextRender` + `isPlatformBrowser` pattern). The prerendered HTML MUST NOT attempt database-backed data resolution at build time, and there MUST be no hydration mismatch (no NG0500/NG0502) caused by data loading. Prisma Client MUST NOT be reachable from the browser bundle.

#### Scenario: Data fetch happens post-hydration

- GIVEN the app is served with a prerendered shell
- WHEN hydration completes in the browser
- THEN data is fetched from the REST API and written into store signals
- AND no DB-backed render occurs during build-time prerendering

#### Scenario: No hydration mismatch

- GIVEN the hydration-safe read path is implemented
- WHEN `ng build` (prerender + SSR) runs and the app loads in a browser
- THEN zero NG0500/NG0502 hydration errors are logged

#### Scenario: Prisma stays server-side

- GIVEN the client and server bundles are built
- WHEN the browser bundle output is inspected
- THEN no Prisma import or query-engine artifact is present

### Requirement: PostgreSQL Provider Verifiability

After the provider switch to PostgreSQL, the system MUST remain verifiable with data distinguishable from SQLite data — via seed markers or known fixtures that make the active provider observable in tests or a verification script (BR-18). Portability guardrails: status fields SHALL be strings (no database enums), and the provider switch SHALL be a schema-literal change plus migration regeneration, not a code rewrite.

#### Scenario: Distinguishable data after switch

- GIVEN the datasource provider has been switched to PostgreSQL and the DB reseeded
- WHEN the verification step (script or test) runs
- THEN seeded records carry markers or fixtures that identify the active provider
- AND the check passes

#### Scenario: No database enums block the switch

- GIVEN the schema defines status fields (event, guest, photo, QR, approval states)
- WHEN the schema is inspected
- THEN all status columns are string-typed, with value validation at the application layer
