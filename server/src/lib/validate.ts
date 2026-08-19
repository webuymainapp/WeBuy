// Request body validation with zod. Rejects before any DB/processing happens.
import { ZodSchema, z } from 'zod';
import type { Request, Response, NextFunction } from 'express';
import { HttpError } from './http';

export function validateBody<T extends ZodSchema>(schema: T) {
  return (req: Request, _res: Response, next: NextFunction) => {
    const parsed = schema.safeParse(req.body ?? {});
    if (!parsed.success) {
      const issues = parsed.error.issues
        .map((i) => `${i.path.join('.')}: ${i.message}`)
        .join('; ');
      return next(new HttpError(400, `Invalid request: ${issues}`));
    }
    req.body = parsed.data;
    next();
  };
}

/** Register numbers like "CSC-301-001", "BCH/2023/001", "21/SCI/0001". */
export const regNoSchema = z
  .string()
  .trim()
  .min(3)
  .max(40)
  .regex(/^[a-z0-9/.\-\s]+$/i, 'reg_no contains invalid characters');

export const emailSchema = z.string().trim().toLowerCase().email();

export const passwordSchema = z
  .string()
  .min(8, 'password must be at least 8 characters')
  .max(72);

/** Class invite codes — what a student types at signup to join their class. */
export const inviteCodeSchema = z
  .string()
  .trim()
  .min(1, 'invite code is required')
  .max(40)
  .regex(/^[a-z0-9-]+$/i, 'invite code contains invalid characters');
