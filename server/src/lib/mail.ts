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

/** Queue an email carrying a one-time signup verification link. */
export async function enqueueVerificationEmail(to: string, link: string): Promise<void> {
  const textLines = [
    'Welcome to Webuy!',
    '',
    'Click the button below (or copy the link) to activate your account:',
    '',
    link,
    '',
    'The link expires in 24 hours. If you did not create a Webuy account, ignore this email.',
  ].join('\n');

  const html = `
      <div style="font-family:Arial,sans-serif;max-width:480px;margin:0 auto">
        <h2 style="color:#111827">Welcome to Webuy</h2>
        <p style="color:#374151">Click the button below to activate your account and start shopping.</p>
        <div style="margin:24px 0;text-align:center">
          <a href="${link}" style="background:#4f46e5;color:#ffffff;padding:14px 28px;border-radius:12px;font-weight:800;text-decoration:none;display:inline-block">Verify my email</a>
        </div>
        <p style="color:#6b7280;font-size:13px">Or copy this link into your browser:</p>
        <p style="color:#4f46e5;font-size:12px;word-break:break-all">${link}</p>
        <p style="color:#6b7280;font-size:13px">The link expires in 24 hours. If you did not create a Webuy account, ignore this email.</p>
      </div>`;

  await enqueueMail({
    to,
    subject: 'Verify your Webuy email',
    text: textLines,
    html,
  });
}

/** Queue an email carrying a one-time password-reset link. */
export async function enqueuePasswordResetEmail(to: string, link: string): Promise<void> {
  const textLines = [
    'Reset your Webuy password',
    '',
    'Click the button below (or copy the link) to choose a new password:',
    '',
    link,
    '',
    'The link expires in 24 hours. If you did not request a password reset, ignore this email.',
  ].join('\n');

  const html = `
      <div style="font-family:Arial,sans-serif;max-width:480px;margin:0 auto">
        <h2 style="color:#111827">Reset your Webuy password</h2>
        <p style="color:#374151">Click the button below to set a new password for your account.</p>
        <div style="margin:24px 0;text-align:center">
          <a href="${link}" style="background:#4f46e5;color:#ffffff;padding:14px 28px;border-radius:12px;font-weight:800;text-decoration:none;display:inline-block">Reset password</a>
        </div>
        <p style="color:#6b7280;font-size:13px">Or copy this link into your browser:</p>
        <p style="color:#4f46e5;font-size:12px;word-break:break-all">${link}</p>
        <p style="color:#6b7280;font-size:13px">The link expires in 24 hours. If you did not request a password reset, ignore this email.</p>
      </div>`;

  await enqueueMail({
    to,
    subject: 'Reset your Webuy password',
    text: textLines,
    html,
  });
}

