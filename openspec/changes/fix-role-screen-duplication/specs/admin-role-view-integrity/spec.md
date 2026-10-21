# Delta for Admin Role View Integrity

## ADDED Requirements

### Requirement: Exactly-One Role View in DOM

The system MUST maintain exactly one role view element (`#view-admin` or `#view-provider`) in the DOM at all times. When switching roles, the system MUST replace the current view rather than stacking additional view elements.

The system MUST claim and hydrate the SSR-rendered role section without node mismatch; no unclaimed SSR subtree SHALL remain in the document after initial hydration completes.

#### Scenario: Initial Load with Default Admin Role

- GIVEN the application loads with the default admin role
- WHEN the page is rendered and hydrated
- THEN exactly one `#view-admin` element exists in the DOM
- AND exactly zero `#view-provider` elements exist in the DOM
- AND no NG0500/NG0502 hydration errors are logged to console

#### Scenario: Admin View Remains Single After Hydration

- GIVEN the admin view is loaded and hydrated
- WHEN hydration completes
- THEN `document.querySelectorAll('#view-admin').length` equals `1`
- AND the SSR section is claimed by Angular (no duplicate stale copy exists)

### Requirement: Role Switch Replaces View Without Stacking

The system MUST replace the role view when the user role changes. Switching from admin to provider MUST remove or replace `#view-admin` and render exactly one `#view-provider`. Switching back to admin MUST replace `#view-provider` with exactly one `#view-admin`.

#### Scenario: Switch from Admin to Provider

- GIVEN the admin role is active with exactly one `#view-admin`
- WHEN the role changes to "Proveedor"
- THEN exactly zero `#view-admin` elements remain in the DOM
- AND exactly one `#view-provider` element exists in the DOM

#### Scenario: Switch from Provider to Admin

- GIVEN the provider role is active with exactly one `#view-provider`
- WHEN the role changes to "Administrador"
- THEN exactly zero `#view-provider` elements remain in the DOM
- AND exactly one `#view-admin` element exists in the DOM
- AND no stacked duplicate `#view-admin` elements appear

#### Scenario: Multiple Role Switches Preserve Single View

- GIVEN the app has loaded with admin role
- WHEN the role switches from admin → provider → admin
- THEN at each step, exactly one role view element exists in the DOM
- AND the view count never increases above one per active role

### Requirement: Semantic Table Markup for Guest Table

The guest table MUST preserve valid HTML table semantics with proper structure (`<table>`, `<thead>`, `<tbody>`, `<tr>`, `<th>`, `<td>`). Row components MUST not create invalid host elements inside `<tbody>` that cause browser HTML parsing to relocate nodes.

The guest table `<thead>` MUST include a visible header with proper column labels and `scope="col"` attributes where applicable.

#### Scenario: Guest Table Has Valid Semantic Structure

- GIVEN the admin view is active and the guests table is rendered
- WHEN inspecting the table DOM structure
- THEN the table contains `<thead>` with column headers
- AND the table contains `<tbody>` with guest rows
- AND each data row is represented by a `<tr>` element
- AND no custom element host nodes appear as direct children of `<tbody>`
- AND no empty custom element host nodes are foster-parented before the table

#### Scenario: Guest Row Expansion Preserves Valid Table Structure

- GIVEN a guest row is rendered in the table
- WHEN the guest detail row is expanded
- THEN the expanded detail is rendered as a valid table row (`<tr>`)
- AND the table structure remains semantically correct
- AND expanding a row does not trigger hydration node mismatches

#### Scenario: Table Headers Maintain Accessibility Semantics

- GIVEN the guest table is rendered
- WHEN examining the table header cells
- THEN header cells use appropriate semantic elements with `scope="col"`
- AND the table structure passes accessibility validation for table semantics

### Requirement: Zero Hydration Errors During Role Rendering

The system MUST complete initial hydration with zero NG05xx errors (specifically NG0500 and NG0502). The SSR-rendered markup and client-rendered markup MUST be parse-identical for role views and for table content inside those views.

#### Scenario: Hydration Completes Without Mismatch Errors

- GIVEN the prerendered page is served to the browser
- WHEN Angular hydrates the application
- THEN no `NG0502` (hydration node mismatch) errors appear in the browser console
- AND no `NG0500` hydration-related errors appear in the browser console
- AND the hydration process completes successfully

#### Scenario: Hydration Error-Free Across Role Transitions

- GIVEN the app is hydrated without errors
- WHEN the user switches roles multiple times
- THEN no new hydration-related console errors are introduced
- AND the DOM remains consistent with Angular's expected structure

### Requirement: Browser Parsing Consistency (No Foster-Parented Hosts)

The browser's HTML parser MUST not relocate component host elements outside the table due to invalid nesting. Component host elements used as table rows MUST be valid table content (i.e., expressed as `<tr>` elements with component selectors applied).

#### Scenario: No Component Hosts Foster-Parented Before Table

- GIVEN the guest table is rendered in the DOM
- WHEN examining siblings immediately preceding the table element
- THEN no `app-guest-row` or `app-guest-detail` host elements appear before the table
- AND all guest row hosts exist as valid children within the table's `<tbody>`
- AND the parsed DOM structure matches the SSR markup structure

#### Scenario: Guest Detail Expansion Does Not Trigger DOM Mismatch

- GIVEN the table is rendered without foster-parented hosts
- WHEN a guest row is expanded to show its detail
- THEN no hydration mismatch is triggered
- AND the DOM structure remains consistent between SSR and CSR parsing
- AND the expansion works correctly without creating duplicate views
