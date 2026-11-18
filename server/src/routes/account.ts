import { Router } from 'express';
import { query } from '../db/pool';
import { asyncHandler, HttpError } from '../lib/http';
import { requireAuth, requireClassRep } from '../middleware/auth';
import { config } from '../config';
import { getPocketFiBalance } from '../lib/pocketfi';

const router = Router();

router.use(requireAuth, requireClassRep);

/**
 * "Total Money for Textbooks in PocketFi" = only what students have ACTUALLY
 * spent on textbooks (paid/collected assignments), minus the per-book PocketFi
 * service fee stored on each textbook (which funds expenses), minus withdrawals.
 * Money a student has merely funded
 * into their wallet but not yet used to buy a textbook is still theirs and is
 * NOT counted. The live PocketFi balance is returned separately for the chief
 * admin only.
 *
 * Scoping: a non-chief rep only ever sees the textbook value and withdrawals for
 * books THEY added (matching /revenue). The chief admin sees the platform-wide
 * totals. This prevents a rep from seeing or calculating other reps' money.
 */
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const isChief = req.student.role === 'chief_admin';
    const repScopeParams: unknown[] = isChief ? [] : [req.student.sub];
    const bookScope = isChief ? '' : 'and t.added_by = $1';
    const payScope = isChief ? '' : 'and rep_id = $1';

    const [bookVal, payRes] = await Promise.all([
      query(
        `select coalesce(sum(greatest(t.price - t.service_fee, 0)), 0)::int as value
           from student_textbooks st
           join textbooks t on t.id = st.textbook_id
          where st.status in ('paid', 'collected')
            ${bookScope}`,
        repScopeParams,
      ),
      query(
        `select
           coalesce(sum(amount) filter (where textbook_id is not null), 0)::int as linked,
           coalesce(sum(amount) filter (where textbook_id is null), 0)::int as unlinked
           from payouts
          where status in ('completed', 'processing')
            ${payScope}`,
        repScopeParams,
      ),
    ]);

    // Textbook money already committed by students, with the per-book service fee removed.
    const textbookValue = bookVal.rows[0].value as number;
    // Withdrawals only reduce the balance when they can be matched to a course
    // that still exists (textbook_id set) — that keeps the net apples-to-apples.
    // Payouts with textbook_id NULL are untraceable: the course was hard-deleted
    // (its paid assignments cascade-deleted, so their earnings aren't in
    // textbookValue either) or the payout predates the link. Netting those would
    // fabricate an "over-withdrawal", so they're reported separately instead.
    const withdrawals = (payRes.rows[0].linked as number) ?? 0;
    const untraceableWithdrawals = (payRes.rows[0].unlinked as number) ?? 0;
    const balance = Math.max(textbookValue - withdrawals, 0);

    // Live PocketFi merchant balance — only surfaced to the chief admin.
    let livePocketFi: number | null = null;
    if (isChief && config.pocketfiSecret) {
      try {
        livePocketFi = await getPocketFiBalance();
      } catch {
        livePocketFi = null;
      }
    }

    // Total unspent points across every student's wallet — how much of the
    // money funded in is still sitting in student wallets, not yet spent on
    // textbooks. Chief admin only.
    let userWallets = 0;
    if (isChief) {
      const wallets = await query(
        'select coalesce(sum(point_balance), 0)::int as total from student_wallets',
      );
      userWallets = wallets.rows[0].total as number;
    }

    // Recent deposit feed is platform-wide (student names + amounts), so only
    // the chief admin gets it — skip the queries entirely for reps (privacy +
    // egress saving).
    let recent: { type: string; amount: number; note: string; created_at: string }[] = [];
    if (isChief) {
      const [recentTx, recentWalletDep] = await Promise.all([
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
      recent = [
        ...(recentTx.rows as { type: string; amount: number; note: string; created_at: string }[]),
        ...(recentWalletDep.rows as { type: string; amount: number; note: string; created_at: string }[]),
      ]
        .sort(
          (a, b) =>
            new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
        )
        .slice(0, 12);
    }

    res.json({
      balance,
      textbookValue,
      withdrawals,
      untraceableWithdrawals,
      livePocketFi,
      userWallets,
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