import { Router } from 'express';
import { z } from 'zod';
import { randomBytes } from 'node:crypto';
import { query } from '../db/pool';
import { asyncHandler, HttpError } from '../lib/http';
import { validateBody } from '../lib/validate';
import {
  requireAuth,
  requireClassRep,
  requireChiefAdmin,
} from '../middleware/auth';
import type { AuthTokenPayload } from '../lib/jwt';
import { createTtlCache } from '../lib/ttlCache';
import { verifyBankAccount, listPocketFiBanks } from '../lib/pocketfi';
import { disturbChiefs } from '../lib/payoutReminders';

function makePayoutReference(): string {
  return `PFL-${Date.now().toString(36).toUpperCase()}-${randomBytes(4)
    .toString('hex')
    .toUpperCase()}`;
}

const router = Router();

// Automatic PocketFi service charge added on top of the price a rep posts. It is
// baked into the stored `price` so students see a single all-inclusive amount.
// Only applied when a textbook is CREATED; edits manage the final price directly.
const POCKETFEE_NGN = 100;

// Rep dashboard reads a bunch of aggregate queries on every visit, but the
// numbers only change when a rep mutates data. Cache the overview for 30s and
// invalidate it on any write below so it stays fresh without hammering the DB.
const overviewCache = createTtlCache<unknown>(30_000);

router.use(requireAuth, requireClassRep);

// A non-chief rep may only manage a textbook they themselves added. The chief
// admin (the main course rep) can manage every book.
async function assertCanManageTextbook(
  student: AuthTokenPayload,
  textbookId: string,
) {
  if (student.role === 'chief_admin') return;
  const res = await query('select added_by from textbooks where id = $1', [
    textbookId,
  ]);
  if (res.rowCount === 0) throw new HttpError(404, 'Textbook not found');
  if ((res.rows[0].added_by as string | null) !== student.sub) {
    throw new HttpError(403, 'You can only manage textbooks you added');
  }
}

/**
 * Collection slots available to a rep for a course = copies they've had SETTLED
 * (money withdrawn) for that course, minus how many students are already marked
 * collected, plus any slots the chief has granted. A rep can't mark more
 * students collected than this — undelivered books stay "owed".
 */
async function availableCollectionSlots(
  repId: string,
  textbookId: string,
): Promise<number> {
  const res = await query(
    `select
       coalesce((select sum(copies) from payouts where textbook_id = $2 and status = 'completed'), 0)::int as settled,
       coalesce((select count(*) from student_textbooks where textbook_id = $2 and status = 'collected'), 0)::int as collected,
       coalesce((select sum(copies) from rep_toggle_grants where textbook_id = $2 and rep_id = $1), 0)::int as granted`,
    [repId, textbookId],
  );
  return (
    res.rows[0].settled - res.rows[0].collected + res.rows[0].granted
  );
}

async function assertCanManageAssignment(
  student: AuthTokenPayload,
  studentTextbookId: string,
) {
  // Collection can only be toggled by the rep who added the book — even the
  // chief admin may only toggle their OWN books, so they don't interfere with
  // another rep's distribution.
  const res = await query(
    `select t.added_by
       from student_textbooks st
       join textbooks t on t.id = st.textbook_id
      where st.id = $1`,
    [studentTextbookId],
  );
  if (res.rowCount === 0) throw new HttpError(404, 'Assignment not found');
  if ((res.rows[0].added_by as string | null) !== student.sub) {
    throw new HttpError(403, 'You can only manage collection for textbooks you added');
  }
}

/**
 * Permanently remove textbooks that were soft-deleted more than 24 hours ago.
 * Called lazily (never awaited) on reads so expired rows are swept even when
 * no background scheduler is running — the next request after the window
 * closes does the cleanup.
 */
async function purgeExpiredDeletes(): Promise<void> {
  try {
    await query(
      `delete from textbooks
        where deleted_at is not null
          and deleted_at < now() - interval '24 hours'`,
    );
  } catch {
    // non-fatal — the next request will retry
  }
}

/** All accounts — chief admin only. */
router.get(
  '/users',
  requireChiefAdmin,
  asyncHandler(async (_req, res) => {
    const result = await query(
      `select id, reg_no, full_name, email, department, level, role,
              email_verified, created_at
         from students
        order by created_at desc`,
    );
    res.json({ users: result.rows });
  }),
);

/** Reassign every course a rep owns to another student (normally the chief
 * admin): textbook ownership (added_by + class_rep_name), pending procurement
 * payouts and collection-slot grants all move to the new owner. Returns the
 * number of courses transferred. */
async function transferOwnedCourses(
  fromRepId: string,
  toRepId: string,
  toRepName: string,
): Promise<number> {
  const owned = await query(
    `select id from textbooks where added_by = $1 and deleted_at is null`,
    [fromRepId],
  );
  if (owned.rows.length === 0) return 0;
  const bookIds = owned.rows.map((r) => r.id) as string[];

  await query(
    `update textbooks
        set added_by = $1, class_rep_name = $2
      where added_by = $3`,
    [toRepId, toRepName, fromRepId],
  );
  await query(
    `update rep_toggle_grants set rep_id = $1
      where rep_id = $2 and textbook_id = any($3::uuid[])`,
    [toRepId, fromRepId, bookIds],
  );
  await query(
    `update payouts set rep_id = $1
      where rep_id = $2 and textbook_id = any($3::uuid[])
        and status in ('pending', 'processing')`,
    [toRepId, fromRepId, bookIds],
  );

  return owned.rows.length;
}

/** Grant or revoke rep access — chief admin only. When a rep is dismissed,
 * every course they own (textbooks, pending payouts and collection slots) is
 * automatically reassigned to the acting chief admin so nothing is orphaned. */
router.patch(
  '/users/:id/role',
  requireChiefAdmin,
  validateBody(z.object({ role: z.enum(['student', 'class_rep', 'chief_admin']) })),
  asyncHandler(async (req, res) => {
    const { role } = req.body as { role: 'student' | 'class_rep' | 'chief_admin' };
    const targetId = String(req.params.id);

    if (targetId === req.student.sub) {
      throw new HttpError(400, 'You cannot change your own role');
    }

    const target = await query(
      `select id, full_name, role from students where id = $1`,
      [targetId],
    );
    if (target.rowCount === 0) {
      throw new HttpError(404, 'User not found');
    }
    const prevRole = target.rows[0].role as string;

    await query(
      `update students set role = $1 where id = $2`,
      [role, targetId],
    );

    let transferredCourses = 0;
    if (role === 'student' && prevRole !== 'student') {
      const chief = await query(
        `select id, full_name from students where id = $1`,
        [req.student.sub],
      );
      if (chief.rowCount === 0) {
        throw new HttpError(500, 'Chief admin account not found');
      }
      transferredCourses = await transferOwnedCourses(
        targetId,
        String(chief.rows[0].id),
        String(chief.rows[0].full_name),
      );
    }

    const title =
      role === 'class_rep'
        ? 'Class rep access granted'
        : 'Class rep access removed';
    await query(
      `insert into notifications (student_id, type, title, body)
       values ($1, 'role', $2, $3)`,
      [
        targetId,
        title,
        role === 'class_rep'
          ? 'You can now access the class rep panel.'
          : transferredCourses > 0
            ? `You are now a regular student. The ${transferredCourses} course(s) you added were reassigned to the chief admin.`
            : 'You are now a regular student.',
      ],
    );

    res.json({
      ok: true,
      user: {
        id: target.rows[0].id,
        full_name: target.rows[0].full_name,
        role,
      },
      transferredCourses,
    });
  }),
);

/** High-level dashboard: counts + recent activity so reps see everything. */
router.get(
  '/overview',
  asyncHandler(async (_req, res) => {
    const cached = overviewCache.get('overview');
    if (cached) {
      res.json(cached);
      return;
    }

    const [students, books, paid, collected, recentTx, recentWalletDep, recentCol] =
      await Promise.all([
        query('select count(*)::int as n from students'),
        query(
          'select count(*)::int as n from textbooks where deleted_at is null',
        ),
        query(
          "select count(*)::int as n from student_textbooks where status = 'paid'",
        ),
        query(
          "select count(*)::int as n from student_textbooks where status = 'collected'",
        ),
        query(
          `select t.reference, t.amount, t.status, t.created_at,
                  s.full_name, s.reg_no
             from transactions t
             left join students s on s.id = t.student_id
            order by t.created_at desc
            limit 10`,
        ),
        query(
          `select w.reference, w.amount, 'success' as status, w.created_at,
                  s.full_name, s.reg_no
             from wallet_transactions w
             left join students s on s.id = w.student_id
            where w.kind = 'deposit'
            order by w.created_at desc
            limit 10`,
        ),
        query(
          `select c.created_at, c.location, s.full_name, s.reg_no, t.book_title
             from collections c
             join student_textbooks st on st.id = c.student_textbook_id
             join students s on s.id = st.student_id
             join textbooks t on t.id = st.textbook_id
            order by c.created_at desc
            limit 10`,
        ),
      ]);

    const recentTransactions = [...recentTx.rows, ...recentWalletDep.rows]
      .sort(
        (a, b) =>
          new Date((b as { created_at: string }).created_at).getTime() -
          new Date((a as { created_at: string }).created_at).getTime(),
      )
      .slice(0, 10);

    const payload = {
      counts: {
        students: students.rows[0].n,
        textbooks: books.rows[0].n,
        paid: paid.rows[0].n,
        collected: collected.rows[0].n,
      },
      recentTransactions,
      recentCollections: recentCol.rows,
    };
    overviewCache.set('overview', payload);
    res.json(payload);
  }),
);

/**
 * The rep's own revenue: money received for textbooks THEY added, minus the
 * automatic ₦100 PocketFi charge (which belongs to the platform, not the rep),
 * and minus any payouts they have had SETTLED (money withdrawn from PocketFi).
 * Non-chief reps only ever see their own books' revenue — they can't trace or
 * calculate other reps' earnings. The chief admin sees the platform-wide total.
 * Revenue = sum over every paid/collected assignment of (price − fee) − settled payouts.
 */
router.get(
  '/revenue',
  asyncHandler(async (req, res) => {
    const isChief = req.student.role === 'chief_admin';
    const params: unknown[] = [POCKETFEE_NGN];
    const scope = isChief ? '' : 'and t.added_by = $2';
    if (!isChief) params.push(req.student.sub);

    const [earned, payouts] = await Promise.all([
      query(
        `select coalesce(sum(t.price - $1), 0)::int as earned,
                count(*)::int as paid_books
           from student_textbooks st
           join textbooks t on t.id = st.textbook_id
          where st.status in ('paid', 'collected')
                ${scope}`,
        params,
      ),
      query(
        `select coalesce(sum(amount), 0)::int as settled
           from payouts
          where status = 'completed'
            ${isChief ? '' : 'and rep_id = $1'}`,
        isChief ? [] : [req.student.sub],
      ),
    ]);

    const revenue = Math.max(
      (earned.rows[0].earned as number) - (payouts.rows[0].settled as number),
      0,
    );
    res.json({
      revenue,
      paidBooks: earned.rows[0].paid_books,
    });
  }),
);

const payoutCreateSchema = z.object({
  textbookId: z.string().uuid(),
  copies: z.number().int().min(1).max(10000),
  accountNumber: z.string().trim().min(10).max(10),
  bankCode: z.string().trim().min(1).max(20),
  bankName: z.string().trim().min(2).max(80),
});

const resolveAccountSchema = z.object({
  accountNumber: z.string().trim().min(10).max(10),
  bankCode: z.string().trim().min(1).max(20),
});

/**
 * How many copies of a textbook the rep can still request money for: students
 * who have paid, minus copies already requested in non-failed payouts.
 */
router.get(
  '/textbooks/:id/paid-count',
  asyncHandler(async (req, res) => {
    const result = await query(
      `select greatest(
         (select count(*) from student_textbooks
           where textbook_id = $1 and status in ('paid', 'collected'))::int
         - coalesce((
             select sum(p.copies) from payouts p
              where p.textbook_id = $1 and p.status <> 'failed'
           ), 0)::int,
         0
       )::int as available`,
      [req.params.id],
    );
    res.json({ paid: result.rows[0].available });
  }),
);

/** All reps (id + name) — used by the chief to view any rep's transaction log. */
router.get(
  '/reps',
  asyncHandler(async (_req, res) => {
    const result = await query(
      `select id, full_name, reg_no from students
        where role in ('class_rep', 'chief_admin')
        order by full_name asc`,
    );
    res.json({ reps: result.rows });
  }),
);

/**
 * A rep requests money to buy books for one of THEIR courses: they pick the
 * course (a textbook they added) and how many copies they need. The requested
 * amount is auto-calculated as copies × (price − the ₦100 PocketFi fee), i.e.
 * the rep's own portion for those books. The chief later settles it.
 */
router.post(
  '/payouts',
  validateBody(payoutCreateSchema),
  asyncHandler(async (req, res) => {
    const { textbookId, copies, accountNumber, bankCode, bankName } = req.body as {
      textbookId: string;
      copies: number;
      accountNumber: string;
      bankCode: string;
      bankName: string;
    };

    const book = await query(
      `select t.id, t.price, t.course_code, t.added_by, t.deleted_at
         from textbooks t where t.id = $1`,
      [textbookId],
    );
    if (book.rowCount === 0 || book.rows[0].deleted_at) {
      throw new HttpError(404, 'Textbook not found');
    }
    if (
      req.student.role !== 'chief_admin' &&
      (book.rows[0].added_by as string | null) !== req.student.sub
    ) {
      throw new HttpError(
        403,
        'You can only request money for courses you are in charge of',
      );
    }

    const perBook = Math.max((book.rows[0].price as number) - POCKETFEE_NGN, 0);
    // Reps can only request copies that students have already paid for (via
    // points), MINUS any copies already requested in a payout (pending,
    // processing or settled). A failed payout frees its copies back up. This
    // stops a rep requesting the same copies twice — total requested copies for
    // a course can never exceed how many students actually paid for it.
    const availableRes = await query(
      `select greatest(
         (select count(*) from student_textbooks
           where textbook_id = $1 and status in ('paid', 'collected'))::int
         - coalesce((
             select sum(p.copies) from payouts p
              where p.textbook_id = $1 and p.status <> 'failed'
           ), 0)::int,
         0
       )::int as available`,
      [textbookId],
    );
    const available = availableRes.rows[0].available as number;
    if (copies > available) {
      throw new HttpError(
        400,
        `Only ${available} cop${available === 1 ? 'y' : 'ies'} still available for this course (${available} left after copies you've already requested). You can request up to ${available}.`,
      );
    }

    const amount = perBook * copies;
    if (amount <= 0) {
      throw new HttpError(400, 'Cannot request money for this course yet');
    }

    // Resolve the authoritative account owner's name via PocketFi — never trust
    // a client-supplied name. The rep confirms the name before submitting.
    const resolved = await verifyBankAccount({ accountNumber, bankCode });

    const reference = makePayoutReference();
    const ins = await query(
      `insert into payouts
         (rep_id, amount, bank_name, bank_code, account_name, account_number,
          reference, status, textbook_id, copies)
       values ($1, $2, $3, $4, $5, $6, $7, 'pending', $8, $9)
       returning id, amount, copies, status, reference, created_at`,
      [
        req.student.sub,
        amount,
        bankName,
        bankCode,
        resolved.accountName,
        resolved.accountNumber,
        reference,
        textbookId,
        copies,
      ],
    );
    overviewCache.del('overview');

    // Disturb the chief admin — in-app notification + email — so a money
    // request is never left unseen between visits to the panel. If it stays
    // unsettled, the reminder job keeps re-disturbing until it's settled.
    const repRow = await query(
      'select full_name from students where id = $1',
      [req.student.sub],
    );
    await disturbChiefs({
      repName: String(repRow.rows[0]?.full_name ?? 'A rep'),
      courseCode: String(book.rows[0].course_code ?? 'Unknown course'),
      copies,
      amount,
    });

    res.status(201).json({ payout: ins.rows[0] });
  }),
);

/** List Nigerian banks so the rep can pick the right one for their account. */
router.get(
  '/banks',
  asyncHandler(async (_req, res) => {
    const banks = await listPocketFiBanks();
    res.json({ banks });
  }),
);

/** Resolve the owner's name of a bank account (via PocketFi) so the rep can confirm it. */
router.post(
  '/resolve-account',
  validateBody(resolveAccountSchema),
  asyncHandler(async (req, res) => {
    const { accountNumber, bankCode } = req.body as {
      accountNumber: string;
      bankCode: string;
    };
    const resolved = await verifyBankAccount({ accountNumber, bankCode });
    res.json(resolved);
  }),
);

/**
 * List payout requests. A rep sees only their own; the chief admin sees all.
 */
router.get(
  '/payouts',
  asyncHandler(async (req, res) => {
    const isChief = req.student.role === 'chief_admin';
    const result = await query(
      `select p.id, p.amount, p.copies, p.status, p.reference, p.created_at,
              p.account_name, p.account_number, p.bank_name,
              t.course_code, t.course_title, t.price,
              s.full_name as rep_name, s.reg_no as rep_reg_no
         from payouts p
         left join textbooks t on t.id = p.textbook_id
         left join students s on s.id = p.rep_id
        ${isChief ? '' : 'where p.rep_id = $1'}
        order by p.created_at desc`,
      isChief ? [] : [req.student.sub],
    );
    res.json({ payouts: result.rows });
  }),
);

/**
 * The chief admin marks a payout as SETTLED once the money has actually been
 * withdrawn from PocketFi. Settling is irreversible — once 'completed' a payout
 * can never be reverted. The completed amount is what `account.ts` subtracts
 * from the platform's "Total Money for Textbooks in PocketFi".
 */
router.post(
  '/payouts/:id/settle',
  requireChiefAdmin,
  asyncHandler(async (req, res) => {
    const updated = await query(
      `update payouts
          set status = 'completed', updated_at = now()
        where id = $1 and status = 'pending'
        returning id, amount, status`,
      [req.params.id],
    );
    if (updated.rowCount === 0) {
      const exists = await query('select status from payouts where id = $1', [
        req.params.id,
      ]);
      if (exists.rowCount === 0) {
        throw new HttpError(404, 'Payout not found');
      }
      throw new HttpError(
        409,
        'This payout is already settled and cannot be changed',
      );
    }
    overviewCache.del('overview');
    res.json({ ok: true, payout: updated.rows[0] });
  }),
);

const grantSchema = z.object({
  copies: z.number().int().min(1).max(100000),
});

/**
 * The chief admin grants a rep extra collection slots for a course — used once
 * a rep has obtained/paid for books so they can mark those students collected.
 */
router.post(
  '/toggles/:textbookId/grant',
  requireChiefAdmin,
  validateBody(grantSchema),
  asyncHandler(async (req, res) => {
    const textbookId = String(req.params.textbookId);
    const copies = (req.body as { copies: number }).copies;

    const book = await query(
      'select added_by from textbooks where id = $1',
      [textbookId],
    );
    if (book.rowCount === 0) {
      throw new HttpError(404, 'Textbook not found');
    }
    const repId = book.rows[0].added_by as string | null;
    if (!repId) {
      throw new HttpError(400, 'This textbook has no owning rep');
    }

    await query(
      `insert into rep_toggle_grants (rep_id, textbook_id, copies, granted_by)
       values ($1, $2, $3, $4)`,
      [repId, textbookId, copies, req.student.sub],
    );
    res.json({ ok: true });
  }),
);

/** Roster of students for a course (id + name + status). */
router.get(
  '/roster',
  asyncHandler(async (req, res) => {
    const course = String(req.query.course ?? '').trim().toUpperCase();
    if (!course) {
      throw new HttpError(400, 'course query param is required');
    }

    const result = await query(
      `select st.id as student_textbook_id,
              s.id as student_id, s.full_name, s.reg_no, s.department, s.level,
              t.course_code, t.book_title, t.pickup_location, t.added_by, t.id as textbook_id,
              st.status, st.paid_at, st.collected_at, st.transaction_reference
         from student_textbooks st
         join students s on s.id = st.student_id
         join textbooks t on t.id = st.textbook_id
        where upper(t.course_code) = $1 and t.deleted_at is null
          and st.status in ('paid', 'collected')
        order by s.full_name asc`,
      [course],
    );

    // Collection slots left for this course = copies settled + grants − collected.
    // Tied to whoever owns the course, so the rep (or chief) sees how many more
    // students they may mark collected.
    let availableSlots: number | null = null;
    let ownerId: string | null = null;
    if (result.rows.length > 0) {
      const textbookId = result.rows[0].textbook_id as string;
      ownerId = result.rows[0].added_by as string | null;
      if (ownerId) {
        availableSlots = await availableCollectionSlots(ownerId, textbookId);
      }
    }

    res.json({ course, roster: result.rows, ownerId, availableSlots });
  }),
);

/** Manually mark a student as collected for a course (no pass required). */
router.post(
  '/roster/:id/collect',
  asyncHandler(async (req, res) => {
    const id = String(req.params.id);
    const location = String(req.body?.location ?? 'Lecture hall');
    await assertCanManageAssignment(req.student, id);

    // Only consume a collection slot if the budget allows — a rep can't mark
    // more students collected than copies they've had settled (plus grants).
    const assignment = await query(
      'select textbook_id from student_textbooks where id = $1',
      [id],
    );
    if (assignment.rowCount === 0) {
      throw new HttpError(404, 'Assignment not found');
    }
    const slots = await availableCollectionSlots(
      req.student.sub,
      assignment.rows[0].textbook_id as string,
    );
    if (slots <= 0) {
      throw new HttpError(
        409,
        'No collection slots left for this course. You can only mark collected as many students as copies you have had settled — settle a payout or ask the chief admin to grant more.',
      );
    }

    const updated = await query(
      `update student_textbooks st
          set status = 'collected', collected_at = coalesce(collected_at, now())
        where st.id = $1 and st.status = 'paid'
        returning st.id, st.student_id, st.textbook_id`,
      [id],
    );
    if (updated.rowCount === 0) {
      // Distinguish "not found" / "already collected" from "not paid yet".
      const exists = await query('select status from student_textbooks where id = $1', [id]);
      if (exists.rowCount === 0) {
        throw new HttpError(404, 'Assignment not found');
      }
      if (exists.rows[0].status === 'collected') {
        throw new HttpError(409, 'Already collected');
      }
      throw new HttpError(409, 'Student has not paid for this textbook yet');
    }

    const st = updated.rows[0];
    await query(
      `insert into collections (student_textbook_id, scanned_by, location)
       values ($1, $2, $3)`,
      [st.id, req.student.sub, location],
    );
    await query(
      `insert into notifications (student_id, type, title, body)
       values ($1, 'collection', 'Textbook collected', $2)`,
      [
        st.student_id,
        `Your textbook has been marked as collected at ${location}.`,
      ],
    );

    overviewCache.del('overview');
    res.json({ ok: true, collectedAt: new Date().toISOString() });
  }),
);

/** Revert a mistaken collection back to paid (unmarks the student). */
router.post(
  '/roster/:id/revert',
  asyncHandler(async (req, res) => {
    const id = String(req.params.id);
    await assertCanManageAssignment(req.student, id);
    const updated = await query(
      `update student_textbooks
          set status = 'paid', collected_at = null
        where id = $1 and status = 'collected'
        returning id`,
      [id],
    );
    if (updated.rowCount === 0) {
      const exists = await query('select status from student_textbooks where id = $1', [id]);
      if (exists.rowCount === 0) {
        throw new HttpError(404, 'Assignment not found');
      }
      throw new HttpError(409, 'Student has not been marked collected');
    }
    await query('delete from collections where student_textbook_id = $1', [id]);
    overviewCache.del('overview');
    res.json({ ok: true });
  }),
);

const textbookSchema = z.object({
  courseCode: z.string().trim().min(1).max(20),
  courseTitle: z.string().trim().min(1).max(200),
  price: z.number().int().min(0),
});

/** Create a textbook (catalog) — the adding rep owns it. Only course code,
 * course title and price are collected; the description (book_title) and the
 * rep attribution are filled in automatically from the poster's profile. */
router.post(
  '/textbooks',
  validateBody(textbookSchema),
  asyncHandler(async (req, res) => {
    const rep = await query(
      'select full_name, department, level from students where id = $1',
      [req.student.sub],
    );
    if (rep.rowCount === 0) {
      throw new HttpError(404, 'Rep account not found');
    }
    const { full_name, department, level } = rep.rows[0];

    let result;
    try {
      result = await query(
        `insert into textbooks
          (course_code, course_title, book_title, price, department, level,
           pickup_location, class_rep_name, added_by)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         returning id`,
        [
          req.body.courseCode,
          req.body.courseTitle,
          `Posted by ${full_name}`,
          req.body.price + POCKETFEE_NGN,
          department,
          level,
          'Faculty Building - Room 104',
          full_name,
          req.student.sub,
        ],
      );
    } catch (err) {
      // course_code is UNIQUE — a duplicate is a user error, not a crash.
      if (
        err instanceof Error &&
        /duplicate key value violates unique constraint/.test(err.message)
      ) {
        throw new HttpError(
          409,
          `A textbook with course code "${req.body.courseCode}" already exists.`,
        );
      }
      throw err;
    }
    overviewCache.del('overview');
    res.status(201).json({ textbook: result.rows[0] });
  }),
);

/** Update a textbook. */
router.patch(
  '/textbooks/:id',
  validateBody(textbookSchema.partial()),
  asyncHandler(async (req, res) => {
    await assertCanManageTextbook(req.student, req.params.id);
    const columnMap: Record<string, string> = {
      courseCode: 'course_code',
      courseTitle: 'course_title',
      price: 'price',
    };
    const fields = req.body as Record<string, unknown>;
    const entries = Object.entries(fields)
      .filter(([, v]) => v !== undefined)
      .map(([key, v]) => [columnMap[key], v] as const)
      .filter(([col]) => !!col);
    if (entries.length === 0) {
      throw new HttpError(400, 'No fields to update');
    }
    const sets = entries.map(([col], i) => `"${col}" = $${i + 1}`);
    const values = entries.map(([, v]) => v);
    values.push(req.params.id);
    const result = await query(
      `update textbooks set ${sets.join(', ')} where id = $${entries.length + 1} returning id`,
      values,
    );
    if (result.rowCount === 0) {
      throw new HttpError(404, 'Textbook not found');
    }
    overviewCache.del('overview');
    res.json({ ok: true });
  }),
);

/** Transfer a course's ownership to another rep — chief admin only. The new
 * rep takes over the textbook, its pending procurement payouts and its
 * collection-slot grants, so the previous owner can no longer act on it. */
router.patch(
  '/textbooks/:id/transfer',
  requireChiefAdmin,
  validateBody(z.object({ repId: z.string().uuid() })),
  asyncHandler(async (req, res) => {
    const textbookId = String(req.params.id);
    const repId = String(req.body.repId);

    if (repId === req.student.sub) {
      throw new HttpError(400, 'You already own this course');
    }

    const book = await query(
      `select id, course_code, class_rep_name, added_by, deleted_at
         from textbooks where id = $1`,
      [textbookId],
    );
    if (book.rowCount === 0) {
      throw new HttpError(404, 'Textbook not found');
    }
    if (book.rows[0].deleted_at) {
      throw new HttpError(409, 'Restore the textbook from the recycle bin first');
    }
    const oldOwnerId = String(book.rows[0].added_by);

    const rep = await query(
      `select id, full_name from students
        where id = $1 and role in ('class_rep', 'chief_admin')`,
      [repId],
    );
    if (rep.rowCount === 0) {
      throw new HttpError(404, 'That user is not a class rep');
    }
    if (repId === oldOwnerId) {
      throw new HttpError(400, 'This rep already owns the course');
    }

    const newName = String(rep.rows[0].full_name);
    await query(
      `update textbooks set added_by = $1, class_rep_name = $2 where id = $3`,
      [repId, newName, textbookId],
    );
    await query(
      `update rep_toggle_grants set rep_id = $1
        where textbook_id = $2 and rep_id = $3`,
      [repId, textbookId, oldOwnerId],
    );
    await query(
      `update payouts set rep_id = $1
        where textbook_id = $2 and rep_id = $3
          and status in ('pending', 'processing')`,
      [repId, textbookId, oldOwnerId],
    );

    const { course_code, class_rep_name } = book.rows[0];
    await query(
      `insert into notifications (student_id, type, title, body) values
        ($1, 'role', 'Course reassigned', $2),
        ($3, 'role', 'Course assigned to you', $4)`,
      [
        oldOwnerId,
        `"${course_code}" is no longer assigned to you. It was transferred to ${newName}.`,
        repId,
        `You now manage "${course_code}" (${class_rep_name}).`,
      ],
    );

    overviewCache.del('overview');
    res.json({ ok: true });
  }),
);

/** Soft-delete a textbook — hides it from students but keeps it restorable in
 * the recycle bin for 24 hours. Repeated deletes never extend the window. */
router.delete(
  '/textbooks/:id',
  asyncHandler(async (req, res) => {
    await assertCanManageTextbook(req.student, req.params.id);
    const result = await query(
      `update textbooks
          set deleted_at = coalesce(deleted_at, now())
        where id = $1`,
      [req.params.id],
    );
    if (result.rowCount === 0) {
      throw new HttpError(404, 'Textbook not found');
    }
    overviewCache.del('overview');
    res.json({ ok: true });
  }),
);

/** Recycle bin — textbooks soft-deleted within the last 24 hours. */
router.get(
  '/textbooks/deleted',
  asyncHandler(async (_req, res) => {
    await purgeExpiredDeletes();
    const result = await query(
      `select id, course_code, course_title, book_title, author, edition, price,
              isbn, department, level, lecturer_name, pickup_location,
              class_rep_name, cover_url, created_at, added_by, deleted_at
         from textbooks
        where deleted_at is not null
        order by deleted_at desc`,
    );
    res.json({ textbooks: result.rows });
  }),
);

/** Restore a soft-deleted textbook back into the live catalog. */
router.post(
  '/textbooks/:id/restore',
  asyncHandler(async (req, res) => {
    await assertCanManageTextbook(req.student, req.params.id);
    const result = await query(
      `update textbooks set deleted_at = null
        where id = $1 and deleted_at is not null
        returning id`,
      [req.params.id],
    );
    if (result.rowCount === 0) {
      throw new HttpError(404, 'Textbook not found in recycle bin');
    }
    overviewCache.del('overview');
    res.json({ ok: true });
  }),
);

/** Permanently delete a soft-deleted textbook immediately (bypasses the 24h
 * window). Cascades to student assignments. */
router.post(
  '/textbooks/:id/purge',
  asyncHandler(async (req, res) => {
    await assertCanManageTextbook(req.student, req.params.id);
    const result = await query(
      `delete from textbooks
        where id = $1 and deleted_at is not null`,
      [req.params.id],
    );
    if (result.rowCount === 0) {
      throw new HttpError(404, 'Textbook not found in recycle bin');
    }
    overviewCache.del('overview');
    res.json({ ok: true });
  }),
);

export default router;
