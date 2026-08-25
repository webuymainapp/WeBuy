import { Router } from 'express';
import { z } from 'zod';
import { query } from '../db/pool';
import { asyncHandler, HttpError } from '../lib/http';
import { validateBody, regNoSchema, emailSchema, passwordSchema, inviteCodeSchema, normalizePhone } from '../lib/validate';
import {
  hashPassword,
  verifyPassword,
  stagePendingSignup,
  reissuePendingOtp,
  consumePendingSignupOtp,
  generateOtp,
  OTP_LENGTH,
  OTP_TTL_MINUTES,
  OTP_MAX_ATTEMPTS,
} from '../lib/security';
import { signAuthToken } from '../lib/jwt';
import { enqueueVerificationEmail, enqueueMail } from '../lib/mail';
import { createHash } from 'node:crypto';
import { requireAuth } from '../middleware/auth';
import { rateLimit } from '../lib/rateLimit';
import { makeDepositReference } from '../lib/pocketfi';

const router = Router();

const authLimiter = rateLimit({ windowMs: 60_000, max: 10 });
const verificationLimiter = rateLimit({ windowMs: 60_000, max: 5 });

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
  // NOTE: no role field here. Public signups are ALWAYS students.
  // Course reps are seeded directly into the DB (see server/seed.sql).
});

router.post(
  '/signup',
  authLimiter,
  validateBody(signupSchema),
  asyncHandler(async (req, res) => {
    const { regNo, fullName, email, phone, password, inviteCode } =
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
    // `students` only when the emailed 6-digit code is verified.
    const otp = await stagePendingSignup({
      regNo,
      fullName,
      email,
      phone: normalizedPhone,
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
              s.phone_edit_count, s.created_at,
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
        freeProfileEditUsed: row.free_profile_edit_used,
        phoneEditCount: row.phone_edit_count,
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
              s.phone_edit_count, s.created_at,
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
        classId: r.class_id ?? null,
        className: r.class_name ?? null,
        inviteCode: r.invite_code ?? null,
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

function sha256(v: string): string {
  return createHash('sha256').update(v).digest('hex');
}

const forgotPasswordSchema = z.object({ emailOrRegNo: z.string().trim().min(2) });

/** Request a password-reset OTP. Finds the student by email or reg_no, generates
 *  a 6-digit code, stores its hash in `password_resets`, and emails it. Always
 *  returns 200 to avoid leaking whether the account exists. */
router.post(
  '/forgot-password',
  authLimiter,
  validateBody(forgotPasswordSchema),
  asyncHandler(async (req, res) => {
    const { emailOrRegNo } = req.body;
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
    const otp = generateOtp();
    const otpHash = sha256(otp);

    // Upsert: replace any previous unverified reset for this email.
    await query('delete from password_resets where lower(email) = lower($1)', [email]);
    await query(
      `insert into password_resets (email, otp_hash, expires_at)
       values ($1, $2, now() + make_interval(mins => $3))`,
      [email, otpHash, OTP_TTL_MINUTES],
    );

    // Queue email — best-effort.
    const html = `
      <div style="font-family:Arial,sans-serif;max-width:480px;margin:0 auto">
        <h2 style="color:#111827">Password Reset</h2>
        <p style="color:#374151">Use the code below to reset your password.</p>
        <div style="margin:24px 0;padding:20px;background:#eef2ff;border-radius:12px;text-align:center">
          <span style="font-size:32px;font-weight:800;letter-spacing:8px;color:#4f46e5">${otp}</span>
        </div>
        <p style="color:#6b7280;font-size:13px">This code expires in 10 minutes. If you did not request a password reset, ignore this email.</p>
      </div>`;
    await enqueueMail({
      to: email,
      subject: 'Your Webuy password reset code',
      text: `Your password reset code is ${otp}. It expires in 10 minutes.`,
      html,
    }).catch(() => undefined);

    res.json({ ok: true });
  }),
);

const resetPasswordSchema = z.object({
  emailOrRegNo: z.string().trim().min(2),
  otp: z.string().length(OTP_LENGTH),
  newPassword: passwordSchema,
});

/** Verify the password-reset OTP and set the new password. */
router.post(
  '/reset-password',
  authLimiter,
  validateBody(resetPasswordSchema),
  asyncHandler(async (req, res) => {
    const { emailOrRegNo, otp, newPassword } = req.body;
    const value = emailOrRegNo.toLowerCase();

    const row = await query(
      `select id, otp_hash, attempts, expires_at, email
         from password_resets
        where lower(email) = (select lower(email) from students where email = $1 or lower(reg_no) = $1 limit 1)
        order by created_at desc limit 1`,
      [value],
    );
    if (row.rowCount === 0) {
      throw new HttpError(400, 'No reset request found. Tap "Forgot Password" first.');
    }
    const r = row.rows[0];

    if (new Date(r.expires_at) <= new Date()) {
      throw new HttpError(400, 'This code has expired. Request a new one.');
    }
    const attempts = Number(r.attempts ?? 0);
    if (attempts >= OTP_MAX_ATTEMPTS) {
      throw new HttpError(400, 'Too many wrong attempts. Request a new code.');
    }

    if (sha256(otp) !== r.otp_hash) {
      await query('update password_resets set attempts = $1 where id = $2', [attempts + 1, r.id]);
      const left = OTP_MAX_ATTEMPTS - attempts - 1;
      throw new HttpError(
        400,
        left <= 0
          ? 'Too many wrong attempts. Request a new code.'
          : `Incorrect code. ${left} attempt${left === 1 ? '' : 's'} left.`,
      );
    }

    // OTP valid — update the password and clean up.
    const passwordHash = await hashPassword(newPassword);
    await query('update students set password_hash = $1 where lower(email) = $2', [passwordHash, r.email]);
    await query('delete from password_resets where lower(email) = lower($1)', [r.email]);

    res.json({ ok: true });
  }),
);

export default router;
