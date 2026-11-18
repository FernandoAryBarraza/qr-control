import { Router, type NextFunction, type Request, type Response } from 'express';
import { DATA_PROVIDER } from '../data/config';
import { getPrisma } from '../data/prisma-client';
import {
  createAdminRequest,
  decideAdminRequest,
  findAdminRequest,
  listAdminRequests,
} from '../data/repositories/admin-requests';
import {
  assignedEventIds,
  createEvent,
  existingAdminIds,
  findEvent,
  listEvents,
  purgeEvent,
  updateEventPolicy,
} from '../data/repositories/events';
import { createGuest, guestEventId, listGuests, updateGuest } from '../data/repositories/guests';
import { createSecurityMember, listMembers } from '../data/repositories/members';
import { createPhoto, listPhotos, photoEventId, updatePhoto } from '../data/repositories/photos';
import { issueQr } from '../data/repositories/qr';
import { verifyQrByToken } from '../data/repositories/qr-verify';
import { checkInByToken, qrEventIdByToken } from '../data/repositories/check-ins';
import {
  canCheckIn,
  canCreateEvent,
  canDecideAdminRequest,
  canPurgeEvent,
  canReadEvent,
  canReadQrImage,
  canUpdateEventPolicy,
  canVerifyQr,
  canWriteObject,
  resolveEventScope,
} from './authz';
import { callerContext, callerOf } from './caller-context';
import { renderQrPng } from './qr-image';
import {
  parseAdminRequestInput,
  parseAdminRequestPatch,
  parseCheckInInput,
  parseEventInput,
  parseEventPatch,
  parseGuestInput,
  parseGuestPatch,
  parseMemberInput,
  parsePhotoInput,
  parsePhotoPatch,
  parseQrIssueInput,
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
const pathToken = (req: Request): string => String(req.params['token'] ?? '');

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

// POST /api/check-ins — the token in the BODY resolves the owning event, so this
// guard cannot be event-addressed: parse first (malformed -> 400), look the token
// up, then authorize the assigned admin/security of that event (design §5). An
// unknown token and a foreign-event token get the same byte-identical 403, so a
// token can never be probed (spec req 3).
const checkInScope = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  const parsed = parseCheckInInput(req.body);
  if (!parsed.ok) {
    badRequest(res);
    return;
  }
  const caller = callerOf(res);
  const eventId = await qrEventIdByToken(parsed.value.token);
  const assigned = await assignedEventIds(caller.userId);
  if (!canCheckIn(caller, eventId, assigned)) {
    forbidden(res);
    return;
  }
  next();
};

// GET /api/qr/verify/:token — the token in the PATH resolves the owning event, so
// this guard cannot be event-addressed: look the token up, then authorize the
// assigned admin/security of THAT event (design §5). An unknown token and a
// foreign-event token get the same byte-identical 403, so a token can never be
// probed (spec req 3).
const qrVerifyScope = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  const caller = callerOf(res);
  const eventId = await qrEventIdByToken(pathToken(req));
  const assigned = await assignedEventIds(caller.userId);
  if (!canVerifyQr(caller, eventId, assigned)) {
    forbidden(res);
    return;
  }
  next();
};

// GET /api/qr/image/:token — the server-rendered PNG of the QR (design §6). The
// image is an ADMIN-level artifact (the printable QR of a party), so the role half
// admits the event's admin only — scoped to the token's own event.
const qrImageScope = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  const caller = callerOf(res);
  const eventId = await qrEventIdByToken(pathToken(req));
  const assigned = await assignedEventIds(caller.userId);
  if (!canReadQrImage(caller, eventId, assigned)) {
    forbidden(res);
    return;
  }
  next();
};

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

// PATCH /api/events/:id — provider-only POLICY write (design §5 / BR-14, BR-15):
// retention and lifecycle status are the two provider-owned event fields, and the
// ROLE check runs before the payload so an admin gets the same refusal whether the
// body is valid or not (spec req 3 — no validation oracle). Content writes stay
// with the event's own admin; only the provider sets the policy.
apiRouter.patch('/events/:id', callerContext, async (req, res) => {
  const caller = callerOf(res);
  if (!canUpdateEventPolicy(caller)) {
    forbidden(res);
    return;
  }
  const parsed = parseEventPatch(req.body);
  if (!parsed.ok) {
    badRequest(res);
    return;
  }
  const updated = await updateEventPolicy(pathId(req), parsed.value);
  if (updated === null) {
    res.status(404).json({ statusCode: 404, message: 'Not Found' });
    return;
  }
  res.json(updated);
});

// DELETE /api/events/:id — provider purge (BR-12 / spec req 11). The role gate
// runs BEFORE the state lookup, so admin/security get the same 403 whether the
// event exists or not; the finished check lives in the delete predicate itself
// (see purgeEvent). cascade removes only event-scoped rows, never User rows;
// there is no body because nothing survives to return.
apiRouter.delete('/events/:id', callerContext, async (req, res) => {
  const caller = callerOf(res);
  if (!canPurgeEvent(caller)) {
    forbidden(res);
    return;
  }
  const outcome = await purgeEvent(pathId(req));
  if (outcome === 'not_found') {
    res.status(404).json({ statusCode: 404, message: 'Not Found' });
    return;
  }
  if (outcome === 'not_finished') {
    badRequest(res);
    return;
  }
  res.status(204).end();
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

// GET /api/events/:id/admin-requests — provider any; assigned admin (design §5
// matrix, same read guard as members). BR-05's workflow record stays queryable
// for the parties that manage it (spec req 4, scenario 3).
apiRouter.get(
  '/events/:id/admin-requests',
  callerContext,
  eventAccess('content'),
  async (req, res) => {
    res.json(await listAdminRequests(pathId(req)));
  },
);

// POST /api/events/:id/admin-requests — assigned admin only, scope + role via
// the S8 guard (design §5 / BR-05): creates the candidate as an unassigned
// admin user with a pending request; pending grants no scoped access until the
// provider approves (spec req 4, scenario 1).
apiRouter.post('/events/:id/admin-requests', callerContext, eventWriteScope, async (req, res) => {
  const parsed = parseAdminRequestInput(req.body);
  if (!parsed.ok) {
    badRequest(res);
    return;
  }
  const caller = callerOf(res);
  res.status(201).json(await createAdminRequest(pathId(req), caller.userId, parsed.value));
});

// PATCH /api/admin-requests/:id — provider only (design §5): the caller-role
// check refuses the event's admin self-approval BEFORE the row is read (spec
// req 4, scenario 4 — no row probing), `pending` is not a decision, and a
// decided request is terminal (scenario 3: rejection/approval never flips).
apiRouter.patch('/admin-requests/:id', callerContext, async (req, res) => {
  const caller = callerOf(res);
  if (!canDecideAdminRequest(caller)) {
    forbidden(res);
    return;
  }
  const parsed = parseAdminRequestPatch(req.body);
  if (!parsed.ok || parsed.value.status === 'pending') {
    badRequest(res);
    return;
  }
  const decided = await decideAdminRequest(pathId(req), parsed.value.status);
  if (decided === null) {
    if ((await findAdminRequest(pathId(req))) === null) {
      res.status(404).json({ statusCode: 404, message: 'Not Found' });
      return;
    }
    badRequest(res); // already decided — terminal (spec req 4, scenario 3)
    return;
  }
  res.json(decided);
});

// POST /api/events/:id/qr — assigned admin only, event scope (design §5 / BR-07):
// issues ONE attendee QR per call — a guest, a companion linked to the parent guest
// QR, or a standalone emergency QR for the own event (BR-10). The raw token is
// returned exactly once (never cached) and only its SHA-256 is stored (req 10 /
// BR-11, BR-17). A missing or foreign attendee gets the same 403-equivalent
// rejection as every object-scoped route (spec req 3, scenario 3); an already
// issued attendee or a missing parent QR is a 400 state conflict.
apiRouter.post('/events/:id/qr', callerContext, eventWriteScope, async (req, res) => {
  const parsed = parseQrIssueInput(req.body);
  if (!parsed.ok) {
    badRequest(res);
    return;
  }
  const outcome = await issueQr(pathId(req), parsed.value);
  if (!outcome.ok) {
    if (outcome.reason === 'forbidden') {
      forbidden(res);
      return;
    }
    badRequest(res);
    return;
  }
  res.set('Cache-Control', 'no-store');
  res.status(201).json(outcome.issued);
});

// POST /api/check-ins — single-use scan (spec req 7 / BR-08) with expiry at the
// owning event's end (req 8 / BR-09). The guard already proved the caller is the
// event's assigned admin or security. A reused token is a 409, an expired one a
// 410 (both after scope, so they leak nothing to an unassigned caller), and the
// check-in record is built from the token lookup, never from the body (S8).
apiRouter.post('/check-ins', callerContext, checkInScope, async (req, res) => {
  const parsed = parseCheckInInput(req.body);
  if (!parsed.ok) {
    badRequest(res);
    return;
  }
  const outcome = await checkInByToken(parsed.value.token);
  if (!outcome.ok) {
    if (outcome.reason === 'already_used') {
      res.status(409).json({ statusCode: 409, message: 'Conflict' });
      return;
    }
    if (outcome.reason === 'expired') {
      res.status(410).json({ statusCode: 410, message: 'Gone' });
      return;
    }
    // The token was not found at all: same generic denial as the guard, never a
    // distinct status. (A token that vanishes AFTER the repository's own read is
    // reported as already-used — the claim cannot tell a deleted row from a
    // consumed one, and neither records a check-in.)
    forbidden(res);
    return;
  }
  res.set('Cache-Control', 'no-store');
  res.status(201).json(outcome.value);
});

// GET /api/qr/verify/:token — resolves an issued token to the attendee it
// identifies and to the QR's validity state (spec req 6, scenario 2 / BR-07; req 10,
// scenario 2 / BR-11). The guard already proved the caller is the event's assigned
// admin or security. The attendee comes from the token lookup, never from the
// request (S8); a token that resolves to no row gets the same generic denial as a
// foreign one.
apiRouter.get('/qr/verify/:token', callerContext, qrVerifyScope, async (req, res) => {
  const verification = await verifyQrByToken(pathToken(req));
  if (verification === null) {
    forbidden(res);
    return;
  }
  // The response carries attendee names and the QR state: it must never be cached.
  res.set('Cache-Control', 'no-store');
  res.json(verification);
});

// GET /api/qr/image/:token — the server-rendered PNG of the QR (design §6): the
// payload is the absolute verify URL. `no-store` because the encoded image carries
// the raw token — a cached copy would outlive the QR it represents.
apiRouter.get('/qr/image/:token', callerContext, qrImageScope, async (req, res) => {
  const png = await renderQrPng(pathToken(req));
  res.set('Cache-Control', 'no-store');
  res.set('Content-Type', 'image/png');
  res.send(png);
});
