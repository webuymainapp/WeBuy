import { Router } from 'express';
import { z } from 'zod';
import { query } from '../db/pool';
import { asyncHandler, HttpError } from '../lib/http';
import { validateBody, regNoSchema, emailSchema, passwordSchema, inviteCodeSchema } from '../lib/validate';
import {
  hashPassword,
  verifyPassword,
  stagePendingSignup,
  reissuePendingOtp,
  consumePendingSignupOtp,
} from '../lib/security';
import { signAuthToken } from '../lib/jwt';
import { enqueueVerificationEmail } from '../lib/mail';
import { requireAuth } from '../middleware/auth';
import { rateLimit } from '../lib/rateLimit';

const router = Router();

const authLimiter = rateLimit({ windowMs: 60_000, max: 10 });
const verificationLimiter = rateLimit({ windowMs: 60_000, max: 5 });

const signupSchema = z.object({
  regNo: regNoSchema,
  fullName: z.string().trim().min(2).max(120),
  email: emailSchema,
  phone: z.string().trim().min(10).max(20),
  department: z.string().trim().min(2).max(120),
  level: z.string().trim().min(1).max(40),
  password: passwordSchema,
  // Required: the invite code joins the student to their class.
  inviteCode: inviteCodeSchema,
  // NOTE: no role field here. Public signups are ALWAYS students.
  // Course reps are seeded directly into the DB (see server/seed.sql).
});

router.post(
  '/signup',
  authLimiter,
  validateBody(signupSchema),
  asyncHandler(async (req, res) => {
    const { regNo, fullName, email, phone, department, level, password, inviteCode } =
      req.body;

    // Resolve the invite code to a class — every student must belong to one.
    const cls = await query(
      'select id, name from classes where invite_code = $1',
      [inviteCode],
    );
    if (cls.rowCount === 0) {
      throw new HttpError(400, 'That class invite code is not valid. Check it with your class chief and try again.');
    }
    const classId = cls.rows[0].id as string;

    // An email/reg_no only counts as "taken" once it belongs to a real (i.e.
    // verified) student. A staged-but-unverified signup is not an account, so
    // re-signing-up before verification is allowed and simply re-sends a link.
    const dup = await query(
      'select id from students where reg_no = $1 or email = $2 limit 1',
      [regNo, email],
    );
    if (dup.rowCount) {
      throw new HttpError(409, 'Registration number or email already exists');
    }

    const passwordHash = await hashPassword(password);
    // Store the signup WITHOUT touching `students`. It gets promoted into
    // `students` only when the emailed 6-digit code is verified.
    const otp = await stagePendingSignup({
      regNo,
      fullName,
      email,
      phone: phone ?? null,
      department,
      level,
      passwordHash,
      classId,
    });
    // Queue the OTP email for the frontend mail sender. Sending is best-effort
    // — the user can always request another code later.
    await enqueueVerificationEmail(email, otp).catch(() => undefined);

    res.status(201).json({
      email,
      student: {
        id: null,
        regNo,
        fullName,
        email,
        phone: phone ?? null,
        department,
        level,
        role: 'student',
        emailVerified: false,
      },
    });
  }),
);

const signinSchema = z.object({
  emailOrRegNo: z.string().trim().min(2),
  password: z.string(),
});

router.post(
  '/signin',
  authLimiter,
  validateBody(signinSchema),
  asyncHandler(async (req, res) => {
    const { emailOrRegNo, password } = req.body;
    const value = emailOrRegNo.toLowerCase();

    const result = await query(
      `select id, reg_no, full_name, email, phone, department, level,
              password_hash, role, email_verified, avatar_url, created_at
         from students
        where email = $1 or lower(reg_no) = $1
        limit 1`,
      [value],
    );
    if (result.rowCount === 0) {
      throw new HttpError(401, 'Invalid credentials');
    }
    const row = result.rows[0];
    const ok = await verifyPassword(password, row.password_hash);
    if (!ok) {
      throw new HttpError(401, 'Invalid credentials');
    }
    if (!row.email_verified) {
      throw new HttpError(
        403,
        'Please verify your email first. Use the verification code sent to your inbox.',
      );
    }

    const token = signAuthToken({
      sub: row.id,
      role: row.role,
      reg_no: row.reg_no,
    });

    res.json({
      token,
      student: {
        id: row.id,
        regNo: row.reg_no,
        fullName: row.full_name,
        email: row.email,
        phone: row.phone,
        department: row.department,
        level: row.level,
        role: row.role,
        emailVerified: row.email_verified,
        avatarUrl: row.avatar_url,
        createdAt: row.created_at,
      },
    });
  }),
);

router.get(
  '/me',
  requireAuth,
  asyncHandler(async (req, res) => {
    const result = await query(
      `select id, reg_no, full_name, email, phone, department, level,
              role, email_verified, avatar_url, created_at
         from students where id = $1`,
      [req.student.sub],
    );
    if (result.rowCount === 0) {
      throw new HttpError(404, 'Account not found');
    }
    const r = result.rows[0];
    res.json({
      student: {
        id: r.id,
        regNo: r.reg_no,
        fullName: r.full_name,
        email: r.email,
        phone: r.phone,
        department: r.department,
        level: r.level,
        role: r.role,
        emailVerified: r.email_verified,
        avatarUrl: r.avatar_url,
        createdAt: r.created_at,
      },
    });
  }),
);

const otpSchema = z.object({
  emailOrRegNo: z.string().trim().min(2).max(120),
  otp: z.string().trim().length(6),
});

/** Resend a signup verification code (no login required). Never reveals if the
 *  signup exists — a "sent" response is given either way. */
router.post(
  '/resend-otp',
  verificationLimiter,
  validateBody(z.object({ emailOrRegNo: z.string().trim().min(2).max(120) })),
  asyncHandler(async (req, res) => {
    const value = req.body.emailOrRegNo.toLowerCase();
    const result = await reissuePendingOtp(value);
    if (result && result.ok) {
      await enqueueVerificationEmail(result.email, result.otp).catch(() => undefined);
      res.json({ ok: true, sent: true, email: result.email });
      return;
    }
    if (result && !result.ok) {
      res.json({ ok: true, sent: false, cooldown: result.cooldown });
      return;
    }
    res.json({ ok: true, sent: false });
  }),
);

/** Verify the emailed 6-digit code and activate the pending signup. On success
 *  the account is promoted into `students` (email_verified = true) and an auth
 *  token is issued so the student lands straight in the portal. */
router.post(
  '/verify-otp',
  verificationLimiter,
  validateBody(otpSchema),
  asyncHandler(async (req, res) => {
    const { emailOrRegNo, otp } = req.body;
    const studentId = await consumePendingSignupOtp(emailOrRegNo.toLowerCase(), otp);

    const result = await query(
      `select id, reg_no, full_name, email, phone, department, level,
              password_hash, role, email_verified, avatar_url, created_at
         from students where id = $1`,
      [studentId],
    );
    if (result.rowCount === 0) {
      throw new HttpError(404, 'Account not found');
    }
    const row = result.rows[0];

    const token = signAuthToken({
      sub: row.id,
      role: row.role,
      reg_no: row.reg_no,
    });

    res.json({
      token,
      student: {
        id: row.id,
        regNo: row.reg_no,
        fullName: row.full_name,
        email: row.email,
        phone: row.phone,
        department: row.department,
        level: row.level,
        role: row.role,
        emailVerified: row.email_verified,
        avatarUrl: row.avatar_url,
        createdAt: row.created_at,
      },
    });
  }),
);

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: passwordSchema,
});

router.post(
  '/change-password',
  requireAuth,
  validateBody(changePasswordSchema),
  asyncHandler(async (req, res) => {
    const { currentPassword, newPassword } = req.body;

    const result = await query(
      'select password_hash from students where id = $1',
      [req.student.sub],
    );
    if (result.rowCount === 0) {
      throw new HttpError(404, 'Account not found');
    }
    const ok = await verifyPassword(currentPassword, result.rows[0].password_hash);
    if (!ok) {
      throw new HttpError(400, 'Current password is incorrect');
    }

    const passwordHash = await hashPassword(newPassword);
    await query('update students set password_hash = $1 where id = $2', [
      passwordHash,
      req.student.sub,
    ]);
    res.json({ ok: true });
  }),
);

const updateMeSchema = z.object({
  fullName: z.string().trim().min(2).max(120).optional(),
});

router.patch(
  '/me',
  requireAuth,
  validateBody(updateMeSchema),
  asyncHandler(async (req, res) => {
    const { fullName } = req.body;
    const result = await query(
      `update students
          set full_name = coalesce($1, full_name)
        where id = $2
        returning id, reg_no, full_name, email, phone, department, level,
                  role, email_verified, avatar_url, created_at`,
      [fullName ?? null, req.student.sub],
    );
    if (result.rowCount === 0) {
      throw new HttpError(404, 'Account not found');
    }
    const r = result.rows[0];
    res.json({
      student: {
        id: r.id,
        regNo: r.reg_no,
        fullName: r.full_name,
        email: r.email,
        phone: r.phone,
        department: r.department,
        level: r.level,
        role: r.role,
        emailVerified: r.email_verified,
        avatarUrl: r.avatar_url,
        createdAt: r.created_at,
      },
    });
  }),
);

export default router;
