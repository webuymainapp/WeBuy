// Destructive full reset: deletes EVERY row in the database except the platform
// admin account (20241450652), which is kept (role chief_admin). No textbooks,
// students, classes, signups, payments or mail survive. Next run of db:setup
// re-seeds the first class (and can re-seed the admin if needed).
// Usage: npm run db:reset
import 'dotenv/config';
import pg from 'pg';

if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL is not set. Edit server/.env first.');
  process.exit(1);
}

const client = new pg.Client({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

const ADMIN_REG_NO = '20241450652';

// Children before parents so FK constraints are satisfied. The order matters:
// every table that references `students`/`textbooks`/`classes` is wiped first.
const TABLES = [
  'wallet_transactions',
  'student_wallets',
  'collections',
  'verification_tokens',
  'notifications',
  'rep_toggle_grants',
  'payouts',
  'purchases',
  'transactions',
  'student_textbooks',
  'classes',
  'textbooks',
  'pending_signups',
  'mail_queue',
  'students',
];

try {
  await client.connect();
  await client.query('begin');
  for (const table of TABLES) {
    if (table === 'students') {
      const res = await client.query(
        'delete from students where reg_no <> $1 returning reg_no',
        [ADMIN_REG_NO],
      );
      console.log(`  students: deleted ${res.rowCount} (kept ${ADMIN_REG_NO})`);
    } else {
      const res = await client.query(`delete from ${table}`);
      console.log(`  ${table}: deleted ${res.rowCount}`);
    }
  }
  await client.query('commit');
  console.log('Database reset complete. Only the platform admin remains.');
} catch (err) {
  await client.query('rollback');
  console.error('Failed:', err.message);
  process.exitCode = 1;
} finally {
  await client.end();
}