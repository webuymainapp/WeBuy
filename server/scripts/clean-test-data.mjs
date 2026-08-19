// Removes E2E test students (reg_no prefix E2E/) and any rows they cascade to.
// Usage: npm run db:clean
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
  const res = await client.query(
    "delete from students where reg_no like 'E2E/%' returning reg_no",
  );
  const staged = await client.query(
    "delete from pending_signups where reg_no like 'E2E/%' or email like 'e2e-%@webuy.test' returning reg_no",
  );
  const classes = await client.query(
    "delete from classes where name like 'E2E Class %' returning name",
  );
  console.log(
    `Deleted ${res.rowCount} E2E test student(s), ${staged.rowCount} staged signup(s) and ${classes.rowCount} E2E class(es).`,
  );
} catch (err) {
  console.error('Failed:', err.message);
  process.exitCode = 1;
} finally {
  await client.end();
}
