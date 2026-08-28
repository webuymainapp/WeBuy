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
import { startPayoutReminderJob } from './lib/payoutReminders';

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
  await query(`alter table payouts
    add column if not exists last_reminder_at timestamptz`);
  await query(`alter table payouts
    add column if not exists last_email_reminder_at timestamptz`);
}

runMigrations()
  .catch((err) => console.error(`[migrate] failed: ${err.message}`))
  .finally(() => {
    startPayoutReminderJob();
    app.listen(config.port, () => {
      console.log(`[webuy-api] listening on port ${config.port}`);
    });
  });
