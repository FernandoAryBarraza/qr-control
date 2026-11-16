import type { NextFunction, Request, Response } from 'express';
import { getPrisma } from '../data/prisma-client';
import { isCallerRole, type CallerContext } from './authz';

// Caller-context extractor (design §2): the only place that knows how identity is
// supplied. Today it trusts the `x-user-id` header (no authentication in this change)
// and reads the ROLE FROM THE DATABASE — a client-supplied role is never consulted.
// Replacing this with JWT/session leaves every authz call site untouched.
export async function resolveCallerContext(id: string | undefined): Promise<CallerContext | null> {
  if (!id) return null;
  const user = await getPrisma().user.findUnique({ where: { id }, select: { role: true } });
  return user !== null && isCallerRole(user.role) ? { userId: id, role: user.role } : null;
}

export async function callerContext(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const caller = await resolveCallerContext(req.header('x-user-id'));
  if (caller === null) {
    res.status(401).json({ statusCode: 401, message: 'Unauthorized' });
    return;
  }
  res.locals['caller'] = caller;
  next();
}

/** Read the context set by `callerContext`; throws if a route was mounted without it. */
export function callerOf(res: Response): CallerContext {
  const caller = res.locals['caller'] as CallerContext | undefined;
  if (caller === undefined) throw new Error('callerContext middleware is required for this route');
  return caller;
}
