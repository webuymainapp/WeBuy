import { Router } from 'express';
import { z } from 'zod';
import { query } from '../db/pool';
import { asyncHandler, HttpError } from '../lib/http';
import { validateBody } from '../lib/validate';
import { requireAuth } from '../middleware/auth';

const router = Router();
router.use(requireAuth);

const refundRequestSchema = z.object({
  studentTextbookId: z.string().uuid(),
  reason: z.string().trim().max(500).optional(),
});

/**
 * A student requests a refund on a textbook they have PAID for (and not yet
 * collected). The owning rep (or chief admin) approves or rejects it later —
 * points are only credited back on approval. Only books the rep has opened for
 * refunds (`refunds_open`) can be requested, and a book can only have one
 * pending request at a time.
 */
router.post(
  '/',
  validateBody(refundRequestSchema),
  asyncHandler(async (req, res) => {
    const { studentTextbookId, reason } = req.body as {
      studentTextbookId: string;
      reason?: string;
    };

    const assignment = await query(
      `select st.id, st.status,
              s.full_name, s.reg_no,
              t.id as textbook_id, t.course_code, t.course_title, t.book_title,
              t.price, t.service_fee, t.refunds_open, t.added_by
         from student_textbooks st
         join students s on s.id = st.student_id
         join textbooks t on t.id = st.textbook_id
        where st.id = $1 and st.student_id = $2`,
      [studentTextbookId, req.student.sub],
    );
    if (assignment.rowCount === 0) {
      throw new HttpError(404, 'Textbook assignment not found');
    }
    const row = assignment.rows[0] as {
      id: string;
      status: string;
      full_name: string;
      reg_no: string;
      textbook_id: string;
      course_code: string;
      course_title: string;
      book_title: string;
      price: number;
      service_fee: number;
      refunds_open: boolean;
      added_by: string | null;
    };

    if (row.status !== 'paid') {
      throw new HttpError(
        409,
        row.status === 'collected'
          ? `You already collected your ${row.course_code} textbook — refunds are only available before pickup.`
          : 'You can only request a refund for a textbook you have paid for.',
      );
    }
    if (!row.refunds_open) {
      throw new HttpError(
        403,
        `Refunds are currently closed for ${row.course_code}. The class rep controls when refunds are available.`,
      );
    }
    const existing = await query(
      `select id from refund_requests
        where student_textbook_id = $1 and status = 'pending'`,
      [row.id],
    );
    if ((existing.rowCount ?? 0) > 0) {
      throw new HttpError(
        409,
        `You already have a pending refund request for ${row.course_code}. The class rep will review it.`,
      );
    }

    const amount = Math.max(row.price - row.service_fee, 0);
    if (amount <= 0) {
      throw new HttpError(400, 'This textbook has no refundable value.');
    }

    const inserted = await query(
      `insert into refund_requests
         (student_id, student_textbook_id, textbook_id, amount, reason)
       values ($1, $2, $3, $4, $5)
       returning id, amount, status, created_at`,
      [
        req.student.sub,
        row.id,
        row.textbook_id,
        amount,
        reason?.trim() || null,
      ],
    );

    // Disturb the owning rep in-app so a refund request is never left unseen.
    if (row.added_by) {
      await query(
        `insert into notifications (student_id, type, title, body)
         values ($1, 'refund', 'Refund requested', $2)`,
        [
          row.added_by,
          `${row.full_name} (${row.reg_no}) requested a ${amount}pt refund for ${row.course_code} — ${row.book_title}.`,
        ],
      );
    }

    res.status(201).json({ ok: true, refund: inserted.rows[0] });
  }),
);

/** My refund requests, newest first, with their current status. */
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const result = await query(
      `select rr.id, rr.amount, rr.reason, rr.status, rr.review_note,
              rr.reviewed_at, rr.created_at,
              t.course_code, t.course_title, t.book_title
         from refund_requests rr
         join textbooks t on t.id = rr.textbook_id
        where rr.student_id = $1
        order by rr.created_at desc
        limit 100`,
      [req.student.sub],
    );
    res.json({ refunds: result.rows });
  }),
);

export default router;