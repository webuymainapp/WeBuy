// Vercel serverless function — the ONLY email-sending code in the frontend.
// The backend (Render) queues rendered emails into the mail_queue table; this
// function drains that outbox and sends each email via Gmail SMTP. The local
// dev equivalent is mail/mail-worker.ts, spawned by `npm run dev`.
import type { VercelRequest, VercelResponse } from '@vercel/node';
import pg from 'pg';
import { drainMailQueue } from '../mail/drain';

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
    const result = await drainMailQueue(pool);
    res.status(200).json({ ok: true, sent: result.sent, failed: result.failed });
  } catch (err) {
    console.error('[send-verification] failed:', err);
    res.status(500).json({ error: 'Failed to send email' });
  } finally {
    await pool.end();
  }
}
