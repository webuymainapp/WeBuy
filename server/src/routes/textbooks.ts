import { Router } from 'express';
import { z } from 'zod';
import { query } from '../db/pool';
import { asyncHandler, HttpError } from '../lib/http';
import { validateBody } from '../lib/validate';
import { requireAuth } from '../middleware/auth';

const router = Router();

/** Public catalog — students pick books from here. */
router.get(
  '/textbooks',
  asyncHandler(async (_req, res) => {
    const result = await query(
      `select id, course_code, course_title, book_title, author, edition, price,
              isbn, department, level, lecturer_name, pickup_location,
              class_rep_name, cover_url, created_at, added_by
         from textbooks
        where deleted_at is null
        order by course_code asc`,
    );
    res.json({ textbooks: result.rows });
  }),
);

const assignSchema = z.object({ textbookId: z.string().uuid() });

/** Student picks a textbook (creates an unpaid assignment, idempotent). */
router.post(
  '/me/textbooks',
  requireAuth,
  validateBody(assignSchema),
  asyncHandler(async (req, res) => {
    const { textbookId } = req.body;

    const book = await query('select id from textbooks where id = $1', [textbookId]);
    if (book.rowCount === 0) {
      throw new HttpError(404, 'Textbook not found');
    }

    const existing = await query(
      'select id from student_textbooks where student_id = $1 and textbook_id = $2',
      [req.student.sub, textbookId],
    );
    if (existing.rowCount === 0) {
      await query(
        `insert into student_textbooks (student_id, textbook_id)
         values ($1, $2) on conflict (student_id, textbook_id) do nothing`,
        [req.student.sub, textbookId],
      );
    }
    const assigned = await query(
      'select id from student_textbooks where student_id = $1 and textbook_id = $2',
      [req.student.sub, textbookId],
    );

    res.status(201).json({ ok: true, studentTextbookId: assigned.rows[0].id });
  }),
);

/**
 * The student's dashboard = the ENTIRE catalog, with their lifecycle status
 * overlaid. A book with no student_textbooks row yet is just 'unpaid'.
 * All books available in the app are visible to every student, regardless of
 * level or department.
 */
router.get(
  '/me/textbooks',
  requireAuth,
  asyncHandler(async (req, res) => {
    const result = await query(
      `select t.id as textbook_id, t.course_code, t.course_title, t.book_title,
              t.author, t.edition, t.price, t.isbn, t.department, t.level,
              t.lecturer_name, t.pickup_location, t.class_rep_name, t.cover_url,
              st.id as student_textbook_id,
              coalesce(st.status, 'unpaid') as status,
              st.paid_at, st.collected_at, st.transaction_reference, st.pass_token
         from textbooks t
         left join student_textbooks st
           on st.textbook_id = t.id and st.student_id = $1
        where t.deleted_at is null
        order by t.course_code asc`,
      [req.student.sub],
    );
    res.json({ textbooks: result.rows });
  }),
);

/** My payment transactions with resolved book titles. */
router.get(
  '/me/transactions',
  requireAuth,
  asyncHandler(async (req, res) => {
    const [txRes, bookRes, walletRes] = await Promise.all([
      query(
        `select reference, amount, fee, total, method, status, created_at, payload
           from transactions
          where student_id = $1
          order by created_at desc
          limit 100`,
        [req.student.sub],
      ),
      query(
        `select st.id as student_textbook_id, t.course_code, t.book_title, t.price
           from student_textbooks st
           join textbooks t on t.id = st.textbook_id
          where st.student_id = $1`,
        [req.student.sub],
      ),
      query(
        `select wt.id, wt.kind, wt.amount, wt.reference, wt.note, wt.created_at
           from wallet_transactions wt
          where wt.student_id = $1
          order by wt.created_at desc
          limit 100`,
        [req.student.sub],
      ),
    ]);

    const bookMap = new Map<
      string,
      { courseCode: string; bookTitle: string; amount: number }
    >();
    for (const b of bookRes.rows) {
      bookMap.set(b.student_textbook_id, {
        courseCode: b.course_code,
        bookTitle: b.book_title,
        amount: b.price,
      });
    }

    // Resolve the textbooks paid for by each points purchase so the wallet
    // ledger can show the same per-book breakdown as card payments.
    const purchaseRefs = (walletRes.rows as Array<{ reference: string }>)
      .filter((w) => w.reference)
      .map((w) => w.reference);
    const walletBookRows = purchaseRefs.length
      ? await query(
          `select t.course_code, t.book_title, t.price, st.transaction_reference
             from student_textbooks st
             join textbooks t on t.id = st.textbook_id
            where st.student_id = $1 and st.transaction_reference = any($2::text[])
              and st.transaction_reference is not null`,
          [req.student.sub, purchaseRefs],
        )
      : { rows: [] as Array<{ course_code: string; book_title: string; price: number; transaction_reference: string }> };
    const walletBookMap = new Map<string, Array<{ courseCode: string; bookTitle: string; amount: number }>>();
    for (const w of walletBookRows.rows) {
      const key = w.transaction_reference;
      if (!walletBookMap.has(key)) walletBookMap.set(key, []);
      walletBookMap.get(key)!.push({
        courseCode: w.course_code,
        bookTitle: w.book_title,
        amount: w.price,
      });
    }

    const transactions = txRes.rows.map((t) => {
      const items: Array<{
        course_code: string;
        book_title: string;
        amount: number;
      }> = t.payload?.items ?? [];
      const ids: string[] = t.payload?.student_textbook_ids ?? [];
      const books = items.length
        ? items.map((i) => ({
            courseCode: i.course_code,
            bookTitle: i.book_title,
            amount: i.amount,
          }))
        : // Fallback for legacy rows without per-book items — use each book's
          // current catalog price.
          ids
            .map((id) => bookMap.get(id))
            .filter(Boolean) as { courseCode: string; bookTitle: string; amount: number }[];
      return {
        reference: t.reference,
        amount: t.amount,
        fee: t.fee,
        total: t.total,
        method: t.method ?? 'card',
        category: 'purchase' as const,
        direction: 'out' as const,
        status: t.status === 'success' ? 'successful' : t.status,
        createdAt: t.created_at,
        books,
        note: null,
      };
    });
    const unified: Array<{
      reference: string;
      amount: number;
      fee: number;
      total: number;
      method: string;
      category: 'purchase' | 'topup' | 'refund';
      direction: 'in' | 'out';
      status: string;
      createdAt: string;
      books: { courseCode: string; bookTitle: string; amount: number }[];
      note: string | null;
    }> = transactions;

    // Append the points wallet ledger (deposits, purchases, refunds) so the
    // student sees both naira payments and points activity in one history.
    for (const w of walletRes.rows as Array<{
      kind: string;
      amount: number;
      reference: string;
      note: string | null;
      created_at: string;
    }>) {
      const isPurchase = w.kind === 'purchase';
      unified.push({
        reference: w.reference,
        amount: Math.abs(w.amount),
        fee: 0,
        total: Math.abs(w.amount),
        method: w.kind === 'deposit' ? 'points_deposit' : isPurchase ? 'points' : 'points_refund',
        category: w.kind === 'deposit' ? 'topup' : isPurchase ? 'purchase' : 'refund',
        direction: isPurchase ? 'out' : 'in',
        status: 'successful',
        createdAt: w.created_at,
        books: isPurchase ? (walletBookMap.get(w.reference) ?? []) : [],
        note: w.note ?? null,
      });
    }

    // Newest first across both sources.
    unified.sort((a, b) =>
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );

    res.json({ transactions: unified });
  }),
);

export default router;
