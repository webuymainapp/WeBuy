// Deletes ALL users except the chief admin(s). Cascaded rows (student_textbooks,
// notifications, verification_tokens) go with them; transactions/collections
// keep rows but their student links are nulled by the DB constraints.
// Usage: npm run db:clear-users
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

try {
  await client.connect();

  const kept = await client.query(
    "select reg_no, full_name, email from students where role = 'chief_admin'",
  );
  if (kept.rowCount === 0) {
    console.error('No chief_admin found — refusing to delete every user.');
    process.exit(1);
  }

  await client.query('delete from pending_signups');
  await client.query('delete from mail_queue');
  const res = await client.query(
    "delete from students where role <> 'chief_admin' returning reg_no",
  );

  console.log(`Deleted ${res.rowCount} user(s).`);
  console.log('Remaining accounts:');
  for (const a of kept.rows) {
    console.log(`  ${a.reg_no} — ${a.full_name} <${a.email}>`);
  }
} catch (err) {
  console.error('Failed:', err.message);
  process.exitCode = 1;
} finally {
  await client.end();
}
