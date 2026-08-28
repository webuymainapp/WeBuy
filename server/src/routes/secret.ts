import { Router } from 'express';
import { z } from 'zod';
import { query } from '../db/pool';
import { asyncHandler, HttpError } from '../lib/http';
import { validateBody } from '../lib/validate';
import { requireAuth, requireChiefAdmin } from '../middleware/auth';

/**
 * Secret marketplace. Only students flagged `market_access = true` (by the chief
 * admin) can see this. Products are deliberately only name + price. Buying spends
 * wallet points but writes NO row to `wallet_transactions` or `transactions`, so
 * a secret purchase leaves no trace on the normal transactions page — the only
 * record is a `secret_purchases` row (status 'paid').
 *
 * Pricing: the chief enters a base selling price. Webuy folds a 2% + ₦100 charge
 * on top so it stays ahead of PocketFi's funding fee (1% capped at ₦500) even on
 * the large (₦15k+) items sold here. Buyers only ever see the single all-inclusive
 * total — the fee is never shown as a breakdown.
 */

const router = Router();
router.use(requireAuth);

const FEE_PCT = 0.02;
const FEE_FLAT = 100;

function applySecretFee(base: number): number {
  return base + Math.ceil(base * FEE_PCT) + FEE_FLAT;
}

const productSchema = z.object({
  name: z.string().trim().min(1).max(160),
  price: z.number().int().min(0),
});

const buySchema = z.object({
  productId: z.string().min(1),
});

function hasMarketAccess(role: string, access: boolean): boolean {
  return role === 'chief_admin' || access;
}

/** Am I allowed into the secret marketplace? */
router.get(
  '/access',
  asyncHandler(async (req, res) => {
    const row = await query('select market_access from students where id = $1', [
      req.student.sub,
    ]);
    const access =
      req.student.role === 'chief_admin' ||
      Boolean(row.rows[0]?.market_access);
    res.json({ access });
  }),
);

/** The catalogue (only for people with access). */
router.get(
  '/products',
  asyncHandler(async (req, res) => {
    const me = await query('select market_access from students where id = $1', [
      req.student.sub,
    ]);
    if (!hasMarketAccess(req.student.role, Boolean(me.rows[0]?.market_access))) {
      throw new HttpError(403, 'No access to the secret marketplace');
    }
    const products = await query(
      `select p.id, p.name, p.base_price, p.price,
              (select point_balance from student_wallets w
                where w.student_id = $1) as points,
              exists(
                select 1 from secret_purchases sp
                where sp.student_id = $1 and sp.product_id = p.id
              ) as purchased,
              (select count(*) from secret_purchases pc
                where pc.product_id = p.id) as purchase_count
         from secret_products p
        order by p.created_at desc`,
      [req.student.sub],
    );
    res.json({ products: products.rows, points: products.rows[0]?.points ?? 0 });
  }),
);

/** My secret purchases (revealed after buying). Items fade from the buyer's view
 *  24h after purchase (one-time per item — the `purchased` flag stays permanent so
 *  they can't re-buy). The chief's full history is on /orders. */
router.get(
  '/purchases',
  asyncHandler(async (req, res) => {
    const me = await query('select market_access from students where id = $1', [
      req.student.sub,
    ]);
    if (!hasMarketAccess(req.student.role, Boolean(me.rows[0]?.market_access))) {
      throw new HttpError(403, 'No access to the secret marketplace');
    }
    const rows = await query(
      `select sp.id, sp.product_id, sp.price, sp.status, sp.paid_at, p.name
         from secret_purchases sp
         join secret_products p on p.id = sp.product_id
        where sp.student_id = $1
          and sp.paid_at >= now() - interval '24 hours'
        order by sp.paid_at desc`,
      [req.student.sub],
    );
    res.json({ purchases: rows.rows });
  }),
);

/**
 * Chief-only: every secret sale across all buyers — who bought what, when, and
 * for how many points. This is the hidden "orders" ledger.
 */
router.get(
  '/orders',
  requireChiefAdmin,
  asyncHandler(async (_req, res) => {
    const rows = await query(
      `select sp.id, sp.price, sp.status, sp.paid_at,
              sp.student_id, s.full_name, s.reg_no,
              sp.product_id, p.name as product_name
         from secret_purchases sp
         join secret_products p on p.id = sp.product_id
         join students s on s.id = sp.student_id
        order by sp.paid_at desc`,
    );
    res.json({ orders: rows.rows });
  }),
);

/**
 * Buy a secret product with wallet points. Deducts the wallet balance but writes
 * no wallet_transactions / transactions row — leaves no trace on the normal
 * transactions page. Only record is the secret_purchases row (status 'paid').
 */
router.post(
  '/buy',
  validateBody(buySchema),
  asyncHandler(async (req, res) => {
    const me = await query(
      'select market_access from students where id = $1',
      [req.student.sub],
    );
    if (!hasMarketAccess(req.student.role, Boolean(me.rows[0]?.market_access))) {
      throw new HttpError(403, 'No access to the secret marketplace');
    }

    const productId = req.body.productId;

    try {
      await query('begin');

      const product = await query(
        'select id, name, price from secret_products where id = $1',
        [productId],
      );
      if (product.rowCount === 0) {
        await query('rollback');
        throw new HttpError(404, 'Product not found');
      }
      const { name, price } = product.rows[0];

      const already = await query(
        'select 1 from secret_purchases where student_id = $1 and product_id = $2',
        [req.student.sub, productId],
      );
      if (already.rowCount && already.rowCount > 0) {
        await query('rollback');
        throw new HttpError(400, 'You already own this secret item');
      }

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
      if (balance < price) {
        await query('rollback');
        throw new HttpError(
          400,
          `This secret item costs ${price} points. You have ${balance} points.`,
        );
      }

      // Deduct points WITHOUT journaling a wallet_transaction (no trace).
      await query(
        `update student_wallets
            set point_balance = point_balance - $1, updated_at = now()
          where student_id = $2`,
        [price, req.student.sub],
      );
      await query(
        `insert into secret_purchases (student_id, product_id, price)
         values ($1, $2, $3)
         on conflict (student_id, product_id) do nothing`,
        [req.student.sub, productId, price],
      );

      const balanceAfter = await query(
        'select point_balance from student_wallets where student_id = $1',
        [req.student.sub],
      );

      await query('commit');
      res.status(200).json({
        ok: true,
        product: { id: productId, name, price },
        points: balanceAfter.rows[0].point_balance,
      });
    } catch (err) {
      await query('rollback').catch(() => undefined);
      throw err;
    }
  }),
);

/** Create a secret product — chief admin only. The posted `price` is the base
 *  selling price; Webuy folds the 2% + ₦100 charge into the stored `price` (total)
 *  that buyers pay. */
router.post(
  '/products',
  requireChiefAdmin,
  validateBody(productSchema),
  asyncHandler(async (req, res) => {
    const { name, price: base } = req.body;
    const total = applySecretFee(base);
    const result = await query(
      `insert into secret_products (name, base_price, price, created_by)
       values ($1, $2, $3, $4)
       returning id, name, base_price, price`,
      [name, base, total, req.student.sub],
    );
    res.status(201).json({ ok: true, product: result.rows[0] });
  }),
);

/** Delete a secret product — chief admin only. */
router.delete(
  '/products/:id',
  requireChiefAdmin,
  asyncHandler(async (req, res) => {
    const id = String(req.params.id);
    await query('delete from secret_products where id = $1', [id]);
    res.json({ ok: true });
  }),
);

export default router;
