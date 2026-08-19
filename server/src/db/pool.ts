// Postgres pool. Every query uses parameterised $n placeholders so untrusted
// input can never be interpolated into SQL.
import pg from 'pg';
import { config } from '../config';

const MAX_ATTEMPTS = 3;
const RETRY_DELAY_MS = 300;

export const pool = new pg.Pool({
  connectionString: config.databaseUrl,
  // Supabase's pooler throttles when too many connections are open at once
  // (the API pool + the mail worker pool + dev tools all share it). A smaller
  // max + a modest idle timeout keeps us well under the pooler's limit.
  max: 5,
  idleTimeoutMillis: 15_000,
  connectionTimeoutMillis: 8_000,
  keepAlive: true,
  ssl:
    config.isProd || /sslmode=require/.test(config.databaseUrl)
      ? { rejectUnauthorized: false }
      : false,
});

// PgBouncer (Supabase pooler) can drop an idle/checked-out connection at any
// time, which surfaces as "Connection terminated unexpectedly". Such failures
// happen before the statement reaches Postgres, so retrying them is safe.
function isConnectionDrop(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const msg = err.message;
  return (
    msg.includes('Connection terminated unexpectedly') ||
    msg.includes('Connection terminated') ||
    msg.includes('ECONNRESET') ||
    msg.includes('client has encountered a connection error') ||
    msg.includes('Connection refused') ||
    // Supabase pooler throttling surfaces as a connect timeout — transient,
    // and the query never executed, so retrying is safe.
    msg.includes('timeout exceeded when trying to connect')
  );
}

export async function query<T extends pg.QueryResultRow = pg.QueryResultRow>(
  text: string,
  params?: unknown[],
): Promise<pg.QueryResult<T>> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await pool.query<T>(text, params as never[]);
    } catch (err) {
      if (!isConnectionDrop(err) || attempt >= MAX_ATTEMPTS) throw err;
      await new Promise((r) => setTimeout(r, RETRY_DELAY_MS * attempt));
    }
  }
}
