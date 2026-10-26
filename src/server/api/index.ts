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
import { listPhotos } from '../data/repositories/photos';
import { canCreateEvent, canReadEvent, canWriteEvent, resolveEventScope } from './authz';
import { callerContext, callerOf } from './caller-context';
import { parseEventInput, parseGuestInput, parseGuestPatch } from './write-validation';

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

// Write scope guard for event-addressed routes (BR-04): the scope comes from the
// URL's event id, so a foreign id is rejected before any row is touched.
function writeAccess() {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const caller = callerOf(res);
    const assigned = await assignedEventIds(caller.userId);
    if (!canWriteEvent(caller, pathId(req), assigned)) {
      forbidden(res);
      return;
    }
    next();
  };
}

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
apiRouter.post('/events/:id/guests', callerContext, writeAccess(), async (req, res) => {
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
apiRouter.patch('/guests/:id', callerContext, async (req, res) => {
  const caller = callerOf(res);
  const eventId = await guestEventId(pathId(req));
  const assigned = await assignedEventIds(caller.userId);
  if (eventId === null || !canWriteEvent(caller, eventId, assigned)) {
    forbidden(res);
    return;
  }

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
