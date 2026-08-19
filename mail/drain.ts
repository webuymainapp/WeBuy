// Frontend-hosted mail sender (Gmail SMTP). Used by BOTH:
//   1. the Vercel serverless function (api/send-verification.ts) in production, and
//   2. the local mail worker (mail/mail-worker.ts) spawned by `npm run dev`.
//
// The backend (Render) only queues emails into mail_queue; this module is the
// only place nodemailer + Gmail credentials exist, so Render never sees SMTP.
import type pg from 'pg';
import nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';

const MAX_ATTEMPTS = 5;
const CLAIM_LIMIT = 25;

export interface OutboxRow {
  id: string;
  to_email: string;
  subject: string;
  text_body: string | null;
  html_body: string | null;
  attempts: number;
}

/** Build a Gmail SMTP transport, or null when credentials are missing. */
export function buildTransporter(): Transporter | null {
  const user = process.env.GMAIL_USER;
  const pass = process.env.GMAIL_APP_PASSWORD;
  if (!user || !pass) return null;
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: Number(process.env.SMTP_PORT || 465),
    secure: true,
    auth: { user, pass },
  });
}

/**
 * Claim pending/failed rows (attempts < MAX) for this drainer.
 * `FOR UPDATE SKIP LOCKED` means multiple drainers can run safely without
 * double-sending — whoever claims a row first sends it.
 */
export async function claimPending(pool: pg.Pool, limit = CLAIM_LIMIT): Promise<OutboxRow[]> {
  const res = await pool.query<OutboxRow>(
    `with claimed as (
       select id from mail_queue
        where status in ('pending', 'failed') and attempts < $1
        order by created_at
        limit $2
        for update skip locked
     )
     update mail_queue m
        set status = 'sending'
       from claimed c
      where m.id = c.id
      returning m.id, m.to_email, m.subject, m.text_body, m.html_body, m.attempts`,
    [MAX_ATTEMPTS, limit],
  );
  return res.rows;
}

async function markSent(pool: pg.Pool, id: string): Promise<void> {
  await pool.query(
    `update mail_queue
        set status = 'sent', sent_at = now(), attempts = attempts + 1, last_error = null
      where id = $1`,
    [id],
  );
}

async function markFailed(pool: pg.Pool, id: string, message: string): Promise<void> {
  await pool.query(
    `update mail_queue
        set status = case when attempts + 1 >= $2 then 'failed' else 'pending' end,
            attempts = attempts + 1,
            last_error = $3
      where id = $1`,
    [id, MAX_ATTEMPTS, message.slice(0, 500)],
  );
}

/**
 * Send one queued email. Returns true on success. Never throws — failures are
 * recorded on the row so the worker can retry (up to MAX_ATTEMPTS).
 */
export async function sendOne(
  pool: pg.Pool,
  row: OutboxRow,
  transporter: Transporter,
): Promise<boolean> {
  try {
    await transporter.sendMail({
      from: process.env.MAIL_FROM || `"Webuy" <${process.env.GMAIL_USER}>`,
      to: row.to_email,
      subject: row.subject,
      text: row.text_body ?? undefined,
      html: row.html_body ?? undefined,
    });
    await markSent(pool, row.id);
    return true;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await markFailed(pool, row.id, message);
    return false;
  }
}

/** Drain the outbox: claim, send, and record results for every pending email. */
export async function drainMailQueue(
  pool: pg.Pool,
  log: (msg: string) => void = () => undefined,
): Promise<{ configured: boolean; sent: number; failed: number }> {
  const transporter = buildTransporter();
  if (!transporter) {
    return { configured: false, sent: 0, failed: 0 };
  }
  const rows = await claimPending(pool);
  let sent = 0;
  let failed = 0;
  for (const row of rows) {
    const ok = await sendOne(pool, row, transporter);
    if (ok) {
      sent += 1;
      log(`[mail] sent → ${row.to_email} (${row.subject})`);
    } else {
      failed += 1;
      log(`[mail] FAILED → ${row.to_email} (${row.subject})`);
    }
  }
  return { configured: true, sent, failed };
}
