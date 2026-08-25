# WeBuy

Textbook platform for students and class reps. Students browse the catalog,
get books assigned, fund a points wallet via PocketFi virtual accounts, and pay
with points. Class reps manage rosters, collect payments, request payouts, and
scan QR passes.

## Architecture

- **Frontend** — React + Vite + Tailwind (this repo, root). Deployed to Vercel.
- **Backend** — Node.js + TypeScript + Express in `server/`. Owns all security
  logic: auth (bcrypt + JWT), email OTP, QR pass signing/verification,
  collections, notifications, wallet points, and payouts. Deployed to Render.
- **Database** — PostgreSQL (Supabase), accessed only by the backend.
- **Email** — The backend never sends mail. It renders OTP emails into a
  `mail_queue` table; a drainer sends them via Gmail SMTP. Locally the
  `mail/mail-worker.ts` worker (spawned by `npm run dev`) drains the queue; in
  production the Vercel serverless function `api/send-verification.ts` does it.
- **Funding** — Students fund their points wallet through PocketFi virtual
  accounts (see `server/.env`).

## Repository layout

```
├── src/          Frontend (React)
│   └── components/
├── api/          Vercel serverless function (email sender, production)
├── mail/         Mail drainer shared by local worker + Vercel function
├── server/       Express backend (separate package.json + .env)
│   └── src/
│       ├── routes/
│       └── lib/
```

## Run locally

Prerequisites: Node.js, a Supabase project, a Gmail App Password.

1. **Backend** (`server/.env`):
   ```
   DATABASE_URL=<supabase pooler URI>
   JWT_SECRET=<random string>
   CORS_ORIGIN=http://localhost:3000
   WEBUY_FRONTEND_URL=http://localhost:3000
   APP_URL=http://localhost:4000
   POCKETFI_SECRET_KEY=<optional — enables real virtual accounts>
   PORT=4000
   ```
   Apply the schema + seed (textbook catalog and rep accounts):
   ```bash
   cd server
   npm install
   npm run db:setup
   npm run dev        # tsx watch on :4000
   ```

2. **Frontend** (root `.env`):
   ```
   VITE_API_URL=http://localhost:4000
   VITE_EMAIL_FN_URL=http://localhost:3001/api/send-verification
   GMAIL_USER=<gmail address>
   GMAIL_APP_PASSWORD=<app password>
   ```
   The backend queues OTP emails; the local mail worker (auto-started by
   `npm run dev`) polls `mail_queue` and sends them via Gmail SMTP, so mail
   goes out even if the trigger call above can't reach a server.
   ```bash
   npm install
   npm run dev        # vite on :3000
   ```

Open http://localhost:3000.

## Scripts

| Command (root) | Purpose |
| -------------- | ------- |
| `npm run dev` | Vite dev server on :3000 (also spawns the mail worker) |
| `npm run build` | Production build to `dist/` |
| `npm run lint` | TypeScript typecheck |
| `npm run preview` | Preview the production build |

| Command (server/) | Purpose |
| ----------------- | ------- |
| `npm run dev` | Backend with hot reload (tsx watch) on :4000 |
| `npm run build` | Compile TypeScript to `dist/` |
| `npm start` | Run the compiled backend (`node dist/index.js`) |
| `npm run typecheck` | TypeScript typecheck |
| `npm run db:setup` | Apply `schema.sql` + `seed.sql` |
| `npm run db:clean` | Remove E2E test students |
| `npm run db:clear-users` | Clear all users (fresh start) |
| `npm run test:e2e` | End-to-end suite against a running backend |

## Deployment

- **Frontend** — Vercel. `vercel.json` builds with `npm run build`, serves
  `dist/`, and exposes `api/send-verification.ts` as a serverless function.
  Set env vars: `VITE_API_URL` (your Render URL), `VITE_EMAIL_FN_URL`
  (e.g. `https://<site>.vercel.app/api/send-verification`), `GMAIL_USER`,
  `GMAIL_APP_PASSWORD`, `DATABASE_URL`.
- **Backend** — Render Web Service. Build `cd server && npm install && npm run
  build`, start `cd server && npm run start`. Set `NODE_ENV=production`,
  `DATABASE_URL`, `JWT_SECRET`, `CORS_ORIGIN`, `WEBUY_FRONTEND_URL`, `APP_URL`,
  `POCKETFI_SECRET_KEY`. Register the PocketFi webhook URL at
  `<your-api-url>/api/pocketfi`.

See `server/README.md` for API endpoints and security rules.

## Backups & Recovery

The production database is backed up automatically every day.

- **Where** — the private repo `webuymainapp/WeBuy-backups`, containing a plain
  SQL dump (`webuy_YYYYMMDD.sql`) per day (schema + all data).
- **How** — a GitHub Actions workflow (`.github/workflows/backup.yml`) runs on a
  cron schedule (03:00 UTC), dumps the DB via `pg_dump`, and pushes the file.
  It reads `DATABASE_URL` from the `DATABASE_URL` secret and pushes with the
  `BACKUP_PAT` secret (both set on this repo's Actions settings).
- **Trigger manually** — run the `Daily Database Backup` workflow from the
  Actions tab, or push a new workflow: `repository_dispatch`/`workflow_dispatch`
  are enabled.

### Restore (if the database is lost)

1. Create a new Postgres database (new Supabase project, Render Postgres, Neon).
2. Run the most recent dump against it:
   ```bash
   psql "NEW_DATABASE_URL" -f webuy_YYYYMMDD.sql
   ```
3. Point the backend at the new DB — update `DATABASE_URL` in `server/.env`
   (local) and in the Render environment variables, then redeploy.

Backups are as-of the dump time, so expect up to ~24h of potential data loss with
daily dumps. Non-DB secrets (Gmail app password, PocketFi keys) live in
`server/.env` / Render env vars and are **not** in the dumps — back those up
separately.

### Database Monitor (chief admin)

The rep portal includes a read-only **Database Monitor** (`GET /api/rep/db-monitor`,
chief admin only) that reports DB size, per-table sizes, row counts, wallet
ledger totals, and cleanup candidates (expired tokens, stale signups, soft-deleted
textbooks) so you know when the DB needs clearing or capacity review.
