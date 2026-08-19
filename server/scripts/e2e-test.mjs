// End-to-end test for the Webuy API.
//
// Prereqs:
//   1. server/.env has DATABASE_URL set, and PAYSTACK_MOCK=1 (or real Paystack keys).
//   2. schema + seed applied:  npm run db:setup
//   3. API running:            npm run dev   (http://localhost:4000)
//
// Run: npm run test:e2e
// Creates a throwaway student (reg_no E2E/…). Clean up with: npm run db:clean
import 'dotenv/config';
import { createHmac } from 'node:crypto';

const BASE = process.env.E2E_API_BASE ?? 'http://localhost:4000';
const SECRET = process.env.PAYSTACK_SECRET_KEY ?? '';

const stamp = Date.now().toString(36).toUpperCase();
const REG = `E2E/${stamp}`;
const EMAIL = `e2e-${stamp.toLowerCase()}@webuy.test`;

let passed = 0;
let failed = 0;
const failures = [];

function ok(cond, name, detail = '') {
  if (cond) {
    passed += 1;
    console.log(`  ✓ ${name}`);
  } else {
    failed += 1;
    failures.push(name);
    console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

async function req(method, path, token, body) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  let data = null;
  try {
    data = await res.json();
  } catch {
    // no body
  }
  return { status: res.status, data };
}

function expect(status, want, name, detail) {
  ok(status === want, name, `${status} != ${want}${detail ? ` ${detail}` : ''}`);
}

console.log('Webuy E2E — full flow against', BASE, '\n');

// ---- Class invite code -------------------------------------------------------
// Signup now REQUIRES a valid class invite code. Reuse CLASS_INVITE_CODE if the
// schema was applied with one, otherwise create a throwaway E2E class as the
// platform admin and use its code.
let classInviteCode = process.env.CLASS_INVITE_CODE;
if (!classInviteCode && process.env.ADMIN_PASSWORD) {
  const adminLogin = await req('POST', '/api/auth/signin', undefined, {
    emailOrRegNo: '20241450652',
    password: process.env.ADMIN_PASSWORD,
  });
  if (adminLogin.status === 200) {
    const created = await req('POST', '/api/classes', adminLogin.data.token, {
      name: `E2E Class ${stamp}`,
      department: 'Computer Science',
      level: '300',
      inviteCode: `E2E${stamp.slice(0, 8)}`,
    });
    if (created.status === 201) {
      classInviteCode = created.data.class.invite_code;
      console.log(`  ✓ created throwaway E2E class (invite ${classInviteCode})`);
    } else {
      console.log(`  ✗ could not create E2E class (${created.status})`);
    }
  }
}
ok(!!classInviteCode, 'have a class invite code for signups');

// ---- Auth ------------------------------------------------------------------
console.log('AUTH');
const signup = await req('POST', '/api/auth/signup', undefined, {
  regNo: REG,
  fullName: 'E2E Tester',
  email: EMAIL,
  phone: '08000000000',
  department: 'Computer Science',
  level: '300 Level',
  password: 'testpass123',
  inviteCode: classInviteCode,
});
expect(signup.status, 201, 'signup stages the account');
ok(!signup.data?.token, 'signup does NOT issue a session token before verification');
ok(!!signup.data?.verificationToken, 'signup returns verificationToken');
ok(signup.data?.student?.role === 'student', 'signup is always student role');

// Before verification the email is NOT a real account: re-signup must be
// allowed (replaces the staged signup) rather than saying "email exists".
const resignup = await req('POST', '/api/auth/signup', undefined, {
  regNo: REG,
  fullName: 'E2E Tester',
  email: EMAIL,
  phone: '08000000000',
  department: 'Computer Science',
  level: '300 Level',
  password: 'testpass123',
  inviteCode: classInviteCode,
});
expect(resignup.status, 201, 're-signup before verification is allowed');
ok(!!resignup.data?.verificationToken, 're-signup issues a fresh token');

const roleSpoof = await req('POST', '/api/auth/signup', undefined, {
  regNo: `E2E/${stamp}SPOOF`,
  fullName: 'Spoof Attempt',
  email: `e2e-${stamp.toLowerCase()}spoof@webuy.test`,
  department: 'Computer Science',
  level: '100 Level',
  password: 'testpass123',
  inviteCode: classInviteCode,
  role: 'class_rep',
});
ok(roleSpoof.data?.student?.role === 'student', 'role spoof is ignored (still student)');

const signinBeforeVerify = await req('POST', '/api/auth/signin', undefined, {
  emailOrRegNo: EMAIL,
  password: 'testpass123',
});
expect(signinBeforeVerify.status, 401, 'signin is rejected before email verification');

const verifyEmail = await req('POST', '/api/auth/verify-email', undefined, {
  token: resignup.data.verificationToken,
});
expect(verifyEmail.status, 200, 'verify-email consumes token');

const signin = await req('POST', '/api/auth/signin', undefined, {
  emailOrRegNo: EMAIL,
  password: 'testpass123',
});
expect(signin.status, 200, 'signin by email works after verification');
const studentToken = signin.data?.token;

const me = await req('GET', '/api/auth/me', studentToken);
expect(me.status, 200, 'GET /auth/me works');
ok(me.data?.student?.emailVerified === true, 'email is verified');

const changePw = await req('POST', '/api/auth/change-password', studentToken, {
  currentPassword: 'testpass123',
  newPassword: 'newpass456',
});
expect(changePw.status, 200, 'change-password works');
const signinNew = await req('POST', '/api/auth/signin', undefined, {
  emailOrRegNo: EMAIL,
  password: 'newpass456',
});
expect(signinNew.status, 200, 'signin with new password works');
const badPw = await req('POST', '/api/auth/change-password', studentToken, {
  currentPassword: 'wrongpass',
  newPassword: 'newpass456',
});
expect(badPw.status, 400, 'change-password rejects wrong current password');

// ---- Catalog + payment (dashboard = whole catalog) ---------------------------
console.log('\nCATALOG & PAYMENT');
const catalog = await req('GET', '/api/textbooks');
expect(catalog.status, 200, 'GET /textbooks (catalog)');
ok(Array.isArray(catalog.data?.textbooks) && catalog.data.textbooks.length >= 6, 'catalog seeded');

const mine = await req('GET', '/api/me/textbooks', studentToken);
expect(mine.status, 200, 'GET /me/textbooks');
ok(
  (mine.data?.textbooks ?? []).length === catalog.data.textbooks.length,
  'dashboard shows the whole catalog (all books, all years)',
);
ok((mine.data?.textbooks ?? []).every((b) => b.status === 'unpaid'), 'all catalog books unpaid by default');

const bookA = catalog.data.textbooks.find((t) => t.course_code === 'CSC301');
const bookB = catalog.data.textbooks.find((t) => t.course_code === 'CSC303');
ok(!!bookA && !!bookB, 'found CSC301 + CSC303 in catalog');

// ---- Payments + webhook settlement -------------------------------------------
console.log('\nPAYMENTS & WEBHOOK');
const init = await req('POST', '/api/payments/initialize', studentToken, {
  textbookIds: [bookA.id, bookB.id],
});
expect(init.status, 200, 'initialize payment (real Paystack test keys)');
ok(!!init.data?.reference, 'initialize returns reference');
ok(!!init.data?.authorizationUrl, 'initialize returns authorizationUrl');
const reference = init.data.reference;

const verifyPay = await req('GET', `/api/payments/verify?reference=${reference}`, studentToken);
expect(verifyPay.status, 200, 'verify endpoint reachable (unpaid = not success yet)');

// Webhook: rejects unsigned bodies
const noSig = await req('POST', '/api/payments/webhook', undefined, undefined);
ok(noSig.status === 400, 'webhook rejects missing signature');

// Webhook: a valid HMAC charge.success settles the payment (this is how
// Paystack confirms in production; here we simulate it with the test secret).
const event = JSON.stringify({
  event: 'charge.success',
  data: { reference, amount: 100000, status: 'success' },
});
const sig = createHmac('sha512', SECRET).update(event).digest('hex');
const webhookRes = await fetch(`${BASE}/api/payments/webhook`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'x-paystack-signature': sig },
  body: event,
});
expect(webhookRes.status, 200, 'webhook with valid HMAC accepted');

const mine2 = await req('GET', '/api/me/textbooks', studentToken);
const myPaid = (mine2.data?.textbooks ?? []).filter((b) => b.status === 'paid');
ok(myPaid.length === 2, 'both paid books now show paid');
ok(myPaid.every((b) => !!b.pass_token), 'both paid books got a signed pass_token');
const bookAState = (mine2.data?.textbooks ?? []).find((b) => b.course_code === 'CSC301');
ok(bookAState?.status === 'paid', 'CSC301 shows paid on the dashboard');

// ---- QR pass flow ------------------------------------------------------------
console.log('\nQR PASS');
const mine4 = await req('GET', '/api/me/textbooks', studentToken);
const paidBook = (mine4.data?.textbooks ?? []).find((b) => b.status === 'paid');
const passToken = paidBook?.pass_token;
ok(!!passToken, 'have a pass token to verify');

const passVerify = await req('POST', '/api/passes/verify', studentToken, { token: passToken });
expect(passVerify.status, 200, 'pass verify endpoint');
ok(passVerify.data?.valid === true, 'pass is valid');
ok(passVerify.data?.status === 'paid', 'pass status paid before collection');
ok(passVerify.data?.student?.fullName === 'E2E Tester', 'pass returns student identity');

const forged = await req('POST', '/api/passes/verify', studentToken, {
  token: 'forged.not.a.jwt',
});
ok(forged.data?.valid === false, 'forged pass rejected');

const passCollect = await req('POST', '/api/passes/collect', studentToken, {
  token: passToken,
  location: 'Test Hall',
});
expect(passCollect.status, 403, 'student cannot collect a pass (needs rep)');

// ---- Rep flow ---------------------------------------------------------------
console.log('\nREP PORTAL');
// The chief admin is seeded with ADMIN_PASSWORD (or a random one printed by
// db:setup) — the old published default was removed.
const repSignin = process.env.ADMIN_PASSWORD
  ? await req('POST', '/api/auth/signin', undefined, {
      emailOrRegNo: '20241450652',
      password: process.env.ADMIN_PASSWORD,
    })
  : { status: 0, data: null };
expect(
  repSignin.status,
  200,
  'rep1 (seeded) signin works — set ADMIN_PASSWORD env var',
);
const repToken = repSignin.data?.token;

const overview = await req('GET', '/api/rep/overview', repToken);
expect(overview.status, 200, 'rep overview');
ok(typeof overview.data?.counts?.students === 'number', 'overview has counts');

const users = await req('GET', '/api/rep/users', repToken);
expect(users.status, 200, 'rep sees all users');
const e2eUser = (users.data?.users ?? []).find((u) => u.reg_no === REG);
ok(!!e2eUser, 'rep sees the new student');

const grantRep = await req('PATCH', `/api/rep/users/${e2eUser.id}/role`, repToken, {
  role: 'class_rep',
});
expect(grantRep.status, 200, 'rep can grant rep panel');
const revokeRep = await req('PATCH', `/api/rep/users/${e2eUser.id}/role`, repToken, {
  role: 'student',
});
expect(revokeRep.status, 200, 'rep can revoke rep panel');

const roster = await req('GET', '/api/rep/roster?course=CSC301', repToken);
expect(roster.status, 200, 'rep roster for CSC301');
const rosterRow = (roster.data?.roster ?? []).find((r) => r.reg_no === REG);
ok(!!rosterRow, 'student appears in CSC301 roster');
ok(rosterRow?.status === 'paid', 'student shows paid before collection');

const collectRow = await req('POST', `/api/rep/roster/${rosterRow.student_textbook_id}/collect`, repToken);
expect(collectRow.status, 200, 'rep marks collected');
const roster2 = await req('GET', '/api/rep/roster?course=CSC301', repToken);
ok(
  (roster2.data?.roster ?? []).find((r) => r.reg_no === REG)?.status === 'collected',
  'student now collected',
);

const revertRow = await req('POST', `/api/rep/roster/${rosterRow.student_textbook_id}/revert`, repToken);
expect(revertRow.status, 200, 'rep can revert collection');

// Rep rep-managed textbooks CRUD
const created = await req('POST', '/api/rep/textbooks', repToken, {
  courseCode: 'E2E101',
  courseTitle: 'E2E Test Course',
  price: 1000,
});
expect(created.status, 201, 'rep creates textbook');
const delBook = await req('DELETE', `/api/rep/textbooks/${created.data?.textbook?.id}`, repToken);
expect(delBook.status, 200, 'rep deletes textbook');

// ---- Notifications -----------------------------------------------------------
console.log('\nNOTIFICATIONS');
const notifs = await req('GET', '/api/notifications', studentToken);
expect(notifs.status, 200, 'student notifications');
const types = new Set((notifs.data?.notifications ?? []).map((n) => n.type));
ok(types.has('payment'), 'got payment notification');
ok(types.has('collection'), 'got collection notification');
const markAll = await req('PATCH', '/api/notifications/read-all', studentToken);
expect(markAll.status, 200, 'mark all read');

// ---- Access control ----------------------------------------------------------
console.log('\nACCESS CONTROL');
const noToken = await req('GET', '/api/me/textbooks');
expect(noToken.status, 401, 'protected route rejects no token');
const studentOnRep = await req('GET', '/api/rep/roster?course=CSC301', studentToken);
expect(studentOnRep.status, 403, 'student cannot access rep roster');

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.log('Failures:', failures.join(' | '));
  process.exit(1);
}
console.log('E2E green. Clean up test data with: npm run db:clean');
