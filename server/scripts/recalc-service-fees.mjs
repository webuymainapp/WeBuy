// One-time migration: switch the textbook service fee from the two-tier
// (₦100 / ₦200) rule to a graduated one — ₦100, then +₦100 for every ₦10,000 of
// selling price (₦100 ≤ 10k, ₦200 ≤ 20k, ₦300 ≤ 30k, …).
//
// For every textbook the selling price is recovered as price − current fee, the
// fee is recomputed from that selling price, and where it changed both
// service_fee and the all-inclusive price are updated. Idempotent.
// Usage: node scripts/recalc-service-fees.mjs
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

  const before = await client.query(
    `select id, book_title, price, service_fee from textbooks order by created_at`
  );

  await client.query(
    `update textbooks t
     set service_fee = c.new_fee,
         price = (t.price - t.service_fee) + c.new_fee
     from (
       select id,
              greatest(100, 100 * ceil((price - service_fee) / 10000.0))::int as new_fee
       from textbooks
     ) c
     where t.id = c.id
       and c.new_fee <> t.service_fee`
  );

  const after = await client.query(
    `select id, book_title, price, service_fee from textbooks order by created_at`
  );

  console.log('BEFORE → AFTER (price, fee):');
  for (const row of before.rows) {
    const next = after.rows.find((a) => a.id === row.id);
    console.log(
      `  ${row.book_title}: ${row.price}/${row.service_fee} → ${next ? `${next.price}/${next.service_fee}` : 'N/A'}`
    );
  }
  console.log('Done.');
} catch (err) {
  console.error('Failed:', err.message);
  process.exitCode = 1;
} finally {
  await client.end();
}