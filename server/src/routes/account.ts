import { Router } from 'express';
import { query } from '../db/pool';
import { asyncHandler, HttpError } from '../lib/http';
import { requireAuth, requireClassRep } from '../middleware/auth';
import { config } from '../config';
import { getPocketFiBalance } from '../lib/pocketfi';

const router = Router();

router.use(requireAuth, requireClassRep);

// The ₦100 PocketFi charge is the platform's, not a rep's — it funds PocketFi
// expenses, so it is excluded from every textbook-money figure below.
const POCKETFEE_NGN = 100;

/**
 * "Total Money for Textbooks in PocketFi" = only what students have ACTUALLY
 * spent on textbooks (paid/collected assignments), minus the ₦100 PocketFi fee
 * (which funds expenses), minus withdrawals. Money a student has merely funded
 * into their wallet but not yet used to buy a textbook is still theirs and is
 * NOT counted. The live PocketFi balance is returned separately for the chief
 * admin only.
 */
router.get(
  '/',
  asyncHandler(async (_req, res) => {
    const [bookVal, payRes, recentTx, recentWalletDep] =
      await Promise.all([
        query(
          `select coalesce(sum(greatest(t.price - $1, 0)), 0)::int as value
             from student_textbooks st
             join textbooks t on t.id = st.textbook_id
            where st.status in ('paid', 'collected')`,
          [POCKETFEE_NGN],
        ),
        query(
          `select status, coalesce(sum(amount), 0)::int as d
             from payouts
            group by status`,
        ),
        query(
          `select 'deposit' as type, total as amount, '' as note, created_at
             from transactions where status = 'success'
            order by created_at desc limit 10`,
        ),
        query(
          `select 'deposit' as type, w.amount,
                  coalesce(nullif(s.full_name, ''), 'Student') || ' (' || s.reg_no || ')' as note,
                  w.created_at
             from wallet_transactions w
             left join students s on s.id = w.student_id
            where w.kind = 'deposit'
            order by w.created_at desc
            limit 10`,
        ),
      ]);

    // Textbook money already committed by students, with the ₦100 fee removed.
    const textbookValue = bookVal.rows[0].value as number;
    // Money no longer in the bank: completed or processing payouts.
    const withdrawals = (payRes.rows as { status: string; d: number }[])
      .filter((r) => r.status === 'completed' || r.status === 'processing')
      .reduce((s, r) => s + r.d, 0);
    const balance = textbookValue - withdrawals;

    // Live PocketFi merchant balance — only surfaced to the chief admin.
    let livePocketFi: number | null = null;
    if (config.pocketfiSecret) {
      try {
        livePocketFi = await getPocketFiBalance();
      } catch {
        livePocketFi = null;
      }
    }

    const recent = [...recentTx.rows, ...recentWalletDep.rows]
      .sort(
        (a, b) =>
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
      )
      .slice(0, 12);

    res.json({
      balance,
      textbookValue,
      withdrawals,
      livePocketFi,
      recent,
    });
  }),
);

/**
 * Transaction log.
 *
 * Default view = textbook purchases: when a student uses their POINTS to buy a
 * rep's textbook, attributed to that rep. Every rep sees this.
 *
 * view=payins (chief admin ONLY, shown behind a toggle) = money moving into or
 * out of PocketFi: deposits (funded into the merchant wallet) and withdrawals
 * (payouts).
 *
 * Filters by free text (student name / reg no / rep / book) and an optional
 * date range. Paginated.
 */
router.get(
  '/transactions',
  asyncHandler(async (req, res) => {
    const view = String(req.query.view ?? 'purchases').trim() || 'purchases';
    const q = String(req.query.q ?? '').trim().slice(0, 80);
    const from = String(req.query.from ?? '').trim();
    const to = String(req.query.to ?? '').trim();
    const limit = Math.min(Math.max(parseInt(String(req.query.limit ?? '50'), 10) || 50, 1), 200);
    const offset = Math.max(parseInt(String(req.query.offset ?? '0'), 10) || 0, 0);

    const conditions: string[] = [];
    const params: unknown[] = [];
    let p = 1;

    if (q) {
      const like = `%${q}%`;
      conditions.push(
        `(m.person ilike $${p} or m.reg_no ilike $${p} or m.rep ilike $${p} or m.book ilike $${p})`,
      );
      params.push(like);
      p += 1;
    }
    if (from) {
      conditions.push(`m.source_created_at >= $${p}::timestamptz`);
      params.push(`${from}T00:00:00.000`);
      p += 1;
    }
    if (to) {
      conditions.push(`m.source_created_at < ($${p}::timestamptz + interval '1 day')`);
      params.push(`${to}T00:00:00.000`);
      p += 1;
    }
    const whereSql = conditions.length ? `where ${conditions.join(' and ')}` : '';

    if (view === 'payins') {
      if (req.student.role !== 'chief_admin') {
        throw new HttpError(403, 'Only the chief admin can view payins');
      }
      const base = `(select 'deposit' as kind, t.total as amount,
                            coalesce(s.full_name, 'Student') as person,
                            s.reg_no, t.reference, '' as rep, '' as book,
                            t.status, t.created_at as source_created_at
                       from transactions t
                       left join students s on s.id = t.student_id
                      where t.status = 'success'
                     union all
                     select 'deposit', w.amount,
                            coalesce(s.full_name, 'Student'), s.reg_no,
                            w.reference, '', '', 'success', w.created_at
                       from wallet_transactions w
                       left join students s on s.id = w.student_id
                      where w.kind = 'deposit'
                     union all
                     select 'withdrawal', p.amount, p.account_name, '',
                            p.reference, '', '', p.status, p.created_at
                       from payouts p)`;
      const merged = `select * from ${base} m ${whereSql}`;
      const result = await query(
        `${merged} order by m.source_created_at desc limit $${p} offset $${p + 1}`,
        [...params, limit, offset],
      );
      const countRes = await query(
        `select count(*)::int as total from ${base} m ${whereSql}`,
        params,
      );
      res.json({
        transactions: result.rows,
        total: countRes.rows[0].total as number,
        limit,
        offset,
      });
      return;
    }

    // Default: textbook purchases made with points, scoped to ONE rep (books
    // they added). A non-chief rep always sees their own. The chief sees their
    // own by default, and can pass ?repId= to view any other rep's log.
    const targetRep =
      req.student.role === 'chief_admin' && req.query.repId
        ? String(req.query.repId)
        : req.student.sub;
    const base = `(select 'purchase' as kind, t.price as amount,
                          coalesce(s.full_name, 'Student') as person,
                          s.reg_no,
                          coalesce(st.transaction_reference, '') as reference,
                          coalesce(rep.full_name, '') as rep,
                          t.course_code || ' · ' || t.book_title as book,
                          'success' as status,
                          coalesce(st.paid_at, st.collected_at, st.created_at) as source_created_at
                     from student_textbooks st
                     join textbooks t on t.id = st.textbook_id
                     left join students s on s.id = st.student_id
                     left join students rep on rep.id = t.added_by
                    where st.status in ('paid', 'collected')
                      and exists (
                        select 1 from wallet_transactions wt
                         where wt.kind = 'purchase'
                           and wt.reference = st.transaction_reference
                      )
                      and t.added_by = $${p})`;
    params.push(targetRep);
    const merged = `select * from ${base} m ${whereSql}`;
    const result = await query(
      `${merged} order by m.source_created_at desc limit $${p + 1} offset $${p + 2}`,
      [...params, limit, offset],
    );
    const countRes = await query(
      `select count(*)::int as total from ${base} m ${whereSql}`,
      params,
    );

    res.json({
      transactions: result.rows,
      total: countRes.rows[0].total as number,
      limit,
      offset,
    });
  }),
);

export default router;