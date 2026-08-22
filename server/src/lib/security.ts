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
export const OTP_TTL_MINUTES = 10;
export const OTP_MAX_ATTEMPTS = 5;

/** Generate a fresh 6-digit OTP (as a zero-padded string). */
export function generateOtp(): string {
  const n = randomBytes(3).readUIntBE(0, 3);
  return String(n % 1_000_000).padStart(OTP_LENGTH, '0');
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
 * the OTP is verified — it lives in `pending_signups` first so a never-verified
 * signup can be re-attempted without "email already exists". Returns the plain
 * OTP so the email body can show it (only its hash is stored).
 */
export async function stagePendingSignup(input: PendingSignupInput): Promise<string> {
  const otp = generateOtp();
  const otpHash = sha256(otp);

  // Replace any earlier unverified attempt for this identity so re-signing-up
  // before verification simply issues a fresh code instead of erroring.
  await query('delete from pending_signups where email = $1 or reg_no = $2', [
    input.email,
    input.regNo,
  ]);
  await query(
    `insert into pending_signups
       (reg_no, full_name, email, phone, department, level, password_hash, otp_hash, attempts, expires_at, class_id, last_otp_sent_at)
     values ($1, $2, $3, $4, $5, $6, $7, $8, 0, now() + make_interval(mins => $9), $10, now())`,
    [
      input.regNo,
      input.fullName,
      input.email,
      input.phone,
      input.department,
      input.level,
      input.passwordHash,
      otpHash,
      OTP_TTL_MINUTES,
      input.classId,
    ],
  );
  return otp;
}

export type ReissueResult =
  | { ok: true; otp: string; email: string }
  | { ok: false; cooldown: number }  // seconds remaining
  | null;                             // no pending signup

/** Re-issue an OTP for an existing pending signup. Resets the attempt counter. */
export async function reissuePendingOtp(
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

  // Enforce cooldown — reject if last OTP was sent less than 60s ago.
  if (row.last_otp_sent_at) {
    const elapsed = (Date.now() - new Date(row.last_otp_sent_at).getTime()) / 1000;
    if (elapsed < COOLDOWN_SECONDS) {
      return { ok: false, cooldown: Math.ceil(COOLDOWN_SECONDS - elapsed) };
    }
  }

  const otp = generateOtp();
  const otpHash = sha256(otp);
  await query(
    `update pending_signups
        set otp_hash = $1, attempts = 0,
            expires_at = now() + make_interval(mins => $2),
            last_otp_sent_at = now()
      where id = $3`,
    [otpHash, OTP_TTL_MINUTES, row.id],
  );
  return { ok: true, otp, email: row.email as string };
}

/**
 * Verify an OTP against a pending signup and, on success, promote the staged
 * account into a real `students` row with email_verified = true.
 * Wrong guesses increment `attempts`; past the cap the code is dead and a fresh
 * one must be requested. Returns the student id.
 */
export async function consumePendingSignupOtp(
  emailOrRegNo: string,
  otp: string,
): Promise<string> {
  const res = await query(
    `select * from pending_signups
      where (email = $1 or reg_no = $1) and used_at is null
      limit 1`,
    [emailOrRegNo],
  );
  if (res.rowCount === 0) {
    throw new HttpError(400, 'No pending signup found. Please sign up first.');
  }
  const p = res.rows[0];

  if (new Date(p.expires_at) <= new Date()) {
    throw new HttpError(400, 'This code has expired. Request a new one.');
  }

  const attempts = Number(p.attempts ?? 0);
  if (attempts >= OTP_MAX_ATTEMPTS) {
    throw new HttpError(400, 'Too many wrong attempts. Request a new code.');
  }

  const otpHash = sha256(otp);
  if (p.otp_hash !== otpHash) {
    await query('update pending_signups set attempts = $1 where id = $2', [
      attempts + 1,
      p.id,
    ]);
    const left = OTP_MAX_ATTEMPTS - attempts - 1;
    throw new HttpError(
      400,
      left <= 0
        ? 'Too many wrong attempts. Request a new code.'
        : `Incorrect code. ${left} attempt${left === 1 ? '' : 's'} left.`,
    );
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

