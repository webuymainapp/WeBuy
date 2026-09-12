// Extends wallet_transactions.kind to accept 'topup_pocketfi' so the chief
// admin's PocketFi top-up classifications stay auditable in the ledger.
// Idempotent. Usage: node scripts/migrate-topup-kind.mjs
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
  await client.query(`do $$
    begin
      if not exists (
        select 1 from pg_constraint
        where conrelid = 'wallet_transactions'::regclass
          and conname = 'wallet_transactions_kind_check'
          and pg_get_constraintdef(oid) like '%topup_pocketfi%'
      ) then
        alter table wallet_transactions drop constraint if exists wallet_transactions_kind_check;
        alter table wallet_transactions add constraint wallet_transactions_kind_check
          check (kind in ('deposit', 'purchase', 'refund', 'topup_pocketfi'));
      end if;
    end $$`);
  const check = await client.query(
    `select pg_get_constraintdef(oid) as def
       from pg_constraint
      where conrelid = 'wallet_transactions'::regclass
        and conname = 'wallet_transactions_kind_check'`
  );
  console.log('kind constraint now:', check.rows[0].def);
  console.log('Done.');
} catch (err) {
  console.error('Failed:', err.message);
  process.exitCode = 1;
} finally {
  await client.end();
}