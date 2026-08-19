import { Router } from 'express';
import { z } from 'zod';
import { query } from '../db/pool';
import { asyncHandler, HttpError } from '../lib/http';
import { validateBody } from '../lib/validate';
import { requireAuth } from '../middleware/auth';
import { signPassToken } from '../lib/jwt';
import {
  createPocketFiVirtualAccount,
  makeDepositReference,
  fetchVirtualAccountsFunds,
} from '../lib/pocketfi';
import type { AuthTokenPayload } from '../lib/jwt';

const router = Router();
router.use(requireAuth);

/**
 * Ensure the student's wallet row + virtual account exist. Idempotent. Returns
 * a `fundingError` (instead of throwing) when a funding account can't be
 * provisioned — e.g. the student has no phone number, which PocketFi requires —
 * so the wallet page can still show points and prompt the student to fix it.
 */
interface WalletResult {
  point_balance: number;
  virtual_account_no: string;
  virtual_bank_name: string;
  virtual_account_name: string;
  fundingError: string | null;
}

/** A pre-keys mock VA (bank named MOCK BANK / non-numeric number) must be
 * replaced with a real PocketFi account now that keys are configured. */
function isMockVirtualAccount(row: {
  virtual_bank_name: string;
  virtual_account_no: string;
}): boolean {
  const bank = row.virtual_bank_name ?? '';
  const acct = row.virtual_account_no ?? '';
  return /mock/i.test(bank) || !/^\d{8,10}$/.test(acct);
}

async function ensureWallet(student: AuthTokenPayload): Promise<WalletResult> {
  let row = await query(
    `select point_balance, virtual_account_no, virtual_bank_name, virtual_account_name
       from student_wallets where student_id = $1`,
    [student.sub],
  );
  if (row.rowCount === 0) {
    await query(
      `insert into student_wallets (student_id) values ($1)
       on conflict (student_id) do nothing`,
      [student.sub],
    );
    row = await query(
      `select point_balance, virtual_account_no, virtual_bank_name, virtual_account_name
         from student_wallets where student_id = $1`,
      [student.sub],
    );
  }
  const hasMock = isMockVirtualAccount({
    virtual_bank_name: (row.rows[0].virtual_bank_name as string) ?? '',
    virtual_account_no: (row.rows[0].virtual_account_no as string) ?? '',
  });
  let fundingError: string | null = null;
  if (!row.rows[0].virtual_account_no || hasMock) {
    const me = await query(
      'select id, email, full_name, reg_no, phone from students where id = $1',
      [student.sub],
    );
    const profile = me.rows[0];

    if (!profile.phone) {
      fundingError =
        'Add your phone number in Settings to activate your funding account.';
    } else {
      try {
        const vac = await createPocketFiVirtualAccount({
          studentId: student.sub,
          email: profile.email,
          fullName: profile.full_name,
          regNo: profile.reg_no,
          phone: profile.phone,
        });
        await query(
          `update student_wallets
              set virtual_account_no = $1, virtual_bank_name = $2,
                  virtual_account_name = $3, virtual_customer_id = $4,
                  updated_at = now()
            where student_id = $5`,
          [vac.accountNumber, vac.bankName, vac.accountName, vac.customerId, student.sub],
        );
        row = await query(
          `select point_balance, virtual_account_no, virtual_bank_name, virtual_account_name
             from student_wallets where student_id = $1`,
          [student.sub],
        );
      } catch (err) {
        fundingError =
          err instanceof Error && err.message
            ? err.message
            : 'Could not create your funding account. Try again later.';
      }
    }
  }
  return {
    point_balance: (row.rows[0].point_balance as number) ?? 0,
    virtual_account_no: (row.rows[0].virtual_account_no as string) ?? '',
    virtual_bank_name: (row.rows[0].virtual_bank_name as string) ?? '',
    virtual_account_name: (row.rows[0].virtual_account_name as string) ?? '',
    fundingError,
  };
}

const phoneSchema = z.object({
  phone: z.string().trim().min(10).max(20),
});

/**
 * Set (or change) my phone number. Adding the first number is free; a later
 * change costs 200 points, deducted atomically with the phone update. After
 * the phone is saved the funding account is (re)provisioned and the fresh
 * wallet is returned so the UI can drop the "Add phone number" banner.
 */
router.post(
  '/phone',
  validateBody(phoneSchema),
  asyncHandler(async (req, res) => {
    const phone = req.body.phone.replace(/\D/g, '');
    if (phone.length < 10) {
      throw new HttpError(400, 'Enter a valid 10–11 digit phone number.');
    }

    let changed = false;
    try {
      await query('begin');

      const me = await query(
        'select phone from students where id = $1 for update',
        [req.student.sub],
      );
      const existing = (me.rows[0]?.phone as string | null) ?? '';
      if (existing !== phone) {
        if (existing) {
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
          const balance = wallet.rows[0].point_balance as number;
          if (balance < 200) {
            await query('rollback');
            throw new HttpError(
              400,
              `Changing your phone number costs 200 points. You have ${balance} points.`,
            );
          }
          const feeReference = makeDepositReference();
          await query(
            `update student_wallets
                set point_balance = point_balance - 200, updated_at = now()
              where student_id = $1`,
            [req.student.sub],
          );
          await query(
            `insert into wallet_transactions (student_id, kind, amount, reference, note)
             values ($1, 'purchase', -200, $2, 'Phone number change fee (200 pts)')`,
            [req.student.sub, feeReference],
          );
        }
        await query('update students set phone = $1 where id = $2', [
          phone,
          req.student.sub,
        ]);
        changed = true;
      }
      await query('commit');
    } catch (err) {
      await query('rollback').catch(() => undefined);
      throw err;
    }

    if (!changed) {
      const wallet = await ensureWallet(req.student);
      res.json({ ok: true, phone, already: true, ...toWalletJson(wallet) });
      return;
    }

    const wallet = await ensureWallet(req.student);
    const txns = await query(
      `select id, kind, amount, reference, note, created_at
         from wallet_transactions where student_id = $1
        order by created_at desc limit 50`,
      [req.student.sub],
    );
    res.json({ ok: true, phone, ...toWalletJson(wallet), transactions: txns.rows });
  }),
);

function toWalletJson(wallet: WalletResult) {
  return {
    points: wallet.point_balance as number,
    accountNumber: wallet.virtual_account_no as string,
    bankName: wallet.virtual_bank_name as string,
    accountName: wallet.virtual_account_name as string,
    fundingError: wallet.fundingError,
  };
}

/** My wallet: points, funding account, point history. */
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const wallet = await ensureWallet(req.student);
    const txns = await query(
      `select id, kind, amount, reference, note, created_at
         from wallet_transactions where student_id = $1
        order by created_at desc limit 50`,
      [req.student.sub],
    );
    res.json({
      ...toWalletJson(wallet),
      transactions: txns.rows,
    });
  }),
);

/** Provision my virtual account (idempotent). */
router.get(
  '/provision',
  asyncHandler(async (req, res) => {
    const wallet = await ensureWallet(req.student);
    res.json({ ok: true, ...toWalletJson(wallet) });
  }),
);

/**
 * Reconcile my points against PocketFi's authoritative per-VA funded total.
 * Credits the difference between `total_fund` and the sum of deposits already
 * recorded — so pressing "Verify" after a transfer tops up the balance even
 * when the webhook never fired. Idempotent: repeating it credits nothing.
 */
router.post(
  '/verify',
  asyncHandler(async (req, res) => {
    const wallet = await ensureWallet(req.student);
    if (!wallet.virtual_account_no) {
      res.json({ ok: true, credited: 0, ...toWalletJson(wallet), transactions: [] });
      return;
    }

    const funds = await fetchVirtualAccountsFunds();
    const mine = funds.find(
      (f) => f.accountNumber === wallet.virtual_account_no,
    );
    const totalFund = mine?.totalFund ?? 0;

    let credited = 0;
    try {
      await query('begin');
      // Lock the wallet row so concurrent reconcile calls serialize. Without
      // this, two parallel requests can both read the same "already credited"
      // sum and each insert a deposit for the full delta with a fresh
      // reference — double-crediting the same funding.
      await query(
        `insert into student_wallets (student_id) values ($1)
         on conflict (student_id) do nothing`,
        [req.student.sub],
      );
      await query(
        'select point_balance from student_wallets where student_id = $1 for update',
        [req.student.sub],
      );

      const creditedRes = await query(
        `select coalesce(sum(amount), 0)::int as credited
           from wallet_transactions
          where student_id = $1 and kind = 'deposit'`,
        [req.student.sub],
      );
      const alreadyCredited = creditedRes.rows[0].credited as number;
      const delta = totalFund - alreadyCredited;

      if (delta > 0) {
        const reference = makeDepositReference();
        const ins = await query(
          `insert into wallet_transactions (student_id, kind, amount, reference, note)
           values ($1, 'deposit', $2, $3, $4)`,
          [
            req.student.sub,
            delta,
            reference,
            `Verified funding for ${wallet.virtual_account_no}`,
          ],
        );
        if (ins.rowCount === 1) {
          await query(
            `update student_wallets
                set point_balance = point_balance + $1, updated_at = now()
              where student_id = $2`,
            [delta, req.student.sub],
          );
          credited = delta;
        }
      }
      await query('commit');
    } catch (err) {
      await query('rollback').catch(() => undefined);
      throw err;
    }

    const fresh = await ensureWallet(req.student);
    const txns = await query(
      `select id, kind, amount, reference, note, created_at
         from wallet_transactions where student_id = $1
        order by created_at desc limit 50`,
      [req.student.sub],
    );
    res.json({
      ok: true,
      credited,
      totalFund,
      ...toWalletJson(fresh),
      transactions: txns.rows,
    });
  }),
);

const checkoutSchema = z.object({
  studentTextbookIds: z.array(z.string().uuid()).min(1).max(99),
});

/**
 * Check out assigned textbooks using points. Atomic + idempotent: locks the
 * wallet and the assignments so a double submit can't double-charge or double
 * spend. Only unpaid (status='unpaid') books are ever charged.
 */
router.post(
  '/checkout',
  validateBody(checkoutSchema),
  asyncHandler(async (req, res) => {
    const ids = req.body.studentTextbookIds;

    try {
      await query('begin');

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
      const balance = wallet.rows[0].point_balance as number;

      const books = await query(
        `select st.id, t.book_title, t.course_code, t.price
           from student_textbooks st
           join textbooks t on t.id = st.textbook_id
          where st.student_id = $1 and st.id = any($2::uuid[])
            and st.status = 'unpaid'
            for update of st`,
        [req.student.sub, ids],
      );
      const payable = books.rows as Array<{
        id: string;
        book_title: string;
        course_code: string;
        price: number;
        status: string;
      }>;
      const total = payable.reduce((s, b) => s + b.price, 0);

      if (payable.length === 0) {
        await query('rollback');
        throw new HttpError(409, 'No unpaid textbooks to pay.');
      }
      if (total > balance) {
        await query('rollback');
        throw new HttpError(
          400,
          `Insufficient points. You need ${total} points (you have ${balance}). Fund your account first.`,
        );
      }

      const reference = makeDepositReference();
      await query(
        `update student_wallets
            set point_balance = point_balance - $1, updated_at = now()
          where student_id = $2`,
        [total, req.student.sub],
      );

      for (const paid of payable) {
        await query(
          `update student_textbooks
              set status = 'paid', paid_at = now(),
                  transaction_reference = $1,
                  pass_token = $2
            where id = $3 and student_id = $4`,
          [
            reference,
            signPassToken({ sub: paid.id, book: paid.book_title, course: paid.course_code }),
            paid.id,
            req.student.sub,
          ],
        );
      }

      await query(
        `insert into wallet_transactions (student_id, kind, amount, reference, note)
         values ($1, 'purchase', $2, $3, $4)`,
        [
          req.student.sub,
          -total,
          reference,
          `Paid for ${payable.length} textbook${payable.length === 1 ? '' : 's'} with points`,
        ],
      );

      await query('commit');
      res.json({
        ok: true,
        spent: total,
        remaining: balance - total,
        reference,
        paidIds: payable.map((b) => b.id),
      });
    } catch (err) {
      await query('rollback').catch(() => undefined);
      throw err;
    }
  }),
);

export default router;