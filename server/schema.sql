-- Webuy schema — run this in the Supabase SQL editor (or any Postgres).
-- The API connects via DATABASE_URL (pg) and owns all reads/writes.

create extension if not exists "pgcrypto";

create table if not exists students (
  id uuid primary key default gen_random_uuid(),
  reg_no text unique not null,
  full_name text not null,
  email text unique not null,
  phone text,
  department text not null,
  level text not null,
  password_hash text not null,
  role text not null default 'student' check (role in ('student', 'class_rep', 'chief_admin')),
  email_verified boolean not null default false,
  avatar_url text,
  free_profile_edit_used boolean not null default false,
  created_at timestamptz not null default now()
);

-- Class/tenant: each class (a department + level) is its own space with its
-- own chief admin and invite code. Students join by entering the code at
-- signup, which sets students.class_id.
create table if not exists classes (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  department text not null,
  level text not null,
  admin_id uuid references students(id) on delete set null, -- the class's chief admin
  invite_code text unique not null,
  created_at timestamptz not null default now()
);
create index if not exists idx_classes_invite on classes(invite_code);
alter table students add column if not exists class_id uuid references classes(id) on delete set null;

create table if not exists textbooks (
  id uuid primary key default gen_random_uuid(),
  course_code text not null unique,
  course_title text not null,
  book_title text not null,
  author text,
  edition text,
  price int not null check (price >= 0),
  isbn text,
  department text not null,
  level text not null,
  lecturer_name text,
  pickup_location text not null,
  class_rep_name text,
  cover_url text,
  added_by uuid references students(id) on delete set null, -- rep who added it
  created_at timestamptz not null default now()
);

-- A student's assigned textbook and its lifecycle (unpaid -> paid -> collected).
create table if not exists student_textbooks (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references students(id) on delete cascade,
  textbook_id uuid not null references textbooks(id) on delete cascade,
  status text not null default 'unpaid' check (status in ('unpaid', 'paid', 'collected')),
  paid_at timestamptz,
  collected_at timestamptz,
  transaction_reference text,
  pass_token text,                -- signed JWT QR pass issued on payment confirmation
  created_at timestamptz not null default now(),
  unique (student_id, textbook_id)
);

create table if not exists transactions (
  id uuid primary key default gen_random_uuid(),
  reference text unique not null,
  student_id uuid references students(id) on delete set null,
  amount int not null,
  fee int not null default 0,
  total int not null,
  method text,
  status text not null default 'pending' check (status in ('pending', 'success', 'failed')),
  payload jsonb not null default '{}'::jsonb,   -- book ids paid
  created_at timestamptz not null default now()
);

create table if not exists collections (
  id uuid primary key default gen_random_uuid(),
  student_textbook_id uuid not null references student_textbooks(id) on delete cascade,
  scanned_by uuid references students(id) on delete set null,
  location text,
  created_at timestamptz not null default now()
);

create table if not exists notifications (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references students(id) on delete cascade,
  type text not null,
  title text not null,
  body text,
  read boolean not null default false,
  created_at timestamptz not null default now()
);

-- Money spent from the common account to actually buy textbooks.
-- Balance = sum(successful payments) - sum(purchases).
create table if not exists purchases (
  id uuid primary key default gen_random_uuid(),
  amount int not null check (amount > 0),
  note text,
  recorded_by uuid references students(id) on delete set null,
  created_at timestamptz not null default now()
);

-- Withdrawal requests paid out from the SHARED PocketFi balance to any bank
-- account. Every rep/chief can withdraw; balance is platform-wide.
create table if not exists payouts (
  id uuid primary key default gen_random_uuid(),
  rep_id uuid references students(id) on delete set null,
  amount int not null check (amount > 0),
  bank_name text not null,
  bank_code text not null,
  account_name text not null,
  account_number text not null,
  reference text unique not null,
  status text not null default 'pending' check
    (status in ('pending', 'processing', 'completed', 'failed')),
  failure_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_payouts_created on payouts(created_at desc);

-- Self-heal: add bank_code to databases created before this payout migration.
alter table payouts add column if not exists bank_code text;
update payouts set bank_code = '' where bank_code is null;

-- Payouts are now "procurement requests": a rep picks one of their courses and
-- how many copies they need; the amount is auto-calculated. `textbook_id` +
-- `copies` record which course and how many. Bank fields stay empty (the chief
-- transfers centrally and just marks the request settled).
alter table payouts add column if not exists textbook_id uuid references textbooks(id) on delete set null;
alter table payouts add column if not exists copies int;

-- Money-request disturbance reminders: track when the chief was last disturbed
-- (in-app notification vs email) so unsettled payouts keep re-alerting every
-- 10 min in-app / 30 min by email until they're settled.
alter table payouts add column if not exists last_reminder_at timestamptz;
alter table payouts add column if not exists last_email_reminder_at timestamptz;

-- Collection-slot grants. A rep can only mark as many students "collected" for a
-- course as copies they've had SETTLED (money withdrawn) for that course, plus
-- any slots the chief admin explicitly grants (e.g. once the rep obtains the
-- books). This makes undelivered books remain "owed" — the rep must obtain the
-- books or repay before they can close out the roster.
create table if not exists rep_toggle_grants (
  id uuid primary key default gen_random_uuid(),
  rep_id uuid references students(id) on delete cascade,
  textbook_id uuid references textbooks(id) on delete cascade,
  copies int not null check (copies > 0),
  granted_by uuid references students(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists idx_toggle_grants_rep on rep_toggle_grants(rep_id, textbook_id);

-- One Wallet per student. `point_balance` is in Webuy Points (1 pt = ₦1).
-- A student funds this wallet by transferring into their PocketFi virtual
-- account; the webhook credits points. Checkout spends points on textbooks.
create table if not exists student_wallets (
  student_id uuid primary key references students(id) on delete cascade,
  point_balance int not null default 0 check (point_balance >= 0),
  virtual_account_no text,
  virtual_bank_name text,
  virtual_account_name text,
  virtual_customer_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Wallet ledger: every points in/out movement is journaled for auditability.
create table if not exists wallet_transactions (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references students(id) on delete cascade,
  kind text not null check (kind in ('deposit', 'purchase', 'refund')),
  amount int not null check (amount <> 0),
  reference text unique not null,
  note text,
  created_at timestamptz not null default now()
);

create index if not exists idx_wallet_tx_student on wallet_transactions(student_id, created_at desc);
create index if not exists idx_wallet_tx_reference on wallet_transactions(reference);

-- Unverified signups. An account's email does NOT occupy the students table
-- until the verification link is clicked — it lives here first. This means a
-- signup that was never verified can be re-attempted or resent without hitting
-- "email already exists". When a token is consumed, the row is promoted into
-- `students` (email_verified = true) and deleted from here.
create table if not exists pending_signups (
  id uuid primary key default gen_random_uuid(),
  reg_no text not null,
  full_name text not null,
  email text not null,
  phone text,
  department text not null,
  level text not null,
  password_hash text not null,
  token_hash text,
  otp_hash text,
  attempts int not null default 0,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists idx_pending_signups_email on pending_signups(lower(email));
create index if not exists idx_pending_signups_reg_no on pending_signups(reg_no);
alter table pending_signups add column if not exists class_id uuid references classes(id) on delete set null;

-- Self-heal: add the used_at column to databases created before this migration.
alter table pending_signups add column if not exists used_at timestamptz;

-- OTP signup: the 6-digit code is stored hashed, with an attempt counter so a
-- wrong guess eventually forces a fresh code (never a lockout — it's public data).
alter table pending_signups add column if not exists otp_hash text;
alter table pending_signups add column if not exists attempts int not null default 0;
alter table pending_signups alter column token_hash drop not null;

-- Cooldown: track when the last OTP email was sent so we can throttle resends.
alter table pending_signups add column if not exists last_otp_sent_at timestamptz;

-- One-time email verification tokens (hashed at rest; only the plain token is
-- handed to the Vercel serverless function so it can build the email link).
create table if not exists verification_tokens (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references students(id) on delete cascade,
  token_hash text not null,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);

-- Mail outbox. The backend (Render) only QUEUES emails here — it never sends.
-- The actual sender lives in the frontend project: a Vercel serverless function
-- in production, or the mail worker spawned by `npm run dev` locally. This keeps
-- Gmail SMTP credentials (which Render blocks) entirely on the frontend side.
create table if not exists mail_queue (
  id uuid primary key default gen_random_uuid(),
  to_email text not null,
  subject text not null,
  text_body text,
  html_body text,
  status text not null default 'pending' check (status in ('pending', 'sending', 'sent', 'failed')),
  attempts int not null default 0,
  last_error text,
  created_at timestamptz not null default now(),
  sent_at timestamptz
);

create index if not exists idx_st_textbook on student_textbooks(textbook_id);
create index if not exists idx_st_status on student_textbooks(status);
create index if not exists idx_tx_reference on transactions(reference);
create index if not exists idx_notif_student on notifications(student_id) where read = false;
create index if not exists idx_purchases_created on purchases(created_at desc);
create index if not exists idx_mail_pending on mail_queue(status, created_at) where status in ('pending', 'failed');

-- Self-heal: bring existing databases up to date without dropping data.
-- (create table if not exists won't add columns to a table that already exists.)
alter table student_textbooks add column if not exists created_at timestamptz not null default now();
alter table textbooks add column if not exists added_by uuid references students(id) on delete set null;

-- Soft-delete: when a rep deletes a textbook it is just stamped `deleted_at`
-- (hidden from students immediately) and kept restorable for 24 hours before a
-- lazy purge permanently removes it — a safety net against accidental deletes.
alter table textbooks add column if not exists deleted_at timestamptz;
create index if not exists idx_textbooks_deleted on textbooks(deleted_at) where deleted_at is not null;

-- Add the chief_admin role + promote rep 1 (20241450652) to chief admin.
alter table students drop constraint if exists students_role_check;
alter table students add constraint students_role_check check (role in ('student', 'class_rep', 'chief_admin'));
update students set role = 'chief_admin' where reg_no = '20241450652' and role = 'class_rep';

-- Profile edit: first edit is free, subsequent edits cost 100 pts.
alter table students add column if not exists free_profile_edit_used boolean not null default false;

-- Phone edit count for graduated pricing: no phone → free/100; has phone → 100/200.
alter table students add column if not exists phone_edit_count int not null default 0;

-- Single-session enforcement: the currently-valid session token. On every sign-in
-- a fresh token is generated, invalidating any other browser/device's session.
alter table students add column if not exists session_token text;

-- Secret marketplace access. Only students flagged true have the privilege; the
-- secret entry point (triple-tap on Dashboard) is gated by this flag server-side.
alter table students add column if not exists market_access boolean not null default false;

-- Secret marketplace products — deliberately only name + price. They are NOT in
-- the normal catalogue; buying spends wallet points but leaves no trace on the
-- transactions page (no wallet_transactions row is written).
create table if not exists secret_products (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  price int not null check (price >= 0),
  created_by uuid references students(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists idx_secret_products_created on secret_products(created_at desc);

-- Who bought which secret product. Marked paid when points are spent. This is the
-- ONLY audit of secret purchases — deliberately kept separate from wallet_transactions
-- so nothing secret ever shows on the student's transactions page.
create table if not exists secret_purchases (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references students(id) on delete cascade,
  product_id uuid not null references secret_products(id) on delete cascade,
  price int not null,
  status text not null default 'paid' check (status in ('paid')),
  paid_at timestamptz not null default now(),
  unique (student_id, product_id)
);
create index if not exists idx_secret_purchases_student on secret_purchases(student_id, paid_at desc);
