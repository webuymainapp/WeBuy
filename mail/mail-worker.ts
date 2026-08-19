// Local mail worker. Spawned automatically by `npm run dev` (see vite.config.ts)
// so that "ready to send" mails in the mail_queue outbox are picked up and sent
// via Gmail SMTP during local development. The Vercel serverless function plays
// this same role in production.
import { config as loadEnv } from 'dotenv';
import path from 'node:path';
import pg from 'pg';
import { drainMailQueue } from './drain';

// Prefer server/.env (has DATABASE_URL + Gmail creds), then any root .env.
const root = process.cwd();
loadEnv({ path: path.resolve(root, 'server', '.env') });
loadEnv({ path: path.resolve(root, '.env') });

const POLL_MS = Number(process.env.MAIL_POLL_MS || 5000);

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  max: 2,
  idleTimeoutMillis: 15_000,
  connectionTimeoutMillis: 8_000,
  keepAlive: true,
  ssl: { rejectUnauthorized: false },
});

let running = true;
let draining = false;

async function tick(): Promise<void> {
  if (draining || !running) return;
  draining = true;
  try {
    const result = await drainMailQueue(pool, (msg) => console.log(msg));
    if (!result.configured) {
      console.warn(
        '[mail-worker] GMAIL_USER/GMAIL_APP_PASSWORD not set — mails will queue but not send.',
      );
    } else if (result.sent + result.failed > 0) {
      console.log(`[mail-worker] drained ${result.sent + result.failed} (${result.sent} sent, ${result.failed} failed)`);
    }
  } catch (err) {
    console.error('[mail-worker] drain error:', err instanceof Error ? err.message : String(err));
  } finally {
    draining = false;
  }
}

setInterval(tick, POLL_MS).unref();
void tick();

function shutdown(): void {
  running = false;
  setTimeout(() => process.exit(0), 100).unref();
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

console.log(`[mail-worker] started — polling mail_queue every ${POLL_MS}ms`);
