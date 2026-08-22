// Vercel serverless function — drains mail_queue and sends via Gmail SMTP.
// Self-contained (no cross-directory imports) to avoid Vercel ESM resolution issues.
import type { VercelRequest, VercelResponse } from '@vercel/node';
import pg from 'pg';
import nodemailer from 'nodemailer';

const MAX_ATTEMPTS = 5;
const CLAIM_LIMIT = 25;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    res.status(500).json({ error: 'DATABASE_URL not configured' });
    return;
  }
  if (!process.env.GMAIL_USER || !process.env.GMAIL_APP_PASSWORD) {
    res.status(500).json({ error: 'SMTP not configured' });
    return;
  }

  const pool = new pg.Pool({
    connectionString,
    ssl: { rejectUnauthorized: false },
    max: 2,
  });

  try {
    const transporter = nodemailer.createTransport({
      host: 'smtp.gmail.com',
      port: 465,
      secure: true,
      auth: { user: process.env.GMAIL_USER, pass: process.env.GMAIL_APP_PASSWORD },
    });

    // Claim pending/failed rows
    const { rows } = await pool.query(
      `WITH claimed AS (
         SELECT id FROM mail_queue
          WHERE status IN ('pending','failed') AND attempts < $1
          ORDER BY created_at LIMIT $2
          FOR UPDATE SKIP LOCKED
       )
       UPDATE mail_queue m SET status = 'sending'
         FROM claimed c WHERE m.id = c.id
         RETURNING m.id, m.to_email, m.subject, m.text_body, m.html_body, m.attempts`,
      [MAX_ATTEMPTS, CLAIM_LIMIT],
    );

    let sent = 0;
    let failed = 0;

    for (const row of rows) {
      try {
        await transporter.sendMail({
          from: process.env.MAIL_FROM || `"Webuy" <${process.env.GMAIL_USER}>`,
          to: row.to_email,
          subject: row.subject,
          text: row.text_body ?? undefined,
          html: row.html_body ?? undefined,
        });
        await pool.query(
          `UPDATE mail_queue SET status='sent', sent_at=now(), attempts=attempts+1, last_error=null WHERE id=$1`,
          [row.id],
        );
        sent++;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        await pool.query(
          `UPDATE mail_queue
             SET status = CASE WHEN attempts+1 >= $2 THEN 'failed' ELSE 'pending' END,
                 attempts = attempts+1, last_error = $3
           WHERE id = $1`,
          [row.id, MAX_ATTEMPTS, msg.slice(0, 500)],
        );
        failed++;
      }
    }

    res.status(200).json({ ok: true, sent, failed });
  } catch (err) {
    console.error('[send-verification] failed:', err);
    res.status(500).json({ error: 'Failed to send email' });
  } finally {
    await pool.end();
  }
}
