// Egress usage estimator. Supabase charges network egress out of their
// platform by the GB, capped at SUPABASE_EGRESS_FREE_GB (default 5) per month
// on the free plan. Webuy talks to Supabase through the SHARED pooler
// (...pooler.supabase.com:5432), so the line that matters is "Shared Pooler
// Egress" — data the pooler sends back to this server. That volume is what we
// approximate here.
//
// It is an ESTIMATE, not the authoritative meter: it counts the serialized
// bytes of every query result the backend receives (the dominant share of
// pooler → server traffic) rather than full network frames/TLS overhead. The
// authoritative reading lives in supabase.com → Dashboard → Organization →
// Usage → Egress GB.
//
// Cost control: results are accumulated in memory and flushed to the
// egress_daily table once a minute (plus on shutdown), so we never pay a
// write-per-query tax on the very metric we're measuring.
import { pool } from '../db/pool';

const FREE_EGRESS_GB = Number(process.env.SUPABASE_EGRESS_FREE_GB ?? 5);
export const EGRESS_CAP_BYTES = FREE_EGRESS_GB * 1024 * 1024 * 1024;

const FLUSH_INTERVAL_MS = 60_000;

interface Accumulator {
  requests: number;
  rows: number;
  bytes: number;
}

let acc: Accumulator = { requests: 0, rows: 0, bytes: 0 };
let timer: NodeJS.Timeout | null = null;

/** Count one query result (rows + serialized byte size) toward today's usage. */
export function recordEgress(result: { rows?: unknown[] }): void {
  if (!result || !Array.isArray(result.rows)) return;
  acc.requests += 1;
  acc.rows += result.rows.length;
  acc.bytes += Buffer.byteLength(JSON.stringify(result.rows));
}

function snapshot(): Accumulator {
  const taken = acc;
  acc = { requests: 0, rows: 0, bytes: 0 };
  return taken;
}

async function persist(s: Accumulator): Promise<void> {
  if (s.requests <= 0) return;
  const day = new Date().toISOString().slice(0, 10);
  await pool
    .query(
      `insert into egress_daily (day, requests, rows_returned, bytes)
       values ($1, $2, $3, $4)
       on conflict (day) do update set
         requests = egress_daily.requests + excluded.requests,
         rows_returned = egress_daily.rows_returned + excluded.rows_returned,
         bytes = egress_daily.bytes + excluded.bytes`,
      [day, s.requests, s.rows, s.bytes],
    )
    .catch(() => undefined); // never let observability break the app
}

/** Begin the once-a-minute flush. Idempotent. */
export function startEgressFlush(): void {
  if (timer) return;
  timer = setInterval(() => {
    void persist(snapshot());
  }, FLUSH_INTERVAL_MS);
  timer.unref?.();
}

/** Flush any pending accumulation to the DB (used on graceful shutdown). */
export async function flushEgressNow(): Promise<void> {
  await persist(snapshot());
}

/** Aggregate accumulated + persisted usage for the monitor. */
export async function getEgressSummary() {
  await flushEgressNow();
  const [totals, days] = await Promise.all([
    pool.query(
      `select
         coalesce(sum(requests) filter (where day = current_date), 0)::bigint as requests_today,
         coalesce(sum(bytes) filter (where day = current_date), 0)::bigint as today_bytes,
         coalesce(sum(requests), 0)::bigint as requests_month,
         coalesce(sum(rows_returned), 0)::bigint as rows_month,
         coalesce(sum(bytes), 0)::bigint as month_bytes
       from egress_daily
      where day >= date_trunc('month', current_date)`,
    ),
    pool.query(
      `select day, bytes
         from egress_daily
        where day >= current_date - 6
        order by day`,
    ),
  ]);
  const t = totals.rows[0];
  const monthBytes = Number(t.month_bytes);
  const capBytes = EGRESS_CAP_BYTES;
  return {
    todayBytes: Number(t.today_bytes),
    requestsToday: Number(t.requests_today),
    monthBytes,
    requestsMonth: Number(t.requests_month),
    rowsMonth: Number(t.rows_month),
    capBytes,
    usedMonthPercent: Math.round((monthBytes / capBytes) * 1000) / 10,
    days: (days.rows as { day: string; bytes: string }[]).map((d) => ({
      day: d.day,
      bytes: Number(d.bytes),
    })),
  };
}