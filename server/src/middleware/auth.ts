import type { Request, Response, NextFunction } from 'express';
import { verifyAuthToken, type AuthTokenPayload } from '../lib/jwt';
import { HttpError } from '../lib/http';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      student: AuthTokenPayload;
    }
  }
}

export function requireAuth(req: Request, _res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    return next(new HttpError(401, 'Missing bearer token'));
  }
  try {
    req.student = verifyAuthToken(header.slice('Bearer '.length));
    next();
  } catch {
    next(new HttpError(401, 'Invalid or expired token'));
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
