import 'dotenv/config';
import bcrypt from 'bcryptjs';
import pg from 'pg';

async function main() {
  const [regNoRaw, newEmailRaw] = process.argv.slice(2);
  const newPassword = process.env.WEBUY_RECOVER_PASSWORD ?? '';
  if (!regNoRaw || !newEmailRaw || !newPassword) {
    throw new Error('Usage: WEBUY_RECOVER_PASSWORD=... npx tsx scripts/recover-account.ts REGNO NEWEMAIL');
  }
  if (newPassword.length < 8 || newPassword.length > 72) {
    throw new Error('Recovery password must be 8-72 characters');
  }
  const newEmail = newEmailRaw.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newEmail)) {
    throw new Error('Invalid new email address');
  }

  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  const client = await pool.connect();
  try {
    await client.query('begin');
    const target = await client.query(
      'select id, email from students where reg_no = $1',
      [regNoRaw.trim().toUpperCase()],
    );
    if (target.rowCount === 0) throw new Error('No student matches that registration number');
    const studentId = target.rows[0].id as string;
    const oldEmail = target.rows[0].email as string;

    const dup = await client.query(
      'select id from students where lower(email) = $1 and id <> $2',
      [newEmail, studentId],
    );
    if (dup.rowCount) throw new Error('That email already belongs to another student');

    const passwordHash = await bcrypt.hash(newPassword, 10);
    await client.query(
      'delete from pending_signups where lower(email) in ($1, $2)',
      [oldEmail.toLowerCase(), newEmail],
    );
    await client.query(
      'delete from mail_queue where lower(to_email) in ($1, $2)',
      [oldEmail.toLowerCase(), newEmail],
    );
    await client.query(
      'delete from password_resets where lower(email) in ($1, $2)',
      [oldEmail.toLowerCase(), newEmail],
    );
    await client.query('delete from verification_tokens where student_id = $1', [studentId]);
    await client.query(
      `update students
          set email = $1,
              email_verified = true,
              password_hash = $2,
              session_token = null
        where id = $3`,
      [newEmail, passwordHash, studentId],
    );
    await client.query('commit');
    console.log(`Recovered ${regNoRaw.trim().toUpperCase()} with ${newEmail}; wallet and baseline preserved.`);
  } catch (err) {
    await client.query('rollback').catch(() => undefined);
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

void main();
