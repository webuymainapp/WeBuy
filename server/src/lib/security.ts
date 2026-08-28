// Server-side password hashing (bcrypt) and email-verification OTP codes.
import bcrypt from 'bcryptjs';
import { createHash, randomBytes } from 'node:crypto';
import { query } from '../db/pool';
import { HttpError } from './http';

const BCRYPT_ROUNDS = 10;

export function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, BCRYPT_ROUNDS);
}

export function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

export const OTP_LENGTH = 6;
export const OTP_TTL_MINUTES = 24 * 60; // 24h for emailed links
export const OTP_MAX_ATTEMPTS = 5;

/** Generate a fresh 6-digit OTP (as a zero-padded string). */
export function generateOtp(): string {
  const n = randomBytes(3).readUIntBE(0, 3);
  return String(n % 1_000_000).padStart(OTP_LENGTH, '0');
}

/** Generate a high-entropy one-time token (hex). Only its hash is ever stored. */
export function generateToken(): string {
  return randomBytes(32).toString('hex');
}

export function hashToken(token: string): string {
  return sha256(token);
}

export interface PendingSignupInput {
  regNo: string;
  fullName: string;
  email: string;
  phone: string | null;
  department: string;
  level: string;
  passwordHash: string;
  classId: string | null;
}

/**
 * Stage an unverified signup. The email is NOT inserted into `students` until
 * the emailed verification link is followed — it lives in `pending_signups`
 * first so a never-verified signup can be re-attempted without "email already
 * exists". Returns the plain one-time token so the email body can link to it
 * (only its hash is stored).
 */
export async function stagePendingSignup(input: PendingSignupInput): Promise<string> {
  const token = generateToken();
  const tokenHash = hashToken(token);

  // Replace any earlier unverified attempt for this identity so re-signing-up
  // before verification simply issues a fresh token instead of erroring.
  await query('delete from pending_signups where email = $1 or reg_no = $2', [
    input.email,
    input.regNo,
  ]);
  await query(
    `insert into pending_signups
       (reg_no, full_name, email, phone, department, level, password_hash, token_hash, attempts, expires_at, class_id, last_otp_sent_at)
     values ($1, $2, $3, $4, $5, $6, $7, $8, 0, now() + make_interval(mins => $9), $10, now())`,
    [
      input.regNo,
      input.fullName,
      input.email,
      input.phone,
      input.department,
      input.level,
      input.passwordHash,
      tokenHash,
      OTP_TTL_MINUTES,
      input.classId,
    ],
  );
  return token;
}

export type ReissueResult =
  | { ok: true; token: string; email: string }
  | { ok: false; cooldown: number }  // seconds remaining
  | null;                             // no pending signup

/** Re-issue a verification token for an existing pending signup. Resets expiry. */
export async function reissuePendingToken(
  emailOrRegNo: string,
): Promise<ReissueResult> {
  const COOLDOWN_SECONDS = 60;
  const res = await query(
    `select id, email, last_otp_sent_at
       from pending_signups
      where (email = $1 or reg_no = $1) and used_at is null limit 1`,
    [emailOrRegNo],
  );
  if (res.rowCount === 0) return null;
  const row = res.rows[0];

  // Enforce cooldown — reject if the last link email was sent less than 60s ago.
  if (row.last_otp_sent_at) {
    const elapsed = (Date.now() - new Date(row.last_otp_sent_at).getTime()) / 1000;
    if (elapsed < COOLDOWN_SECONDS) {
      return { ok: false, cooldown: Math.ceil(COOLDOWN_SECONDS - elapsed) };
    }
  }

  const token = generateToken();
  const tokenHash = hashToken(token);
  await query(
    `update pending_signups
        set token_hash = $1, attempts = 0,
            expires_at = now() + make_interval(mins => $2),
            last_otp_sent_at = now()
      where id = $3`,
    [tokenHash, OTP_TTL_MINUTES, row.id],
  );
  return { ok: true, token, email: row.email as string };
}

/**
 * Verify a one-time email verification token against a pending signup and, on
 * success, promote the staged account into a real `students` row with
 * email_verified = true. The token is single-use and expiring. Returns the
 * student id.
 */
export async function consumePendingSignupToken(token: string): Promise<string> {
  const tokenHash = hashToken(token);
  const res = await query(
    `select * from pending_signups
      where token_hash = $1
      limit 1`,
    [tokenHash],
  );
  if (res.rowCount === 0) {
    throw new HttpError(400, 'This verification link is invalid. Please sign up again.');
  }
  const p = res.rows[0];

  if (new Date(p.expires_at) <= new Date()) {
    throw new HttpError(400, 'This verification link has expired. Please request a new one.');
  }

  if (p.used_at) {
    throw new HttpError(400, 'This verification link has already been used. Please sign in.');
  }

  // Guard against a race where the email/reg_no got taken by a verified
  // account between signup and verification. If the account already exists and
  // IS verified, the code is no longer needed — report success so a re-attempt
  // (or double-verify) never errors.
  const clash = await query(
    'select id, email_verified from students where reg_no = $1 or email = $2 limit 1',
    [p.reg_no, p.email],
  );
  if (clash.rowCount && clash.rowCount > 0) {
    if (clash.rows[0].email_verified) {
      await query('update pending_signups set used_at = now() where id = $1', [p.id]);
      return clash.rows[0].id as string;
    }
    throw new HttpError(409, 'This email or registration number is already registered. Please sign in.');
  }

  const inserted = await query<{ id: string }>(
    `insert into students
       (reg_no, full_name, email, phone, department, level, password_hash, role, email_verified, class_id)
     values ($1, $2, $3, $4, $5, $6, $7, 'student', true, $8)
     returning id`,
    [
      p.reg_no,
      p.full_name,
      p.email,
      p.phone,
      p.department,
      p.level,
      p.password_hash,
      p.class_id ?? null,
    ],
  );
  await query('update pending_signups set used_at = now() where id = $1', [p.id]);
  return inserted.rows[0].id;
}

