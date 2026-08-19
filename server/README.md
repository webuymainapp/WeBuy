# Webuy API

Backend for the Webuy textbook platform. Owns **all** security-sensitive logic:
auth (bcrypt + JWT + email OTP), QR pass signing/verification, collections,
notifications, wallet points, payouts, and every database write. The frontend
never touches Postgres directly — it only talks to this API.

## Stack
- Node.js + TypeScript + Express (CommonJS build)
- PostgreSQL (Supabase) via `pg` with parameterised queries
- PocketFi virtual accounts for wallet funding
- `zod` validation on every request body
- `helmet` + locked CORS + rate-safe JWT auth

## Run locally
```bash
cp .env.example .env      # fill in real values
npm install
npm run dev               # tsx watch on :4000
```

## Test everything locally (Supabase)
```bash
# 1. server/.env — set DATABASE_URL (Supabase pooler URI).
# 2. Apply the schema + seed (textbook catalog + rep1 account):
npm run db:setup

# 3. Start the API (production mode):
npm start

# 4. Run the end-to-end suite (auth → OTP → QR pass → rep roster/collect →
#    users → notifications). Pass the seeded admin password so the rep flow
#    can sign in:
ADMIN_PASSWORD=<admin-password> npm run test:e2e

# 5. Remove the throwaway E2E test students:
npm run db:clean
```

## Apply the schema
1. Create a free Supabase project.
2. Set `DATABASE_URL` in `server/.env` (Database → Connection string → URI/pooler).
3. Run `npm run db:setup` — this applies `schema.sql`, then `seed.sql`, then
   creates the chief admin account (`20241450652`). Its password comes from
   the `ADMIN_PASSWORD` env var, or a random one that is printed once to the
   console. No default password is committed to the repo.

## Endpoints
| Method | Route | Auth | Purpose |
| ------ | ----- | ---- | ------- |
| POST | `/api/auth/signup` | – | Create account (bcrypt), stages OTP code |
| POST | `/api/auth/signin` | – | Login by email or reg no |
| GET | `/api/auth/me` | JWT | Current student |
| POST | `/api/auth/resend-otp` | – | Re-issue a fresh 6-digit OTP code |
| POST | `/api/auth/verify-otp` | – | Consume OTP → promote to student, returns `token` |
| POST | `/api/auth/change-password` | JWT | Verify current password, set a new one |
| PATCH | `/api/auth/me` | JWT | Update full name / phone |
| GET | `/api/textbooks` | – | Public catalog |
| POST | `/api/me/textbooks` | JWT | Assign a textbook (unpaid) |
| GET | `/api/me/textbooks` | JWT | My books + status + `pass_token` |
| GET | `/api/me/transactions` | JWT | My payment transactions |
| GET | `/api/wallet` | JWT | My points balance + funding account |
| POST | `/api/wallet/phone` | JWT | Set/change my phone number |
| GET | `/api/wallet/provision` | JWT | Ensure a PocketFi virtual account exists |
| POST | `/api/wallet/verify` | JWT | Reconcile points from PocketFi funds |
| POST | `/api/wallet/checkout` | JWT | Pay for assigned textbooks with points |
| GET | `/api/account` | JWT+rep | Common account balance (received − spent) |
| GET | `/api/account/transactions` | JWT+rep | Balance history (payouts + purchases) |
| GET | `/api/rep/roster?course=CCM101` | JWT+rep | Student roster for a course |
| POST | `/api/rep/roster/:id/collect` | JWT+rep | Mark a student collected |
| POST | `/api/rep/roster/:id/revert` | JWT+rep | Undo a mistaken collection |
| POST | `/api/rep/textbooks` | JWT+rep | Create a textbook in the catalog |
| PATCH | `/api/rep/textbooks/:id` | JWT+rep | Update a textbook |
| DELETE | `/api/rep/textbooks/:id` | JWT+rep | Delete a textbook |
| GET | `/api/rep/overview` | JWT+rep | Dashboard: counts + recent activity |
| GET | `/api/rep/users` | JWT+rep | All accounts (so a rep picks who gets the panel) |
| PATCH | `/api/rep/users/:id/role` | JWT+rep | Grant/revoke `class_rep` on a user |
| POST | `/api/rep/payouts` | JWT+rep | Request money for settled courses |
| GET | `/api/rep/payouts` | JWT+rep | List payout requests |
| POST | `/api/rep/payouts/:id/settle` | JWT+rep | Mark a payout settled |
| POST | `/api/rep/banks`, `/api/rep/resolve-account` | JWT+rep | Bank lookup / account-name resolution |
| GET | `/api/pocketfi/config` | – | Webhook URL + PocketFi config status |
| POST | `/api/pocketfi` | HMAC | PocketFi pushes funding events here |
| POST | `/api/passes/verify` | JWT | Validate a QR pass (no mutation) |
| POST | `/api/passes/collect` | JWT+rep | Scan + mark collected |
| GET | `/api/notifications` | JWT | My notifications |
| PATCH | `/api/notifications/read-all`, `/:id/read` | JWT | Mark read |
| GET | `/health` | – | Liveness |

## Security rules enforced
- **No client trust** — amounts/references come from the DB, never the request body.
- **No SQL injection** — every query uses `$n` parameterised placeholders.
- **No forged passes** — QR tokens are JWTs signed with `JWT_SECRET`; `/api/passes/*` re-verifies signature + ownership against the DB.
- **Verified webhooks** — PocketFi funding events are verified over the raw body (`timingSafeEqual`).
- **Idempotent settlement** — webhook + manual reconcile can both fire; a paid transaction settles exactly once.
- CORS locked to `CORS_ORIGIN`, `helmet` headers on, passwords bcrypt-hashed.
- **No self-escalation to rep** — `POST /api/auth/signup` always creates a `student`. Rep access can only be granted by the **chief admin** via `PATCH /api/rep/users/:id/role` (or by seeding the DB), so no one can promote themselves.
- **Role hierarchy** — `student` < `class_rep` < `chief_admin`. The chief admin (the main course rep, `20241450652`) can toggle collection for **any** book. Other reps can only manage textbooks **they themselves added** (`textbooks.added_by`); every collect/revert/pass-collect is ownership-checked server-side, and `GET/PATCH /api/rep/users` are chief-admin-only.
- **Rate limited** — `/api/auth/signup`, `/api/auth/signin`, `/api/auth/request-verification` are throttled per IP to blunt brute force.

## Email OTP (frontend/Vercel)
Backend never sends mail directly. On signup/resend it renders the 6-digit OTP
email into `mail_queue` (the OTP is stored hashed in `pending_signups.otp_hash`,
never in plaintext). A **mail worker** drains the queue: locally
`mail/mail-worker.ts` runs alongside `npm run dev` via a Vite plugin; in
production the **Vercel serverless function** (`api/send-verification.ts`) is
triggered by the frontend and sends the Gmail SMTP email. The user types the code
into the frontend, which calls `POST /api/auth/verify-otp` — the backend remains
the source of truth.

## Deploy on Render
1. New **Web Service**, repo root = the repo, build = `cd server && npm install && npm run build`, start = `cd server && npm run start`.
2. Add env vars from `.env.example` (use the Supabase pooler URI; `NODE_ENV=production`).
3. Register the webhook URL with PocketFi: `<your-api-url>/api/pocketfi`.
4. Put the real domain in `CORS_ORIGIN` and `WEBUY_FRONTEND_URL`.
