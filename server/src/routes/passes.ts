import { Router } from 'express';
import { z } from 'zod';
import { query } from '../db/pool';
import { asyncHandler, HttpError } from '../lib/http';
import { validateBody } from '../lib/validate';
import { requireAuth, requireClassRep } from '../middleware/auth';
import { verifyPassToken } from '../lib/jwt';

const router = Router();

router.use(requireAuth);

const verifySchema = z.object({ token: z.string().min(20) });

/** Verify a QR pass token without mutating anything (used for preview/scans). */
router.post(
  '/verify',
  validateBody(verifySchema),
  asyncHandler(async (req, res) => {
    let decoded: ReturnType<typeof verifyPassToken>;
    try {
      decoded = verifyPassToken(req.body.token);
    } catch {
      res.status(200).json({ valid: false, reason: 'forged_or_expired' });
      return;
    }

    const row = await query(
      `select st.id, st.status, st.student_id, st.textbook_id,
              s.full_name, s.reg_no, s.department, s.level,
              t.course_code, t.book_title, t.pickup_location
         from student_textbooks st
         join students s on s.id = st.student_id
         join textbooks t on t.id = st.textbook_id
        where st.id = $1`,
      [decoded.sub],
    );
    if (row.rowCount === 0) {
      res.json({ valid: false, reason: 'not_found' });
      return;
    }
    const r = row.rows[0];
    res.json({
      valid: true,
      studentTextbookId: r.id,
      status: r.status,
      student: {
        id: r.student_id,
        fullName: r.full_name,
        regNo: r.reg_no,
        department: r.department,
        level: r.level,
      },
      book: { courseCode: r.course_code, title: r.book_title },
      pickupLocation: r.pickup_location,
    });
  }),
);

const collectSchema = z.object({
  token: z.string().min(20),
  location: z.string().trim().max(200).optional(),
});

/** Scan-and-collect: verifies the pass, then marks the book collected. */
router.post(
  '/collect',
  requireClassRep,
  validateBody(collectSchema),
  asyncHandler(async (req, res) => {
    let decoded: ReturnType<typeof verifyPassToken>;
    try {
      decoded = verifyPassToken(req.body.token);
    } catch {
      throw new HttpError(400, 'Invalid or expired pass');
    }

    // Reps can only collect passes for textbooks they added — including the
    // chief admin, who must own the book to mark it collected.
    const owner = await query(
      `select t.added_by, st.textbook_id
         from student_textbooks st
         join textbooks t on t.id = st.textbook_id
        where st.id = $1`,
      [decoded.sub],
    );
    if (owner.rowCount === 0) {
      throw new HttpError(404, 'Pass not found');
    }
    if ((owner.rows[0].added_by as string | null) !== req.student.sub) {
      throw new HttpError(403, 'You can only collect textbooks you added');
    }

    // Collection consumes a slot: a rep can only mark as many students
    // collected as copies they've had settled (plus grants).
    const textbookId = owner.rows[0].textbook_id as string;
    const slots = await query(
      `select
         coalesce((select sum(copies) from payouts where textbook_id = $2 and status = 'completed'), 0)::int as settled,
         coalesce((select count(*) from student_textbooks where textbook_id = $2 and status = 'collected'), 0)::int as collected,
         coalesce((select sum(copies) from rep_toggle_grants where textbook_id = $2 and rep_id = $1), 0)::int as granted`,
      [req.student.sub, textbookId],
    );
    if (slots.rows[0].settled - slots.rows[0].collected + slots.rows[0].granted <= 0) {
      throw new HttpError(
        409,
        'No collection slots left for this course. You can only mark collected as many students as copies you have had settled — settle a payout or ask the chief admin to grant more.',
      );
    }

    const updated = await query(
      `update student_textbooks st
          set status = 'collected', collected_at = coalesce(collected_at, now())
        where st.id = $1 and st.status = 'paid'
        returning st.id, st.student_id`,
      [decoded.sub],
    );
    if (updated.rowCount === 0) {
      const exists = await query('select status from student_textbooks where id = $1', [
        decoded.sub,
      ]);
      if (exists.rowCount === 0) {
        throw new HttpError(404, 'Pass not found');
      }
      if (exists.rows[0].status === 'collected') {
        throw new HttpError(409, 'Already collected');
      }
      throw new HttpError(409, 'Not paid yet');
    }

    const st = updated.rows[0];
    const location = req.body.location ?? 'Lecture hall';
    await query(
      `insert into collections (student_textbook_id, scanned_by, location)
       values ($1, $2, $3)`,
      [st.id, req.student.sub, location],
    );
    await query(
      `insert into notifications (student_id, type, title, body)
       values ($1, 'collection', 'Textbook collected', $2)`,
      [st.student_id, `Your textbook was marked as collected at ${location}.`],
    );

    res.json({ ok: true, collectedAt: new Date().toISOString() });
  }),
);

export default router;
