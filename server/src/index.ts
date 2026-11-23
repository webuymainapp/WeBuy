import express, { type NextFunction, type Request, type Response } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { config } from './config';
import { query } from './db/pool';
import { HttpError } from './lib/http';
import authRouter from './routes/auth';
import textbooksRouter from './routes/textbooks';
import repRouter from './routes/rep';
import passesRouter from './routes/passes';
import notificationsRouter from './routes/notifications';
import accountRouter from './routes/account';
import walletRouter from './routes/wallet';
import secretRouter from './routes/secret';
import pocketfiRouter from './routes/pocketfi';
import classesRouter from './routes/classes';
import refundsRouter from './routes/refunds';
import { startPayoutReminderJob } from './lib/payoutReminders';
import { startEgressFlush, flushEgressNow } from './lib/egress';

const app = express();

app.disable('x-powered-by');
app.use(helmet());

// Locked to configured frontend origin(s). Secrets never leave the server.
// Also allow the Chrome DevTools app-protocol probe (harmless JSON-only).
app.use(
  cors({
    origin(origin, cb) {
      if (!origin) return cb(null, true);
      if (config.corsOrigin.includes(origin)) return cb(null, true);
      if (/^[a-z0-9-]+:\/\/devtools$/i.test(origin)) return cb(null, true);
      cb(new HttpError(403, 'Origin not allowed'));
    },
    credentials: true,
  }),
);

// Capture the raw body so the PocketFi webhook can verify its signature.
app.use(
  express.json({
    limit: '1mb',
    verify: (req, _res, buf) => {
      (req as express.Request & { rawBody?: Buffer }).rawBody = buf;
    },
  }),
);

// Debug request logger — shows every incoming request and whether the response
// carried a Content-Security-Policy header (helps diagnose DevTools/CSP noise).
app.use((req, res, next) => {
  const started = Date.now();
  res.on('finish', () => {
    const csp = res.getHeader('Content-Security-Policy');
    console.log(
      `[http] ${req.method} ${req.originalUrl} -> ${res.statusCode} ` +
        `(${Date.now() - started}ms) origin="${req.headers.origin ?? '-'}" ` +
        `ua="${String(req.headers['user-agent'] ?? '').slice(0, 48)}" ` +
        `csp=${csp ? 'SET' : 'absent'}`,
    );
  });
  next();
});

app.get('/', (_req, res) => {
  res.json({ name: 'Webuy API', status: 'ok', docs: '/health' });
});

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', uptime: process.uptime() });
});

// Chrome DevTools probes this path for its "app protocol". It's not HTML, so a
// CSP header only makes DevTools complain. Return an empty spec without CSP.
app.get('/.well-known/appspecific/com.chrome.devtools.json', (req, res) => {
  console.log(
    `[devtools-probe] ${req.method} ${req.originalUrl} origin="${req.headers.origin ?? '-'}" ` +
      `ua="${String(req.headers['user-agent'] ?? '')}"`,
  );
  res.removeHeader('Content-Security-Policy');
  res.json({});
});

app.use('/api/auth', authRouter);
app.use('/api', textbooksRouter); // /api/textbooks, /api/me/textbooks
app.use('/api/rep', repRouter);
app.use('/api/passes', passesRouter);
app.use('/api/notifications', notificationsRouter);
app.use('/api/account', accountRouter);
app.use('/api/wallet', walletRouter);
app.use('/api/secret', secretRouter);
app.use('/api/pocketfi', pocketfiRouter);
app.use('/api/classes', classesRouter);
app.use('/api/refunds', refundsRouter);

// 404 for unknown API routes.
app.use('/api', (_req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// Central error handler.
app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  const e = err instanceof Error ? err : new Error(String(err));
  console.error(`[error] ${e.stack ?? e.message}`);
  if (err instanceof HttpError) {
    res.status(err.status).json({ error: err.message });
    return;
  }
  if (config.isProd) {
    res.status(500).json({ error: 'Internal server error' });
    return;
  }
  res.status(500).json({ error: e.message });
});

// Idempotent startup migrations for databases created before a column existed.
async function runMigrations() {
  await query(`alter table student_wallets
    add column if not exists virtual_account_name text`);
  await query(`alter table student_wallets
    add column if not exists funding_baseline int not null default 0`);
  await query(`alter table student_wallets
    add column if not exists funding_baseline_at timestamptz not null default 'epoch'`);
  await query(`update student_wallets
     set funding_baseline = 0 where funding_baseline is null`);
  await query(`update student_wallets
     set funding_baseline_at = timestamp 'epoch' where funding_baseline_at is null`);
  await query(`alter table payouts
    add column if not exists last_reminder_at timestamptz`);
  await query(`alter table payouts
    add column if not exists last_email_reminder_at timestamptz`);
  // The chief admin classifies new funding as either a spendable deposit or a
  // PocketFi top-up kept out of the wallet; extend the kind constraint so the
  // top-up records stay auditable in wallet_transactions.
  await query(`do $$
    begin
      if not exists (
        select 1 from pg_constraint
        where conrelid = 'wallet_transactions'::regclass
          and conname = 'wallet_transactions_kind_check'
          and pg_get_constraintdef(oid) like '%topup_pocketfi%'
          and pg_get_constraintdef(oid) like '%correction%'
      ) then
        alter table wallet_transactions drop constraint if exists wallet_transactions_kind_check;
        alter table wallet_transactions add constraint wallet_transactions_kind_check
          check (kind in ('deposit', 'purchase', 'refund', 'topup_pocketfi', 'correction'));
      end if;
    end $$`);
  await query(`create table if not exists wallet_audit_log (
    id bigserial primary key,
    student_id uuid not null,
    operation text not null,
    old_balance int,
    new_balance int,
    old_baseline int,
    new_baseline int,
    old_account text,
    new_account text,
    changed_by text not null default current_user,
    changed_at timestamptz not null default now()
  )`);
  await query(`create index if not exists idx_wallet_audit_student
    on wallet_audit_log(student_id, changed_at desc)`);
  await query(`create or replace function audit_wallet_change() returns trigger as $$
  declare
    audited_student uuid;
  begin
    if tg_op = 'DELETE' then
      audited_student := old.student_id;
    else
      audited_student := new.student_id;
    end if;
    insert into wallet_audit_log (
      student_id, operation, old_balance, new_balance,
      old_baseline, new_baseline, old_account, new_account
    ) values (
      audited_student,
      tg_op,
      old.point_balance,
      new.point_balance,
      old.funding_baseline,
      new.funding_baseline,
      old.virtual_account_no,
      new.virtual_account_no
    );
    return null;
  end $$ language plpgsql`);
  await query(`create or replace function guard_wallet_baseline() returns trigger as $$
  begin
    if tg_op = 'DELETE' then
      return old;
    end if;
    if (
      new.funding_baseline is distinct from old.funding_baseline
      or new.funding_baseline_at is distinct from old.funding_baseline_at
    )
      and not (
        old.funding_baseline_at is null
        and new.funding_baseline = 0
        and new.funding_baseline_at = timestamp 'epoch'
      )
      and coalesce(current_setting('webuy.allow_baseline_update', true), '') <> 'on' then
      raise exception 'Wallet funding baseline can only be changed by the application';
    end if;
    if new.virtual_account_no is distinct from old.virtual_account_no
      and (new.funding_baseline <> 0 or new.funding_baseline_at > timestamp 'epoch')
      and coalesce(current_setting('webuy.allow_baseline_update', true), '') <> 'on' then
      raise exception 'A new virtual account must reset the funding baseline';
    end if;
    return new;
  end $$ language plpgsql`);
  await query(`drop trigger if exists trg_audit_wallet_change on student_wallets`);
  await query(`create trigger trg_audit_wallet_change
    after update or delete on student_wallets
    for each row execute function audit_wallet_change()`);
  await query(`drop trigger if exists trg_guard_wallet_baseline on student_wallets`);
  await query(`create trigger trg_guard_wallet_baseline
    before update or delete on student_wallets
    for each row execute function guard_wallet_baseline()`);
  // Refunds: per-book "refunds open" flag + the refund_requests table, so
  // databases created before the refund scheme self-heal on boot.
  await query(`alter table textbooks
    add column if not exists refunds_open boolean not null default false`);
  await query(`create table if not exists refund_requests (
    id uuid primary key default gen_random_uuid(),
    student_id uuid not null references students(id) on delete cascade,
    student_textbook_id uuid not null references student_textbooks(id) on delete cascade,
    textbook_id uuid not null references textbooks(id) on delete cascade,
    amount int not null check (amount > 0),
    reason text,
    status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
    reviewed_by uuid references students(id) on delete set null,
    reviewed_at timestamptz,
    review_note text,
    created_at timestamptz not null default now()
  )`);
  await query(`create index if not exists idx_refund_requests_assignment
    on refund_requests(student_textbook_id)`);
  // Password resets moved from a 6-digit OTP to a one-time emailed token.
  // Legacy databases still have otp_hash NOT NULL and no used_at column.
  await query(`create table if not exists password_resets (
    id uuid primary key default gen_random_uuid(),
    email text not null,
    otp_hash text,
    attempts int not null default 0,
    token_hash text,
    used_at timestamptz,
    expires_at timestamptz not null,
    created_at timestamptz not null default now()
  )`);
  await query(`alter table password_resets alter column otp_hash drop not null`);
  await query(`alter table password_resets add column if not exists used_at timestamptz`);
  await query(`create index if not exists idx_password_resets_token_hash
    on password_resets(token_hash)`);
  // Daily egress usage estimator — aggregated once a minute from in-memory
  // counters so the metric itself adds almost no write traffic.
  await query(`create table if not exists egress_daily (
    day date primary key,
    requests int not null default 0,
    rows_returned bigint not null default 0,
    bytes bigint not null default 0
  )`);
}

runMigrations()
  .catch((err) => console.error(`[migrate] failed: ${err.message}`))
  .finally(() => {
    startPayoutReminderJob();
    startEgressFlush();
    app.listen(config.port, () => {
      console.log(`[webuy-api] listening on port ${config.port}`);
    });
  });

// Persist any un-flushed egress counters when Render stops the service.
process.on('SIGTERM', () => {
  void flushEgressNow().finally(() => process.exit(0));
});
process.on('SIGINT', () => {
  void flushEgressNow().finally(() => process.exit(0));
});
