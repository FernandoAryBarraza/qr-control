// Event-scope type shared by authz decisions (api) and repositories (data).
// Keeping it in the data layer avoids repositories importing from the api layer
// (design §4), while authz can still re-export it for its call sites.
/** `'all'` means every event (provider); otherwise the caller's assigned event IDs. */
export type EventScope = 'all' | readonly string[];
