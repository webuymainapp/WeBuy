# UPGRADE.md — Growing Webuy past one class

This file is our **roadmap**. It lists the challenges we will hit as we grow,
why they happen, and exactly what to do when we are ready to expand.

**How to use it:** each item has a *"When we hit this"* trigger. When that
happens, follow the *"What to do"* steps. Do not act on an item until its
trigger applies — most of these are fine for a single class.

---

## 1. Where we are today (single class, single money pool)

- One school, one catalog, one global list of students.
- One chief admin (seeded account `20241450652`) who can manage every book.
- **One** PocketFi merchant account. All student money lands in the same pool,
  and payout requests send it to a rep's bank account.
- Course codes are **globally unique** — the first class to post `CSC301`
  owns that code forever.
- Everything runs on: one Express server (Render), one Postgres DB (Supabase),
  one Vercel function that sends queued emails.

Everything below exists because one or more of those "one"s will stop
fitting our needs.

---

## 2. The roadmap at a glance

| Phase | What changes | Trigger to start |
| ----- | ------------ | ---------------- |
| **0** | Single class (today) | — |
| **1** | Multiple classes in this school (class tenancy + invite codes) | A second class/level wants to use the app |
| **2** | Each class collects into its own PocketFi merchant | PocketFi limits the single merchant's volume |
| **3** | Bigger scale (database tier, more servers, multi-school) | Thousands of students / real traffic |

Phases 1 and 2 are the ones we designed. Phase 3 is the "nice problems to
have" list.

---

## 3. Phase 1 — Multiple classes in this school

### 3.1 Invite / referral codes (the part we like)

**Challenge:** students must land in the right class under the right chief
admin, without typing free text.

**What to do:**
- New table `classes`: `id`, `name` (e.g. "Computer Science 200"),
  `department`, `level`, `admin_id` (that class's chief admin),
  `invite_code`, `created_at`.
- Signup takes an `invite_code` instead of free-text department/level. One
  lookup resolves it to a `class_id`. A student cannot join a class without
  its code, and a chief admin only sees their own class's students.
- Add `class_id` to `students` and `textbooks`.

### 3.2 Course codes collide

**Challenge:** `textbooks.course_code` is UNIQUE **globally**
(`server/schema.sql:24`). Two classes both wanting "CSC301" is impossible
today.

**What to do:**
- Drop the global unique on `course_code`.
- Add `unique (class_id, course_code)` — same code allowed in different
  classes, never twice in one class.
- Migration: backfill `class_id` on existing rows before enabling the new
  constraint.

### 3.3 Chief admin becomes per-class

**Challenge:** right now one `chief_admin` owns every book everywhere.

**What to do:**
- Each class's `classes.admin_id` is its chief. Role checks change from "is
  chief_admin" to "is admin of this class" for class-scoped actions.
- Keep a platform-level admin only if we want someone who manages the whole
  app (ops), separate from class chiefs.

### 3.4 Rosters and catalog must be scoped to a class

**Challenge:** `GET /api/rep/roster?course=CSC301` (`server/src/routes/rep.ts:622`)
and the catalog (`server/src/routes/textbooks.ts:11,67`) are global.

**What to do:**
- Roster: add `and t.class_id = <my class>` so class A cannot see class B's
  roster. (Transparency stays *within* the class, which is fine.)
- Catalog: students see their own class's books.
- Roster/catalog responses get pagination before classes multiply.

---

## 4. Phase 2 — Each class gets its own PocketFi merchant

### 4.1 Why

PocketFi limits how much **one** startup business can control. As student
payments grow, one merchant account will hit that ceiling. Giving each class
its **own** PocketFi business spreads the volume across many accounts — each
class gets its own limit.

### 4.2 Chief admins bring their own account (the part we debated)

**Our decision:** chiefs provide their **own PocketFi credentials**, not just
a bank account number, because per-class merchants are the only way past the
single-account limit.

**This makes our app a "key keeper" — the risks and rules:**

| Risk | Rule |
| ---- | ---- |
| Database leaks → every class's keys leak | **Encrypt keys at rest** in the DB (AES-256-GCM, master key only in server env). Leaked DB = unreadable ciphertext. |
| Secret key visible in the UI | **Never return the secret key** to the browser. Type once, then show only a masked hint + public key / business ID. |
| Wrong key pasted → student money lost | **Test the key before saving**: make a small PocketFi test call; reject with a clear error if it fails. |
| Webhook can't tell which class paid | Give each class its own webhook secret / route so payment events verify against the right key. |

### 4.3 Where the code changes live

- `server/src/lib/pocketfi.ts` — every call must use the **class's** key
  (passed in) instead of the single `config.pocketfiSecret`.
- `server/src/routes/pocketfi.ts` — webhook looks up the right class, verifies
  with that class's secret, then credits that class's student wallet.
- `server/src/routes/wallet.ts` — "verify my funds" uses the student's class's
  merchant.
- `server/src/config.ts` — platform-level keys stay in env; per-class keys
  live in the DB (encrypted).

### 4.4 The cheaper alternative (if it ever becomes enough)

If we ever decide per-class **collection** is too much work, the fallback is:
one platform merchant, but each class's chief sets a **payout bank account**
in the UI (`POST /api/rep/payouts` + PocketFi `verify-bank` already exist at
`server/src/routes/rep.ts:408` and `server/src/lib/pocketfi.ts:154`). Money
still lands in each class's own bank, with no keys stored. Choose this if
PocketFi's limit turns out not to bite.

---

## 5. Phase 3 — Bigger scale

### 5.1 Database size (Supabase)

**When:** total student data approaches the plan limit.

**Rough size:** ~5,000 students ≈ 250MB; ~20,000 students ≈ 1GB.

**What to do:**
- Free tier = 500MB **and pauses the project after a week of no activity** —
  not OK for a real school.
- Move to **Pro ($25/mo, 8GB, no pausing)** once real classes are using the
  app. Postgres itself can hold far more than we'll ever need; the plan is
  the only ceiling.

### 5.2 Too many students logging in at once

**When:** login/checkout requests start queueing during peak hours (exam
registration, payment deadline).

**What to do:**
- Raise the DB pool cap above 5 (`server/src/db/pool.ts:14`) — Supabase's
  pooler can handle more, but go gradually.
- Add `LIMIT`/pagination + an index on `(class_id, course_code)` for
  catalogs/rosters.
- Consider a couple of extra server instances on Render.

### 5.3 More than one server

**When:** we run 2+ backend instances.

**Challenge:** the rate limiter is stored in the server's memory
(`server/src/lib/rateLimit.ts`) — each instance counts separately, so limits
become meaningless across instances.

**What to do:** move rate limiting to a shared store (Redis/Upstash). The
note already in the code says this ("swap for a Redis-backed store").

### 5.4 Email sending (Gmail SMTP)

**When:** signups/reminders grow (Gmail caps sending per day ~500–2,000).

**What to do:** the mail outbox (`mail_queue`) is already a queue — good. If
we outgrow Gmail, swap `mail/drain.ts` to a real email API (Resend/SendGrid)
without changing the backend, since the backend only *queues* mail.

### 5.5 Notifications table grows

**When:** years of students × reminders pile up.

**What to do:** it's already indexed by student
(`idx_notif_student` in `server/schema.sql`). Archive or prune old "read"
notifications per semester. Nothing urgent.

### 5.6 Multi-school (later, optional)

**When:** another school wants to use the app.

**What to do:** add one more level above `classes` — `school_id` — and scope
`reg_no`/`email` uniqueness per school. Phase 1's `classes` layer already
gives us 80% of this.

---

## 6. Security reminders that grow with us

- Encrypt any stored payment keys (see 4.2). Never log them, never return
  them to the frontend.
- Keep platform secrets in server env (`server/src/config.ts`), not the DB.
- Delete the leftover `PAYSTACK_*` vars in `server/.env` — they're dead and
  add confusion.
- Confirm the deployed backend runs `NODE_ENV=production` so errors never
  leak internals (`server/src/index.ts`).
- Re-verify the chief admin password rotation story once classes multiply
  (no more published default credentials — already removed in seed).
- Paginate every list endpoint before data grows (catalog, roster,
  transactions, notifications).

---

## 7. Pre-expansion checklist

Run through this before opening the app to a second class:

- [ ] `classes` table + invite codes in signup
- [ ] `class_id` on `students`, `textbooks`, `payouts`
- [ ] `course_code` uniqueness scoped to `(class_id, course_code)`
- [ ] Roster + catalog scoped per class; pagination added
- [ ] Per-class chief admin (via `classes.admin_id`), role checks scoped
- [ ] Decide Phase 2 model: per-class PocketFi merchants (needs key
      encryption + testing + per-class webhooks) OR shared merchant +
      per-class payout bank accounts
- [ ] Move to Supabase Pro before real traffic
- [ ] Delete dead `PAYSTACK_*` env vars; confirm `NODE_ENV=production`