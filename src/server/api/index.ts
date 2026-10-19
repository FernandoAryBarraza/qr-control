import { Router, type NextFunction, type Request, type Response } from 'express';
import { DATA_PROVIDER } from '../data/config';
import { getPrisma } from '../data/prisma-client';
import { assignedEventIds, findEvent, listEvents } from '../data/repositories/events';
import { listGuests } from '../data/repositories/guests';
import { listPhotos } from '../data/repositories/photos';
import { canReadEvent, resolveEventScope } from './authz';
import { callerContext, callerOf } from './caller-context';

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

// Event-scope guard (BR-03 / design §5): resolves the caller's assignments once and
// rejects out-of-scope reads before any payload is composed. `content` narrows the
// guest/photo routes to provider or the assigned admin; `event` allows any assigned
// role for list/detail. The rejection carries no event data (spec req 3, scenario 2).
function eventAccess(kind: 'event' | 'content') {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const caller = callerOf(res);
    const assigned = await assignedEventIds(caller.userId);
    if (!canReadEvent(caller, kind, pathId(req), assigned)) {
      res.status(403).json({ statusCode: 403, message: 'Forbidden' });
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

// GET /api/events/:id/photos — provider any; assigned admin (design §5).
apiRouter.get('/events/:id/photos', callerContext, eventAccess('content'), async (req, res) => {
  res.json(await listPhotos(pathId(req)));
});
