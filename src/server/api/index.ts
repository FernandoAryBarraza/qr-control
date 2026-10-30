import { Router, type NextFunction, type Request, type Response } from 'express';
import { DATA_PROVIDER } from '../data/config';
import { getPrisma } from '../data/prisma-client';
import {
  assignedEventIds,
  createEvent,
  existingAdminIds,
  findEvent,
  listEvents,
} from '../data/repositories/events';
import { createGuest, guestEventId, listGuests, updateGuest } from '../data/repositories/guests';
import { createSecurityMember, listMembers } from '../data/repositories/members';
import { createPhoto, listPhotos, photoEventId, updatePhoto } from '../data/repositories/photos';
import { canCreateEvent, canReadEvent, canWriteObject, resolveEventScope } from './authz';
import { callerContext, callerOf } from './caller-context';
import {
  parseEventInput,
  parseGuestInput,
  parseGuestPatch,
  parseMemberInput,
  parsePhotoInput,
  parsePhotoPatch,
} from './write-validation';

export const apiRouter = Router();

// GET /api/health — dev smoke / passthrough check (design §5). Proves the full chain:
// HTTP -> /api mount -> router -> Prisma client -> SQLite. The raw query is the
// connectivity check; `provider` is the active datasource marker (BR-18 lineage).
// Role-free by design: it stays reachable without a caller context.
apiRouter.get('/health', async (_req, res) => {
  await getPrisma().$queryRaw`SELECT 1`;
  res.json({ status: 'ok', provider: DATA_PROVIDER });
});

/** Express 5 types `req.params` values as `string | string[]`; routes expect a scalar. */
const pathId = (req: Request): string => String(req.params['id'] ?? '');

// Generic 4xx payloads (spec req 3): a rejection never echoes row contents, and an
// out-of-scope row is indistinguishable from a nonexistent one.
const forbidden = (res: Response): void => {
  res.status(403).json({ statusCode: 403, message: 'Forbidden' });
};

const badRequest = (res: Response): void => {
  res.status(400).json({ statusCode: 400, message: 'Bad Request' });
};

// Event-scope guard (BR-03 / design §5): resolves the caller's assignments once and
// rejects out-of-scope reads before any payload is composed. `content` narrows the
// guest/photo routes to provider or the assigned admin; `event` allows any assigned
// role for list/detail. The rejection carries no event data (spec req 3, scenario 2).
function eventAccess(kind: 'event' | 'content') {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const caller = callerOf(res);
    const assigned = await assignedEventIds(caller.userId);
    if (!canReadEvent(caller, kind, pathId(req), assigned)) {
      forbidden(res);
      return;
    }
    next();
  };
}

// Object-scope guard for write routes (BR-04 / S8): the ONE helper that makes
// the object-scope decision for every write route. `resolveEventId` supplies the
// object's owning event — the URL's event id for event-addressed routes, the
// ROW's eventId for row-addressed ones — so a foreign object and a nonexistent
// one both get the same byte-identical 403 and no object can be probed
// (spec req 3). The rejection carries no object data.
function requireObjectScope(resolveEventId: (req: Request) => Promise<string | null>) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const caller = callerOf(res);
    const eventId = await resolveEventId(req);
    const assigned = await assignedEventIds(caller.userId);
    if (!canWriteObject(caller, eventId, assigned)) {
      forbidden(res);
      return;
    }
    next();
  };
}

// Event-addressed writes take the scope from the URL's event id: a foreign id is
// rejected before any row is touched (BR-04).
const eventWriteScope = requireObjectScope(async (req) => pathId(req));

// Row-addressed writes take the scope from the ROW's own event id — never a
// client-supplied one (spec req 3, scenario 3).
const guestRowWriteScope = requireObjectScope(async (req) => guestEventId(pathId(req)));
const photoRowWriteScope = requireObjectScope(async (req) => photoEventId(pathId(req)));

// GET /api/events — provider: all; admin/security: assigned only (BR-03).
apiRouter.get('/events', callerContext, async (req, res) => {
  const caller = callerOf(res);
  const scope = resolveEventScope(caller, await assignedEventIds(caller.userId));
  res.json(await listEvents(scope));
});

// POST /api/events — provider only (BR-02); every event carries at least one admin.
apiRouter.post('/events', callerContext, async (req, res) => {
  const caller = callerOf(res);
  if (!canCreateEvent(caller)) {
    forbidden(res);
    return;
  }

  const parsed = parseEventInput(req.body);
  if (!parsed.ok) {
    badRequest(res);
    return;
  }

  // The payload's `role: 'admin'` is not trusted: the stored role decides.
  const knownAdmins = await existingAdminIds(parsed.value.admins);
  if (knownAdmins.length !== parsed.value.admins.length) {
    badRequest(res);
    return;
  }

  res.status(201).json(await createEvent(parsed.value));
});

// GET /api/events/:id — provider any; admin/security assigned (BR-03).
apiRouter.get('/events/:id', callerContext, eventAccess('event'), async (req, res) => {
  const event = await findEvent(pathId(req));
  if (event === null) {
    res.status(404).json({ statusCode: 404, message: 'Not Found' });
    return;
  }
  res.json(event);
});

// GET /api/events/:id/guests — provider any; assigned admin (design §5).
apiRouter.get('/events/:id/guests', callerContext, eventAccess('content'), async (req, res) => {
  res.json(await listGuests(pathId(req)));
});

// POST /api/events/:id/guests — assigned admin only; the event id comes from the URL.
apiRouter.post('/events/:id/guests', callerContext, eventWriteScope, async (req, res) => {
  const parsed = parseGuestInput(req.body);
  if (!parsed.ok) {
    badRequest(res);
    return;
  }
  res.status(201).json(await createGuest(pathId(req), parsed.value));
});

// PATCH /api/guests/:id — assigned admin only; scope resolves from the ROW's eventId
// (never a client-supplied event id), so a foreign row and an unknown row both get
// the same 403 and no row can be probed (spec req 3, scenario 3).
apiRouter.patch('/guests/:id', callerContext, guestRowWriteScope, async (req, res) => {
  const parsed = parseGuestPatch(req.body);
  if (!parsed.ok) {
    badRequest(res);
    return;
  }
  res.json(await updateGuest(pathId(req), parsed.value));
});

// GET /api/events/:id/photos — provider any; assigned admin (design §5).
apiRouter.get('/events/:id/photos', callerContext, eventAccess('content'), async (req, res) => {
  res.json(await listPhotos(pathId(req)));
});

// POST /api/events/:id/photos — assigned admin only; the event id comes from the
// URL. BR-16: the row stores metadata + an opaque external URL, never image bytes.
apiRouter.post('/events/:id/photos', callerContext, eventWriteScope, async (req, res) => {
  const parsed = parsePhotoInput(req.body);
  if (!parsed.ok) {
    badRequest(res);
    return;
  }
  res.status(201).json(await createPhoto(pathId(req), parsed.value));
});

// PATCH /api/photos/:id — assigned admin only (BR-13: state/active toggle, never
// a delete); scope resolves from the ROW's eventId (spec req 3, scenario 3).
apiRouter.patch('/photos/:id', callerContext, photoRowWriteScope, async (req, res) => {
  const parsed = parsePhotoPatch(req.body);
  if (!parsed.ok) {
    badRequest(res);
    return;
  }
  res.json(await updatePhoto(pathId(req), parsed.value));
});

// GET /api/events/:id/members — provider any; assigned admin (BR-06 / spec req 5,
// scenario 3): the current admins and security staff of the event.
apiRouter.get('/events/:id/members', callerContext, eventAccess('content'), async (req, res) => {
  res.json(await listMembers(pathId(req)));
});

// POST /api/events/:id/members — assigned admin only, `security` role only (BR-06 /
// spec req 5): the provider cannot create lower roles, and a second admin goes
// through the BR-05 approval flow, never this route (design §5: scope + role).
apiRouter.post('/events/:id/members', callerContext, eventWriteScope, async (req, res) => {
  const parsed = parseMemberInput(req.body);
  if (!parsed.ok) {
    badRequest(res);
    return;
  }
  res.status(201).json(await createSecurityMember(pathId(req), parsed.value));
});
