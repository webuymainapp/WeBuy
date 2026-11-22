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

// Respond 200 fast, but only after verifying the signature. Deposits are never
// auto-credited here; manual /api/wallet/verify is the only credit path.
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