// PocketFi webhook — receives payout/payment status events from PocketFi and
// reconciles our local payouts table (pending -> processing -> completed/failed).
import { Router } from 'express';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { query } from '../db/pool';
import { asyncHandler, HttpError } from '../lib/http';
import { config } from '../config';

const router = Router();

/** Small introspection so the frontend can tell the operator the webhook URL. */
router.get(
  '/config',
  asyncHandler(async (_req, res) => {
    const publicBase = config.pocketfiWebhookPublicBase || config.appUrl;
    res.json({
      webhookUrl: `${publicBase.replace(/\/$/, '')}/api/pocketfi`,
      configured: Boolean(config.pocketfiSecret),
      mock: !config.pocketfiSecret,
      baseUrl: config.pocketfiBase,
    });
  }),
);

/**
 * Verified status values PocketFi may send. We map any non-terminal to what the
 * schema understands; 'reversed' behaves like failed (money came back upstream).
 */
function mapStatus(raw: unknown): 'processing' | 'completed' | 'failed' {
  const s = String(raw ?? '').toLowerCase();
  if (['success', 'completed', 'sent', 'settled'].includes(s)) return 'completed';
  if (['failed', 'rejected', 'declined', 'reversed', 'cancelled', 'canceled'].includes(s)) {
    return 'failed';
  }
  return 'processing';
}

function verifySignature(rawBody: Buffer, signature: string): boolean {
  const expected = createHmac('sha512', config.pocketfiSecret)
    .update(rawBody)
    .digest('hex');
  const a = Buffer.from(signature, 'utf8');
  const b = Buffer.from(expected, 'utf8');
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Credit a student's points when a deposit lands in their virtual account.
 * Idempotent: the wallet_transactions.reference unique constraint means a
 * retried webhook can never double-credit. Returns true if a student matched.
 */
async function applyDeposit(data: Record<string, unknown>): Promise<boolean> {
  // Wherever PocketFi puts the funding account — defensive across shapes.
  const accountNo = String(
    data.account ??
      (data.order as Record<string, unknown> | undefined)?.account ??
      (data.data as Record<string, unknown> | undefined)?.account ??
      (data.virtual_account as Record<string, unknown> | undefined)?.account_number ??
      '',
  ).trim();
  const reference = String(
    (data.transaction as Record<string, unknown> | undefined)?.reference ??
      data.reference ??
      '',
  ).trim();
  // amount in naira (they send floats, e.g. 5000.00). settlement_amount is what
  // actually landed after their fee.
  const amountRaw =
    (data.order as Record<string, unknown> | undefined)?.settlement_amount ??
    (data.order as Record<string, unknown> | undefined)?.amount ??
    data.amount ??
    0;
  const points = Math.floor(Number(amountRaw));

  if (!accountNo || !reference || !points || points <= 0) return false;

  const wallet = await query(
    'select student_id from student_wallets where virtual_account_no = $1',
    [accountNo],
  );
  if (wallet.rowCount === 0) return false;
  const studentId = wallet.rows[0].student_id as string;

  try {
    await query('begin');
    // Unique reference makes this idempotent across retries.
    const ins = await query(
      `insert into wallet_transactions (student_id, kind, amount, reference, note)
       values ($1, 'deposit', $2, $3, $4)`,
      [studentId, points, reference, `Funded account ${accountNo}`],
    );
    if (ins.rowCount === 1) {
      await query(
        `insert into student_wallets (student_id, point_balance)
         values ($1, $2)
         on conflict (student_id)
         do update set point_balance = student_wallets.point_balance + excluded.point_balance,
                       updated_at = now()`,
        [studentId, points],
      );
    }
    await query('commit');
    return true;
  } catch (err) {
    await query('rollback').catch(() => undefined);
    // Unique violation => already processed (retry). Otherwise surface.
    if (
      err instanceof Error &&
      /duplicate key value violates unique constraint/.test(err.message)
    ) {
      return true;
    }
    throw err;
  }
}

// Respond 200 fast, but only after verifying the signature. Two event kinds:
//  1. payout: reconciles the payouts table by reference.
//  2. deposit: credits a student's points by their virtual account number.
router.post(
  '/',
  asyncHandler(async (req, res) => {
    if (!config.pocketfiSecret) {
      throw new HttpError(503, 'PocketFi is not configured');
    }
    const signature = String(req.headers['http_pocketfi_signature'] ?? '');
    const rawBody = (req as Express.Request & { rawBody?: Buffer }).rawBody;
    if (!rawBody || !signature) {
      throw new HttpError(400, 'Missing signature or body');
    }
    if (!verifySignature(rawBody, signature)) {
      throw new HttpError(401, 'Invalid signature');
    }

    const data = JSON.parse(rawBody.toString('utf8')) as Record<string, unknown>;
    const reference = String(
      (data.transaction as Record<string, unknown> | undefined)?.reference ??
        data.reference ??
        '',
    );

    // Deposits into a student's virtual account -> points.
    if (await applyDeposit(data)) {
      res.json({ status: true });
      return;
    }

    // Payout status reconciliation by reference.
    if (!reference) {
      res.json({ status: true });
      return;
    }
    const rawStatus = String(
      (data.transaction as Record<string, unknown> | undefined)?.status ??
        (data.order as Record<string, unknown> | undefined)?.status ??
        data.status ??
        '',
    );
    const status = mapStatus(rawStatus);

    await query(
      `with target as (
         select id from payouts where reference = $1 and status not in ('completed', 'failed')
       ),
       update_payout as (
         update payouts
            set status = $2, updated_at = now(),
                failure_reason = case when $2 = 'failed' then $3 else failure_reason end
          where id = (select id from target)
          returning id
       )
       select id from update_payout`,
      [reference, status, rawStatus ? `PocketFi: ${rawStatus}` : null],
    );

    res.json({ status: true });
  }),
);

export default router;