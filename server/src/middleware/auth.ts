import type { Request, Response, NextFunction } from 'express';
import { verifyAuthToken, type AuthTokenPayload } from '../lib/jwt';
import { HttpError } from '../lib/http';
import { query } from '../db/pool';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      student: AuthTokenPayload;
    }
  }
}

export async function requireAuth(req: Request, _res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    return next(new HttpError(401, 'Missing bearer token'));
  }
  let payload: AuthTokenPayload;
  try {
    payload = verifyAuthToken(header.slice('Bearer '.length));
  } catch {
    return next(new HttpError(401, 'Invalid or expired token'));
  }

  // Single-session enforcement: the token's session id must match the student's
  // current active session in the DB. If they signed in elsewhere (new session
  // token), this request is rejected — the older browser is signed out.
  try {
    const row = await query('select session_token from students where id = $1', [
      payload.sub,
    ]);
    if (row.rowCount === 0) {
      return next(new HttpError(401, 'Account not found'));
    }
    if ((row.rows[0].session_token as string | null) !== payload.sess) {
      return next(new HttpError(401, 'Signed in on another device. Please sign in again.'));
    }
    req.student = payload;
    next();
  } catch (err) {
    next(err);
  }
}

export function requireClassRep(
  req: Request,
  _res: Response,
  next: NextFunction,
) {
  if (req.student?.role !== 'class_rep' && req.student?.role !== 'chief_admin') {
    return next(new HttpError(403, 'Class rep access required'));
  }
  next();
}

export function requireChiefAdmin(
  req: Request,
  _res: Response,
  next: NextFunction,
) {
  if (req.student?.role !== 'chief_admin') {
    return next(new HttpError(403, 'Chief admin access required'));
  }
  next();
}
