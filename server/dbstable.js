const { Pool } = require('pg');
const url = 'postgresql://postgres.rkihumgwrxsmupezwwok:Chinedu2006%24@aws-0-eu-west-1.pooler.supabase.com:5432/postgres';
async function test(i) {
  const p = new Pool({ connectionString: url, ssl: { rejectUnauthorized: false }, max: 1, connectionTimeoutMillis: 10000 });
  try {
    const r = await p.query('select count(*)::int as n from students');
    console.log(`DB run ${i}: OK students=${r.rows[0].n}`);
  } catch (e) { console.log(`DB run ${i}: ERR ${e.message}`); }
  finally { await p.end(); }
}
(async () => { for (let i=1;i<=8;i++){ await test(i); await new Promise(r=>setTimeout(r,800)); } })();