// Full demo data to exercise every piece of the money logic:
//  - per-rep revenue (points purchases minus settled payouts)
//  - Total Money for Textbooks in PocketFi (excludes fee + unspent points)
//  - purchases log (points spent) and payins log (deposits + withdrawals)
//  - payout requests (pending + settled) + copies <= paid-count limit
//
//   seed:    node scripts/seed-demo-data.mjs
//   clean:   node scripts/seed-demo-data.mjs --clean

import 'dotenv/config';
import pg from 'pg';

const FEE = 100;
const PWHASH = '$2b$10$kx/2i9BBrNPIRJbtZzXoj.fhfIg5dvIMWrl3couoeK27Py7MTi.S2';
const CLEAN = process.argv.includes('--clean');

const students = {
  S1: ['ENG/2023/00001', 'Ada Obi', 'ada.obi@webuy.demo', 'Computer Science', '300'],
  S2: ['ENG/2023/00002', 'Emeka Nwosu', 'emeka.nwosu@webuy.demo', 'Electrical Engineering', '300'],
  S3: ['ENG/2023/00003', 'Tola Bakare', 'tola.bakare@webuy.demo', 'Computer Science', '300'],
  S4: ['LAW/2023/00004', 'Kemi Ade', 'kemi.ade@webuy.demo', 'Law', '200'],
  S5: ['ENG/2023/00005', 'Chinedu Okafor', 'chinedu.okafor@webuy.demo', 'Mechanical Engineering', '400'],
  S6: ['GNS/2023/00006', 'Blessing Eze', 'blessing.eze@webuy.demo', 'General Studies', '100'],
};

const client = new pg.Client({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

const run = async () => {
  await client.connect();

  if (CLEAN) {
    await client.query(`delete from payouts where reference like 'PFL-DEMO-%'`);
    await client.query(`delete from wallet_transactions where reference like 'DEMO-%'`);
    // Remove any demo student rows (past or present) by email domain, and their
    // assignments/wallets, plus the demo rep.
    await client.query(`delete from student_textbooks where student_id in (
      select id from students where email ilike '%@webuy.demo')`);
    await client.query(`delete from student_wallets where student_id in (
      select id from students where email ilike '%@webuy.demo')`);
    await client.query(`delete from textbooks where course_code = any($1::text[])`,
      [['CSC311', 'CSC321', 'EEE311', 'GNS201']]);
    await client.query(`delete from students where email ilike '%@webuy.demo' or reg_no = 'WEBUY-REP-DEMO'`);
    console.log('Cleaned demo data.');
    return;
  }

  await client.query('begin');

  const id = async (regNo) =>
    (await client.query('select id from students where reg_no = $1', [regNo])).rows[0].id;
  const bookIdFor = async (code) =>
    (await client.query('select id from textbooks where course_code = $1', [code])).rows[0].id;

  // Reps: Ogemdi (chief) + Chinedu exist; add one demo rep for a third view.
  await client.query(
    `insert into students (reg_no, full_name, email, department, level, password_hash, role, email_verified)
     values ('WEBUY-REP-DEMO', 'Demo Rep', 'demo.rep@webuy.demo', 'General Studies', '200', $1, 'class_rep', true)
     on conflict (reg_no) do nothing`,
    [PWHASH],
  );
  const R1 = await id('20241450652'); // chief (Ogemdi)
  const R2 = await id('20241450622'); // Chinedu
  const R3 = await id('WEBUY-REP-DEMO'); // demo rep

  // Buyers
  for (const [, s] of Object.entries(students)) {
    await client.query(
      `insert into students (reg_no, full_name, email, department, level, password_hash, role, email_verified)
       values ($1, $2, $3, $4, $5, $6, 'student', true)
       on conflict (reg_no) do nothing`,
      [s[0], s[1], s[2], s[3], s[4], PWHASH],
    );
  }

  // Textbooks (price = base + ₦100 fee baked in)
  const books = [
    ['CSC311', 'Advanced Algorithms', 8000, R1],
    ['CSC321', 'Software Architecture', 6000, R1],
    ['EEE311', 'Power Systems Analysis', 6500, R2],
    ['GNS201', 'Study Skills', 4000, R3],
  ];
  for (const [code, title, base, addedBy] of books) {
    await client.query(
      `insert into textbooks
         (course_code, course_title, book_title, author, edition, price, department, level,
          pickup_location, class_rep_name, added_by)
       values ($1, $2, $2, 'Demo Author', '1st', $3, 'General', '300',
               'Faculty Building - Room 104', 'Class Rep', $4)
       on conflict (course_code) do nothing`,
      [code, title, base + FEE, addedBy],
    );
  }

  // Wallet funding (deposits into PocketFi) + point balances. Fund everyone
  // generously; only some points are spent so unspent ones are testable.
  const funding = { S1: 30000, S2: 25000, S3: 25000, S4: 20000, S5: 20000, S6: 12000 };
  for (const [k, amt] of Object.entries(funding)) {
    const sid = await id(students[k][0]);
    await client.query(
      `insert into student_wallets (student_id, point_balance)
       values ($1, $2)
       on conflict (student_id) do update set point_balance = $2`,
      [sid, amt],
    );
    await client.query(
      `insert into wallet_transactions (student_id, kind, amount, reference, note)
       values ($1, 'deposit', $2, $3, 'Demo funding')`,
      [sid, amt, `DEMO-DEP-${k}`],
    );
  }

  // Paid/collected purchases via points. Each gets a wallet 'purchase' ledger
  // row with the SAME reference as student_textbooks.transaction_reference.
  const purchases = [
    ['CSC311', 'S1', 'paid'],
    ['CSC311', 'S2', 'paid'],
    ['CSC311', 'S3', 'collected'],
    ['CSC321', 'S1', 'paid'],
    ['CSC321', 'S4', 'paid'],
    ['EEE311', 'S2', 'paid'],
    ['EEE311', 'S3', 'paid'],
    ['EEE311', 'S5', 'collected'],
    ['GNS201', 'S4', 'paid'],
    ['GNS201', 'S5', 'paid'],
    ['GNS201', 'S6', 'collected'],
  ];
  const priceOf = new Map(books.map(([c, , base]) => [c, base + FEE]));
  let n = 0;
  for (const [code, sKey, status] of purchases) {
    n += 1;
    const ref = `DEMO-PUR-${code}-${sKey}-${n}`;
    const sid = await id(students[sKey][0]);
    const bookId = await bookIdFor(code);
    await client.query(
      `insert into wallet_transactions (student_id, kind, amount, reference, note)
       values ($1, 'purchase', $2, $3, 'Demo textbook purchase')`,
      [sid, -priceOf.get(code), ref],
    );
    await client.query(
      `insert into student_textbooks
         (student_id, textbook_id, status, paid_at, collected_at, transaction_reference)
       values ($1, $2, $3, now(),
               case when $3 = 'collected' then now() else null end, $4)
       on conflict (student_id, textbook_id) do nothing`,
      [sid, bookId, status, ref],
    );
  }

  // Payout requests. Amount = copies × (price − fee).
  const payouts = [
    // [course, copies, status]
    ['CSC311', 2, 'completed'], // settled -> subtract from Ogemdi revenue + platform total
    ['EEE311', 3, 'pending'],   // requested, not yet subtracted
    ['GNS201', 1, 'completed'], // settled -> subtract from Demo Rep
  ];
  for (const [code, copies, status] of payouts) {
    const bookId = await bookIdFor(code);
    const price = priceOf.get(code);
    const amount = (price - FEE) * copies;
    await client.query(
      `insert into payouts
         (rep_id, amount, bank_name, bank_code, account_name, account_number,
          reference, status, textbook_id, copies)
       values ((select added_by from textbooks where id = $1), $2, '', '', '', '',
               $3, $4, $1, $5)`,
      [bookId, amount, `PFL-DEMO-${code}-${status}`, status, copies],
    );
  }

  await client.query('commit');

  // Summary of what to expect.
  console.log('Seeded. Expected figures (per rep revenue = earned − settled payouts):');
  const summary = await client.query(
    `select s.full_name as rep,
            coalesce((select sum(t.price - 100) from student_textbooks st join textbooks t on t.id = st.textbook_id
                       where st.status in ('paid','collected') and t.added_by = s.id), 0)::int as earned,
            coalesce((select sum(p.amount) from payouts p where p.status = 'completed' and p.rep_id = s.id), 0)::int as settled
       from students s
      where s.role in ('class_rep','chief_admin')
      order by s.full_name`,
  );
  for (const r of summary.rows) {
    console.log(`  ${r.rep.padEnd(20)} earned=₦${r.earned} settled=₦${r.settled} net=₦${r.earned - r.settled}`);
  }
  const total = await client.query(
    `select
       (select coalesce(sum(t.price - 100),0)::int from student_textbooks st join textbooks t on t.id = st.textbook_id
         where st.status in ('paid','collected')) as earned,
       (select coalesce(sum(p.amount),0)::int from payouts p where p.status = 'completed') as settled`,
  );
  console.log('Platform Total Money for Textbooks = ₦' + (total.rows[0].earned - total.rows[0].settled));
};

run()
  .catch((err) => {
    console.error('Failed:', err.message);
    process.exitCode = 1;
  })
  .finally(() => client.end());
