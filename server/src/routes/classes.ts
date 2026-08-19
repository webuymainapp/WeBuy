import { Router } from 'express';
import { z } from 'zod';
import { randomBytes } from 'node:crypto';
import { query } from '../db/pool';
import { asyncHandler, HttpError } from '../lib/http';
import { validateBody, inviteCodeSchema } from '../lib/validate';
import {
  requireAuth,
  requireClassRep,
  requireChiefAdmin,
} from '../middleware/auth';

const router = Router();

router.use(requireAuth, requireClassRep);

function randomInviteCode(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = randomBytes(8);
  let out = '';
  for (let i = 0; i < 8; i++) out += alphabet[bytes[i] % alphabet.length];
  return out;
}

/**
 * List classes. The invite code is only shown to the platform admin and to the
 * class's own chief — everyone else sees the class without its code.
 */
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const result = await query(
      `select c.id, c.name, c.department, c.level, c.invite_code, c.admin_id,
              s.full_name as admin_name, s.reg_no as admin_reg_no,
              (select count(*)::int from students st where st.class_id = c.id) as student_count
         from classes c
         left join students s on s.id = c.admin_id
        order by c.name asc`,
    );
    const isPlatformAdmin = req.student.role === 'chief_admin';
    const classes = result.rows.map((r) => {
      const isMine = r.admin_id === req.student.sub;
      return {
        id: r.id,
        name: r.name,
        department: r.department,
        level: r.level,
        admin: r.admin_id
          ? { id: r.admin_id, fullName: r.admin_name, regNo: r.admin_reg_no }
          : null,
        studentCount: r.student_count,
        isMine,
        // Only the platform admin or the class's own chief sees the code.
        inviteCode: isPlatformAdmin || isMine ? r.invite_code : null,
      };
    });
    res.json({ classes });
  }),
);

const createClassSchema = z.object({
  name: z.string().trim().min(2).max(120),
  department: z.string().trim().min(2).max(120),
  level: z.string().trim().min(1).max(40),
  inviteCode: inviteCodeSchema.optional(),
  // The student who becomes this class's chief admin. Optional — a class can
  // be created first and a chief appointed later.
  adminId: z.string().uuid().optional(),
});

/**
 * Create a class and appoint its chief admin — platform admin (Ogemdi) only.
 * The chief is promoted to class_rep so they can run their class's panel and
 * change the invite code. The code comes from the body or is generated.
 */
router.post(
  '/',
  requireChiefAdmin,
  validateBody(createClassSchema),
  asyncHandler(async (req, res) => {
    const { name, department, level, inviteCode, adminId } = req.body as {
      name: string;
      department: string;
      level: string;
      inviteCode?: string;
      adminId?: string;
    };

    let code = inviteCode ?? '';
    if (code) {
      const taken = await query('select id from classes where invite_code = $1', [code]);
      if (taken.rowCount) {
        throw new HttpError(409, 'That invite code is already in use. Pick another.');
      }
    } else {
      // Generate a unique code that isn't already in use.
      for (let i = 0; i < 5; i++) {
        const candidate = randomInviteCode();
        const taken = await query('select id from classes where invite_code = $1', [candidate]);
        if (taken.rowCount === 0) {
          code = candidate;
          break;
        }
      }
      if (!code) throw new HttpError(500, 'Could not generate a unique invite code');
    }

    // Appoint the chief: promote them to class_rep (so they get the rep panel)
    // and remember them as this class's admin. Only the platform admin decides.
    let adminUuid: string | null = null;
    if (adminId) {
      const target = await query(
        'select id, role from students where id = $1',
        [adminId],
      );
      if (target.rowCount === 0) {
        throw new HttpError(404, 'That student was not found');
      }
      if (target.rows[0].role === 'student') {
        await query('update students set role = $1 where id = $2', ['class_rep', adminId]);
      }
      adminUuid = adminId;
    }

    const ins = await query(
      `insert into classes (name, department, level, admin_id, invite_code)
       values ($1, $2, $3, $4, $5)
       returning id, name, department, level, invite_code, admin_id`,
      [name, department, level, adminUuid, code],
    );

    res.status(201).json({ class: ins.rows[0] });
  }),
);

const changeCodeSchema = z.object({ inviteCode: inviteCodeSchema });

/**
 * Change a class's invite code — the platform admin OR the class's own chief.
 */
router.patch(
  '/:id/invite-code',
  asyncHandler(async (req, res) => {
    const parsed = changeCodeSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      throw new HttpError(400, 'Invalid invite code');
    }
    const code = parsed.data.inviteCode;

    const cls = await query(
      'select id, admin_id from classes where id = $1',
      [req.params.id],
    );
    if (cls.rowCount === 0) {
      throw new HttpError(404, 'Class not found');
    }
    const isChief = req.student.role === 'chief_admin';
    const isClassChief = cls.rows[0].admin_id === req.student.sub;
    if (!isChief && !isClassChief) {
      throw new HttpError(403, 'Only the platform admin or this class\'s chief can change the invite code');
    }

    const taken = await query(
      'select id from classes where invite_code = $1 and id <> $2',
      [code, req.params.id],
    );
    if (taken.rowCount) {
      throw new HttpError(409, 'That invite code is already in use. Pick another.');
    }

    await query('update classes set invite_code = $1 where id = $2', [code, req.params.id]);
    res.json({ ok: true, inviteCode: code });
  }),
);

export default router;