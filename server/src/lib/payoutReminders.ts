// Money-request disturbance alerts.
//
// When a rep requests money (a payout), every chief admin is disturbed right
// away — an in-app notification plus an email. If the request stays unsettled,
// a background job keeps disturbing them: a fresh in-app notification every 10
// minutes and a reminder email every 30 minutes, until the payout is settled.
//
// The emails themselves are only QUEUED here (mail_queue); the frontend mail
// drainer (worker locally, Vercel function in prod) actually sends them.
import { query } from '../db/pool';
import { enqueueMail } from './mail';

export interface PayoutAlert {
  repName: string;
  courseCode: string;
  copies: number;
  amount: number;
  reminder?: boolean;
}

const naira = (n: number) => new Intl.NumberFormat('en-NG').format(n);

function alertCopy(alert: PayoutAlert) {
  const money = naira(alert.amount);
  const copies = `${alert.copies} cop${alert.copies === 1 ? 'y' : 'ies'}`;
  const title = alert.reminder
    ? `Reminder — money request still pending (₦${money})`
    : `New money request — ₦${money}`;
  const body = alert.reminder
    ? `${alert.repName} requested ${copies} of ${alert.courseCode} for ₦${money} — still awaiting settlement. Review it in Money Requests.`
    : `${alert.repName} requested ${copies} of ${alert.courseCode} for ₦${money}. Review it in Money Requests.`;
  const subject = `[Webuy] ${alert.reminder ? 'Reminder: ' : ''}money request from ${alert.repName} — ₦${money}`;
  const text = [
    `Webuy — ${alert.reminder ? 'reminder: ' : ''}money request`,
    '',
    `${alert.repName} requested ${copies} of ${alert.courseCode} for ₦${money}${alert.reminder ? ' — still awaiting settlement.' : '.'}`,
    '',
    'Sign in to the class rep panel and settle it in Money Requests.',
  ].join('\n');
  const html = `<div style="font-family:Arial,sans-serif;max-width:480px;margin:0 auto">
    <h2 style="color:#111827">${alert.reminder ? 'Money request still pending' : 'New money request'}</h2>
    <p style="color:#374151">${alert.repName} requested <strong>${copies}</strong> of <strong>${alert.courseCode}</strong> for <strong>₦${money}</strong>${alert.reminder ? ' — still awaiting settlement.' : '.'}</p>
    <p style="color:#6b7280;font-size:13px">Review and settle this request from the Money Requests section of the class rep panel.</p>
  </div>`;
  return { title, body, subject, text, html };
}

async function chiefEmails(): Promise<{ id: string; email: string }[]> {
  const chiefs = await query(
    `select id, email from students where role = 'chief_admin'`,
  );
  return chiefs.rows as { id: string; email: string }[];
}

/** In-app notification to every chief admin. */
export async function sendInAppPayoutAlert(alert: PayoutAlert): Promise<void> {
  const { title, body } = alertCopy(alert);
  const chiefs = await chiefEmails();
  for (const chief of chiefs) {
    await query(
      `insert into notifications (student_id, type, title, body)
       values ($1, 'payout', $2, $3)`,
      [chief.id, title, body],
    );
  }
}

/** Reminder email to every chief admin (queued through the mail outbox). */
export async function sendPayoutEmail(alert: PayoutAlert): Promise<void> {
  const { subject, text, html } = alertCopy(alert);
  const chiefs = await chiefEmails();
  for (const chief of chiefs) {
    await enqueueMail({ to: chief.email, subject, text, html });
  }
}

/** Immediate disturbance on a fresh request: notification + email. */
export async function disturbChiefs(alert: PayoutAlert): Promise<void> {
  await sendInAppPayoutAlert(alert);
  await sendPayoutEmail(alert);
}

const TICK_MS = 60_000;
const INAPP_EVERY_MS = 10 * 60_000;
const EMAIL_EVERY_MS = 30 * 60_000;

async function tick(): Promise<void> {
  try {
    const due = await query(
      `select p.id, p.amount, p.copies, p.created_at,
              p.last_reminder_at, p.last_email_reminder_at,
              t.course_code, s.full_name as rep_name
         from payouts p
         join textbooks t on t.id = p.textbook_id
         join students s on s.id = p.rep_id
        where p.status in ('pending', 'processing')
          and (
            (p.last_reminder_at is null and p.created_at <= now() - interval '10 minutes')
            or p.last_reminder_at <= now() - interval '10 minutes'
            or (p.last_email_reminder_at is null and p.created_at <= now() - interval '30 minutes')
            or p.last_email_reminder_at <= now() - interval '30 minutes'
          )`,
    );

    for (const row of due.rows) {
      const now = Date.now();
      const created = new Date(row.created_at).getTime();
      const lastInapp = row.last_reminder_at
        ? new Date(row.last_reminder_at).getTime()
        : null;
      const lastEmail = row.last_email_reminder_at
        ? new Date(row.last_email_reminder_at).getTime()
        : null;
      const inappDue =
        lastInapp === null
          ? now - created >= INAPP_EVERY_MS
          : now - lastInapp >= INAPP_EVERY_MS;
      const emailDue =
        lastEmail === null
          ? now - created >= EMAIL_EVERY_MS
          : now - lastEmail >= EMAIL_EVERY_MS;

      const alert: PayoutAlert = {
        repName: String(row.rep_name),
        courseCode: String(row.course_code),
        copies: Number(row.copies),
        amount: Number(row.amount),
        reminder: true,
      };

      if (inappDue) {
        await sendInAppPayoutAlert(alert);
        await query(
          `update payouts set last_reminder_at = now() where id = $1`,
          [row.id],
        );
      }
      if (emailDue) {
        await sendPayoutEmail(alert);
        await query(
          `update payouts set last_email_reminder_at = now() where id = $1`,
          [row.id],
        );
      }
    }
  } catch (err) {
    console.error(
      `[payout-reminders] tick failed: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

/** Start the recurring reminder job. Never throws; errors are logged per tick. */
export function startPayoutReminderJob(): void {
  setInterval(() => {
    void tick();
  }, TICK_MS).unref();
}
