// Centralised environment/config. All secrets come from process.env only.
import 'dotenv/config';

function required(name: string, inProduction: boolean): string {
  const value = process.env[name];
  const isProd = process.env.NODE_ENV === 'production';
  if (inProduction && isProd && !value) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value ?? '';
}

function urlList(name: string, inProduction: boolean): string[] {
  return required(name, inProduction)
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

export const config = {
  nodeEnv: process.env.NODE_ENV ?? 'development',
  isProd: process.env.NODE_ENV === 'production',
  port: Number(process.env.PORT ?? 4000),
  databaseUrl: required('DATABASE_URL', true),
  jwtSecret: required('JWT_SECRET', true),
  corsOrigin: urlList('CORS_ORIGIN', true),
  appUrl: required('APP_URL', true),
  frontendUrls: urlList(
    process.env.WEBUY_FRONTEND_URLS ? 'WEBUY_FRONTEND_URLS' : 'WEBUY_FRONTEND_URL',
    true,
  ),
  frontendUrl: process.env.WEBUY_FRONTEND_URL ?? required('APP_URL', true),
  pocketfiSecret: process.env.POCKETFI_SECRET_KEY ?? '',
  // Not required for server-to-server API calls (only the Secret Key is sent in
  // the Authorization header). Stored in case a future client-side flow needs it.
  pocketfiPublic: process.env.POCKETFI_PUBLIC_KEY ?? '',
  // Real: https://api.pocketfi.ng/api/v1   |   Sandbox: https://api.pocketfi.ng/api/test
  pocketfiBase: process.env.POCKETFI_BASE_URL ?? 'https://api.pocketfi.ng/api/v1',
  // Public base used when reporting the webhook URL (defaults to appUrl/backend).
  pocketfiWebhookPublicBase: process.env.POCKETFI_WEBHOOK_BASE ?? '',
  // PocketFi business ID + preferred bank provider for virtual accounts.
  pocketfiBusinessId: process.env.POCKETFI_BUSINESS_ID ?? '',
  pocketfiBank: process.env.POCKETFI_BANK ?? 'kuda',
};

// Fail loud instead of returning silent 500s: warn when the DB URL looks like a
// placeholder rather than a real Supabase connection string.
if (/localhost|127\.0\.0\.1/.test(config.databaseUrl)) {
  console.warn(
    '[config] WARNING: DATABASE_URL looks like a localhost placeholder. ' +
      'If this is not a real Supabase URL, every request will fail with 500. ' +
      'Paste your real connection string into server/.env.',
  );
}
