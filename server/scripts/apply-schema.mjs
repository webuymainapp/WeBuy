// Applies schema.sql then seed.sql to the database in server/.env (Supabase),
// then creates the chief admin account with a password that is never
// hardcoded: ADMIN_PASSWORD from env, or a randomly generated one printed once.
// Usage: npm run db:setup
import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import bcrypt from 'bcryptjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const schemaPath = path.join(__dirname, '..', 'schema.sql');
const seedPath = path.join(__dirname, '..', 'seed.sql');

if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL is not set. Edit server/.env first.');
  process.exit(1);
}

const schema = fs.readFileSync(schemaPath, 'utf8');
const seed = fs.readFileSync(seedPath, 'utf8');

const client = new pg.Client({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

const ADMIN_REG_NO = '20241450652';
const ADMIN_EMAIL = 'ogemdivictor1@gmail.com';

function randomPassword() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
  const bytes = randomBytes(18);
  let out = '';
  for (let i = 0; i < 18; i++) out += alphabet[bytes[i] % alphabet.length];
  return out;
}

try {
  await client.connect();
  console.log('Connected. Applying schema.sql…');
  await client.query(schema);
  console.log('Schema applied. Applying seed.sql…');
  await client.query(seed);

  // Create the chief admin only if it doesn't already exist — an existing
  // account is never silently reset. Use ADMIN_PASSWORD when supplied,
  // otherwise generate a random password and print it once.
  const existing = await client.query('select id from students where reg_no = $1', [
    ADMIN_REG_NO,
  ]);
  if (existing.rowCount === 0) {
    const password = process.env.ADMIN_PASSWORD || randomPassword();
    const passwordHash = await bcrypt.hash(password, 10);
    await client.query(
      `insert into students (reg_no, full_name, email, department, level, password_hash, role, email_verified)
       values ($1, $2, $3, $4, $5, $6, 'chief_admin', true)
       on conflict (reg_no) do nothing`,
      [ADMIN_REG_NO, 'Ogemdi Victor Chinedu', ADMIN_EMAIL, 'Computer Science', '200', passwordHash],
    );
    if (process.env.ADMIN_PASSWORD) {
      console.log(`Chief admin created (${ADMIN_REG_NO}) — password taken from ADMIN_PASSWORD.`);
    } else {
      console.log('==================================================================');
      console.log(`Chief admin created: reg_no=${ADMIN_REG_NO}`);
      console.log(`One-time password:  ${password}`);
      console.log('Change it after first login. Set ADMIN_PASSWORD to control it.');
      console.log('==================================================================');
    }
  } else {
    console.log(`Chief admin (${ADMIN_REG_NO}) already exists — password left unchanged.`);
  }

  // Seed the FIRST class so students have somewhere to sign up. Only created
  // when the classes table is empty. Its chief admin is the platform admin and
  // its invite code comes from CLASS_INVITE_CODE env or a generated one printed
  // once (the chief can change it later in the app).
  const classCount = await client.query('select count(*)::int as n from classes');
  if (Number(classCount.rows[0].n) === 0) {
    const adminId = await client.query('select id from students where reg_no = $1', [
      ADMIN_REG_NO,
    ]);
    const inviteCode =
      (process.env.CLASS_INVITE_CODE || '').trim() ||
      randomPassword().slice(0, 8).toUpperCase();
    await client.query(
      `insert into classes (name, department, level, admin_id, invite_code)
       values ($1, $2, $3, $4, $5)`,
      ['Computer Science 200', 'Computer Science', '200', adminId.rows[0]?.id ?? null, inviteCode],
    );
    console.log('==================================================================');
    console.log(`First class created: "Computer Science 200"`);
    console.log(`Class invite code:   ${inviteCode}`);
    console.log('Students must enter this code to sign up. Set CLASS_INVITE_CODE to control it.');
    console.log('==================================================================');
  } else {
    console.log('Classes already exist — first class left as is.');
  }

  console.log('Done — schema + seed are in place.');
} catch (err) {
  console.error('Failed:', err.message);
  process.exitCode = 1;
} finally {
  await client.end();
}
