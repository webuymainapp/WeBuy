// Mail outbox helpers.
//
// The backend NEVER sends email — Render blocks Gmail SMTP. It only writes
// "ready to send" rows to the mail_queue table. The actual sender lives in the
// frontend project (Vercel serverless function in prod, mail worker in dev),
// which owns the Gmail SMTP credentials.
import { query } from '../db/pool';

export interface OutboxMail {
  to: string;
  subject: string;
  text?: string;
  html?: string;
}

/** Add a rendered email to the outbox. A frontend-side drainer sends it. */
export async function enqueueMail(mail: OutboxMail): Promise<void> {
  await query(
    `insert into mail_queue (to_email, subject, text_body, html_body)
     values ($1, $2, $3, $4)`,
    [mail.to, mail.subject, mail.text ?? null, mail.html ?? null],
  );
}

/** Queue an email carrying the 6-digit signup verification code. */
export async function enqueueVerificationEmail(to: string, otp: string): Promise<void> {
  const textLines = [
    'Welcome to Webuy!',
    '',
    `Your verification code is ${otp}.`,
    '',
    'Enter this 6-digit code on the signup screen to activate your account.',
    'The code expires in 10 minutes. If you did not create a Webuy account, ignore this email.',
  ].join('\n');

  const html = `
      <div style="font-family:Arial,sans-serif;max-width:480px;margin:0 auto">
        <h2 style="color:#111827">Welcome to Webuy</h2>
        <p style="color:#374151">Use the code below to activate your account. Enter it on the signup screen.</p>
        <div style="margin:24px 0;padding:20px;background:#eef2ff;border-radius:12px;text-align:center">
          <span style="font-size:32px;font-weight:800;letter-spacing:8px;color:#4f46e5">${otp}</span>
        </div>
        <p style="color:#6b7280;font-size:13px">The code expires in 10 minutes. If you did not create a Webuy account, ignore this email.</p>
      </div>`;

  await enqueueMail({
    to,
    subject: 'Your Webuy verification code',
    text: textLines,
    html,
  });
}

