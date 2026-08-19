import { Router } from 'express';
import { query } from '../db/pool';
import { asyncHandler, HttpError } from '../lib/http';
import { requireAuth } from '../middleware/auth';

const router = Router();

router.use(requireAuth);

/**
 * My notifications, newest first.
 * ?unread=1 returns only unread ones (small payload for the polling loop);
 * otherwise the default returns the latest 100 (full list on page load).
 */
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const unreadOnly = req.query.unread === '1';
    const result = await query(
      `select id, type, title, body, read, created_at
         from notifications
        where student_id = $1
          ${unreadOnly ? `and read = false` : ''}
        order by created_at desc
        limit $2`,
      [req.student.sub, unreadOnly ? 20 : 100],
    );
    res.json({ notifications: result.rows });
  }),
);

/** Mark all as read. */
router.patch(
  '/read-all',
  asyncHandler(async (req, res) => {
    await query(
      'update notifications set read = true where student_id = $1',
      [req.student.sub],
    );
    res.json({ ok: true });
  }),
);

/** Mark one as read. */
router.patch(
  '/:id/read',
  asyncHandler(async (req, res) => {
    const result = await query(
      `update notifications set read = true
        where id = $1 and student_id = $2
        returning id`,
      [req.params.id, req.student.sub],
    );
    if (result.rowCount === 0) {
      throw new HttpError(404, 'Notification not found');
    }
    res.json({ ok: true });
  }),
);

export default router;
