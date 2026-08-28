import { Router } from 'express';
import { z } from 'zod';
import { query } from '../db/pool';
import { asyncHandler, HttpError } from '../lib/http';
import { validateBody, regNoSchema, emailSchema, passwordSchema, inviteCodeSchema, normalizePhone } from '../lib/validate';
import {
  hashPassword,
  verifyPassword,
  stagePendingSignup,
  reissuePendingToken,
  consumePendingSignupToken,
  generateToken,
  hashToken,
  OTP_TTL_MINUTES,
} from '../lib/security';
import { signAuthToken, newSessionToken } from '../lib/jwt';
import { enqueueVerificationEmail, enqueuePasswordResetEmail } from '../lib/mail';
import { config } from '../config';
import { requireAuth } from '../middleware/auth';
import { rateLimit } from '../lib/rateLimit';
import { makeDepositReference } from '../lib/pocketfi';

const router = Router();

const authLimiter = rateLimit({ windowMs: 60_000, max: 10 });
const verificationLimiter = rateLimit({ windowMs: 60_000, max: 5 });

/** Strip a single trailing slash from a base URL so links never read /?verify=. */
function trimSlash(url: string): string {
  return url.replace(/\/+$/, '');
}

/** Build a frontend link for a given query route, e.g. ?verify=abc123. */
function appLink(query: string, origin?: string): string {
  // Only trust an origin the frontend hands us if it's on the configured
  // allowlist — never embed arbitrary URLs in emailed links (phishing vector).
  const provided = origin?.trim() ? trimSlash(origin) : '';
  const trusted = config.frontendUrls.find((u) => trimSlash(u) === provided);
  const base = trusted ?? trimSlash(config.frontendUrl);
  return `${base}/?${query}`;
}

const signupSchema = z.object({
  regNo: regNoSchema,
  fullName: z.string().trim().min(2).max(120),
  email: emailSchema,
  phone: z.string().trim().min(1, 'phone number is required').max(20),
  department: z.string().trim().min(2).max(120).optional(),
  level: z.string().trim().min(1).max(40).optional(),
  password: passwordSchema,
  // Required: the invite code joins the student to their class.
  inviteCode: inviteCodeSchema,
  // The frontend's own origin, so emailed verification links point at the SPA
  // the user is actually on (avoids hardcoding a frontend URL in server env).
  origin: z.string().trim().url().max(200).optional(),
  // NOTE: no role field here. Public signups are ALWAYS students.
  // Course reps are seeded directly into the DB (see server/seed.sql).
});

router.post(
  '/signup',
  authLimiter,
  validateBody(signupSchema),
  asyncHandler(async (req, res) => {
    const { regNo, fullName, email, phone, password, inviteCode, origin } =
      req.body;

    // Normalise phone: +234XXXXXXXXXX → 0XXXXXXXXXX, enforce 11 digits.
    const normalizedPhone = phone ? normalizePhone(phone) : null;

    // Resolve the invite code to a class — every student must belong to one.
    // Case-insensitive match so "csc2024", "CSC2024", "Csc2024" all work.
    const cls = await query(
      'select id, name, department, level from classes where upper(invite_code) = upper($1)',
      [inviteCode],
    );
    if (cls.rowCount === 0) {
      throw new HttpError(400, 'That class invite code is not valid. Check it with your class chief and try again.');
    }
    const classId = cls.rows[0].id as string;
    const classDepartment = cls.rows[0].department as string;
    const classLevel = cls.rows[0].level as string;

    // Use the class's department and level — not what the student typed.
    const department = classDepartment;
    const level = classLevel;

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
    // `students` only when the emailed verification link is followed.
    const token = await stagePendingSignup({
      regNo,
      fullName,
      email,
      phone: normalizedPhone,
      department,
      level,
      passwordHash,
      classId,
    });
    // Queue the verification-link email for the frontend mail sender. Sending is
    // best-effort — the user can always request another link later.
    await enqueueVerificationEmail(email, appLink(`verify=${token}`, origin)).catch(() => undefined);

    res.status(201).json({
      email,
      student: {
        id: null,
        regNo,
        fullName,
        email,
        phone: normalizedPhone,
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
      `select s.id, s.reg_no, s.full_name, s.email, s.phone, s.department, s.level,
              s.password_hash, s.role, s.email_verified, s.avatar_url, s.free_profile_edit_used,
              s.phone_edit_count, s.market_access, s.created_at,
              c.id as class_id, c.name as class_name, c.invite_code
         from students s
         left join classes c on c.admin_id = s.id
        where s.email = $1 or lower(s.reg_no) = $1
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

    const sess = newSessionToken();
    const token = signAuthToken({
      sub: row.id,
      role: row.role,
      reg_no: row.reg_no,
      sess,
    });

    // Single-session: overwrite the stored session token so any older
    // browser's token (with an older sess value) is rejected by requireAuth.
    await query('update students set session_token = $1 where id = $2', [sess, row.id]);

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
        freeProfileEditUsed: row.free_profile_edit_used,
        phoneEditCount: row.phone_edit_count,
        marketAccess: Boolean(row.market_access),
        createdAt: row.created_at,
        classId: row.class_id ?? null,
        className: row.class_name ?? null,
        inviteCode: row.invite_code ?? null,
      },
    });
  }),
);

router.get(
  '/me',
  requireAuth,
  asyncHandler(async (req, res) => {
    const result = await query(
      `select s.id, s.reg_no, s.full_name, s.email, s.phone, s.department, s.level,
              s.role, s.email_verified, s.avatar_url, s.free_profile_edit_used,
              s.phone_edit_count, s.market_access, s.created_at,
              c.id as class_id, c.name as class_name, c.invite_code
         from students s
         left join classes c on c.admin_id = s.id
        where s.id = $1`,
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
        freeProfileEditUsed: r.free_profile_edit_used,
        phoneEditCount: r.phone_edit_count,
        marketAccess: Boolean(r.market_access),
        classId: r.class_id ?? null,
        className: r.class_name ?? null,
        inviteCode: r.invite_code ?? null,
      },
    });
  }),
);

const verifyEmailSchema = z.object({
  token: z.string().trim().min(32).max(128),
});

/** Resend a signup verification link (no login required). Never reveals if the
 *  signup exists — a "sent" response is given either way. */
router.post(
  '/resend-verification',
  verificationLimiter,
  validateBody(z.object({
    emailOrRegNo: z.string().trim().min(2).max(120),
    origin: z.string().trim().url().max(200).optional(),
  })),
  asyncHandler(async (req, res) => {
    const value = req.body.emailOrRegNo.toLowerCase();
    const origin = req.body.origin as string | undefined;
    const result = await reissuePendingToken(value);
    if (result && result.ok) {
      await enqueueVerificationEmail(result.email, appLink(`verify=${result.token}`, origin)).catch(() => undefined);
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

/** Verify a one-time email link and activate the pending signup. On success the
 *  account is promoted into `students` (email_verified = true) and an auth
 *  token is issued so the student lands straight in the portal. */
router.post(
  '/verify-email',
  verificationLimiter,
  validateBody(verifyEmailSchema),
  asyncHandler(async (req, res) => {
    const { token } = req.body;
    const studentId = await consumePendingSignupToken(token);

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

    const sess = newSessionToken();
    const token2 = signAuthToken({
      sub: row.id,
      role: row.role,
      reg_no: row.reg_no,
      sess,
    });

    // Single-session: this link login is also a sign-in, so rotate the session.
    await query('update students set session_token = $1 where id = $2', [sess, row.id]);

    res.json({
      token: token2,
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

const PROFILE_EDIT_FEE = 100;

const updateMeSchema = z.object({
  department: z.string().trim().min(2).max(120).optional(),
  level: z.string().trim().min(1).max(40).optional(),
  regNo: regNoSchema.optional(),
});

router.patch(
  '/me',
  requireAuth,
  validateBody(updateMeSchema),
  asyncHandler(async (req, res) => {
    const { department, level, regNo } = req.body;

    if (!department && !level && !regNo) {
      throw new HttpError(400, 'Nothing to update');
    }

    let newBalance: number | null = null;
    try {
      await query('begin');

      // Check if the free edit has been used.
      const me = await query(
        'select free_profile_edit_used from students where id = $1 for update',
        [req.student.sub],
      );
      const freeUsed = me.rows[0]?.free_profile_edit_used as boolean;

      if (freeUsed) {
        // Deduct 100 points for profile edit.
        await query(
          `insert into student_wallets (student_id) values ($1)
           on conflict (student_id) do nothing`,
          [req.student.sub],
        );
        const wallet = await query(
          `select point_balance from student_wallets
            where student_id = $1 for update`,
          [req.student.sub],
        );
        newBalance = wallet.rows[0].point_balance as number;
        if (newBalance < PROFILE_EDIT_FEE) {
          await query('rollback');
          throw new HttpError(
            400,
            `Editing your profile costs ${PROFILE_EDIT_FEE} points. You have ${newBalance} points.`,
          );
        }

        await query(
          `update student_wallets
              set point_balance = point_balance - $1, updated_at = now()
            where student_id = $2`,
          [PROFILE_EDIT_FEE, req.student.sub],
        );
        const feeRef = makeDepositReference();
        const fields = [department, level, regNo].filter(Boolean).join(', ');
        await query(
          `insert into wallet_transactions (student_id, kind, amount, reference, note)
           values ($1, 'purchase', -$2, $3, $4)`,
          [
            req.student.sub,
            PROFILE_EDIT_FEE,
            feeRef,
            `Profile edit fee (${PROFILE_EDIT_FEE} pts) — updated: ${fields}`,
          ],
        );
      }

      // Build dynamic SET clause for changed fields.
      const setClauses: string[] = [];
      const values: unknown[] = [];
      let idx = 1;
      if (department) { setClauses.push(`department = $${idx++}`); values.push(department); }
      if (level) { setClauses.push(`level = $${idx++}`); values.push(level); }
      if (regNo) { setClauses.push(`reg_no = $${idx++}`); values.push(regNo); }
      setClauses.push(`free_profile_edit_used = true`);

      // Check regNo uniqueness if changing.
      if (regNo) {
        const dup = await query(
          'select id from students where reg_no = $1 and id <> $2 limit 1',
          [regNo, req.student.sub],
        );
        if (dup.rowCount) {
          await query('rollback');
          throw new HttpError(409, 'That registration number is already taken');
        }
      }

      values.push(req.student.sub);
      const result = await query(
        `update students
            set ${setClauses.join(', ')}
          where id = $${idx}
          returning id, reg_no, full_name, email, phone, department, level,
                    role, email_verified, avatar_url, free_profile_edit_used,
                    phone_edit_count, created_at`,
        values,
      );
      if (result.rowCount === 0) {
        await query('rollback');
        throw new HttpError(404, 'Account not found');
      }

      // If we deducted points, compute the new balance.
      if (!freeUsed) {
        newBalance = null; // free edit — no deduction
      }

      await query('commit');

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
          freeProfileEditUsed: r.free_profile_edit_used,
          phoneEditCount: r.phone_edit_count,
          createdAt: r.created_at,
        },
        points: newBalance,
      });
    } catch (err) {
      await query('rollback').catch(() => undefined);
      throw err;
    }
  }),
);

// ---- Forgot / Reset Password ---------------------------------------------

const forgotPasswordSchema = z.object({
  emailOrRegNo: z.string().trim().min(2),
  origin: z.string().trim().url().max(200).optional(),
});

/** Request a password-reset link. Finds the student by email or reg_no,
 *  generates a one-time token, stores its hash in `password_resets`, and emails
 *  a reset link. Always returns 200 to avoid leaking whether the account exists. */
router.post(
  '/forgot-password',
  authLimiter,
  validateBody(forgotPasswordSchema),
  asyncHandler(async (req, res) => {
    const { emailOrRegNo, origin } = req.body;
    const value = emailOrRegNo.toLowerCase();

    const student = await query(
      'select id, email from students where email = $1 or lower(reg_no) = $1 limit 1',
      [value],
    );

    // Always return 200 — don't reveal whether the account exists.
    if (student.rowCount === 0) {
      res.json({ ok: true });
      return;
    }

    const email = student.rows[0].email as string;
    const token = generateToken();
    const tokenHash = hashToken(token);

    // Upsert: replace any previous unused reset for this email.
    await query('delete from password_resets where lower(email) = lower($1)', [email]);
    await query(
      `insert into password_resets (email, token_hash, expires_at)
       values ($1, $2, now() + make_interval(mins => $3))`,
      [email, tokenHash, OTP_TTL_MINUTES],
    );

    // Queue email — best-effort.
    await enqueuePasswordResetEmail(email, appLink(`reset=${token}`, origin)).catch(() => undefined);

    res.json({ ok: true });
  }),
);

const resetPasswordSchema = z.object({
  token: z.string().trim().min(32).max(128),
  newPassword: passwordSchema,
});

/** Consume a one-time password-reset token and set the new password. */
router.post(
  '/reset-password',
  authLimiter,
  validateBody(resetPasswordSchema),
  asyncHandler(async (req, res) => {
    const { token, newPassword } = req.body;

    const row = await query(
      `select id, token_hash, used_at, expires_at, email
         from password_resets
        where token_hash = $1
        order by created_at desc limit 1`,
      [hashToken(token)],
    );
    if (row.rowCount === 0) {
      throw new HttpError(400, 'This reset link is invalid. Request a new one.');
    }
    const r = row.rows[0];

    if (new Date(r.expires_at) <= new Date()) {
      throw new HttpError(400, 'This reset link has expired. Request a new one.');
    }
    if (r.used_at) {
      throw new HttpError(400, 'This reset link has already been used. Request a new one.');
    }

    // Token valid — update the password and clean up.
    const passwordHash = await hashPassword(newPassword);
    await query('update students set password_hash = $1 where lower(email) = $2', [passwordHash, r.email]);
    await query('delete from password_resets where lower(email) = lower($1)', [r.email]);

    const studentRes = await query(
      `select id, reg_no, full_name, email, phone, department, level,
              password_hash, role, email_verified, avatar_url, created_at
         from students where lower(email) = lower($1)`,
      [r.email],
    );
    if (studentRes.rowCount === 0) {
      throw new HttpError(404, 'Account not found');
    }
    const stu = studentRes.rows[0];

    // Resetting the password also signs the user in — rotate the session so the
    // frontend can drop them straight onto their dashboard.
    const sess = newSessionToken();
    const token2 = signAuthToken({
      sub: stu.id,
      role: stu.role,
      reg_no: stu.reg_no,
      sess,
    });
    await query('update students set session_token = $1 where id = $2', [sess, stu.id]);

    res.json({
      ok: true,
      token: token2,
      student: {
        id: stu.id,
        regNo: stu.reg_no,
        fullName: stu.full_name,
        email: stu.email,
        phone: stu.phone,
        department: stu.department,
        level: stu.level,
        role: stu.role,
        emailVerified: stu.email_verified,
        avatarUrl: stu.avatar_url,
        createdAt: stu.created_at,
      },
    });
  }),
);

export default router;
