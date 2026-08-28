// Central API client. Every data read/write in the app goes through here —
// the backend owns all logic, the frontend never touches a database.
import { API_BASE_URL } from '../config';
import type {
  AppSettings,
  NotificationItem,
  PaymentTransaction,
  PortalUser,
  StudentProfile,
  Textbook,
} from '../types';

const TOKEN_KEY = 'webuy_token';

export function getToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setToken(token: string | null): void {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    // ignore
  }
}

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function request<T>(path: string, opts: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(opts.headers as Record<string, string> | undefined),
  };
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  let res: Response;
  try {
    res = await fetch(`${API_BASE_URL}${path}`, { ...opts, headers });
  } catch {
    throw new ApiError(0, 'Network error — could not reach the backend');
  }

  const text = await res.text();
  let body: unknown = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }

  if (!res.ok) {
    const message =
      body && typeof body === 'object' && 'error' in body
        ? String((body as { error: unknown }).error)
        : `Request failed (${res.status})`;
    throw new ApiError(res.status, message);
  }
  return body as T;
}

const json = (method: string, body?: unknown): RequestInit => ({
  method,
  body: body === undefined ? undefined : JSON.stringify(body),
});

// ---- Auth -----------------------------------------------------------------
export interface AuthStudent {
  id: string;
  regNo: string;
  fullName: string;
  email: string;
  phone: string | null;
  department: string;
  level: string;
  role: 'student' | 'class_rep' | 'chief_admin';
  emailVerified: boolean;
  avatarUrl: string | null;
  freeProfileEditUsed?: boolean;
  phoneEditCount?: number;
  marketAccess?: boolean;
  classId?: string | null;
  className?: string | null;
  inviteCode?: string | null;
}

export interface SignupResult {
  email: string;
  student: {
    id: null;
    regNo: string;
    fullName: string;
    email: string;
    phone: string | null;
    department: string;
    level: string;
    role: 'student';
    emailVerified: boolean;
  };
}

export interface SigninResult {
  token: string;
  student: AuthStudent;
}

export const authApi = {
  signup: (body: {
    regNo: string;
    fullName: string;
    email: string;
    phone?: string;
    password: string;
    inviteCode: string;
  }) => request<SignupResult>('/api/auth/signup', json('POST', { ...body, origin: window.location.origin })),

  signin: (body: { emailOrRegNo: string; password: string }) =>
    request<SigninResult>('/api/auth/signin', json('POST', body)),

  me: () => request<{ student: AuthStudent }>('/api/auth/me'),

  changePassword: (body: { currentPassword: string; newPassword: string }) =>
    request<{ ok: boolean }>('/api/auth/change-password', json('POST', body)),

  updateMe: (body: { department?: string; level?: string; regNo?: string }) =>
    request<{ student: AuthStudent; points: number }>('/api/auth/me', json('PATCH', body)),

  resendVerification: (emailOrRegNo: string) =>
    request<{ ok: boolean; sent: boolean; email?: string; cooldown?: number }>(
      '/api/auth/resend-verification',
      json('POST', { emailOrRegNo, origin: window.location.origin }),
    ),

  verifyEmail: (token: string) =>
    request<SigninResult>('/api/auth/verify-email', json('POST', { token })),

  forgotPassword: (emailOrRegNo: string) =>
    request<{ ok: boolean }>('/api/auth/forgot-password', json('POST', { emailOrRegNo, origin: window.location.origin })),

  resetPassword: (token: string, newPassword: string) =>
    request<SigninResult>('/api/auth/reset-password', json('POST', { token, newPassword })),
};

// ---- Vercel serverless email sender ---------------------------------------
// Triggers the frontend-hosted mail drainer. In production this drains the
// mail_queue outbox via Gmail SMTP; locally the worker spawned by `npm run dev`
// drains the same outbox, so the call is a fire-and-forget trigger either way.
const EMAIL_FN_URL =
  (import.meta.env.VITE_EMAIL_FN_URL as string | undefined) ??
  '/api/send-verification';

export async function sendVerificationEmail(): Promise<void> {
  const res = await fetch(EMAIL_FN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{}',
  });
  if (!res.ok) {
    throw new Error('Could not send verification email');
  }
}

// ---- Data adapters ---------------------------------------------------------
const DEFAULT_AVATAR =
  'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&q=80&w=250';

// Offline-friendly placeholder so <img> never gets an empty src.
const DEFAULT_COVER =
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="300" height="400">' +
      '<rect width="100%" height="100%" fill="#e2e8f0"/>' +
      '<text x="50%" y="50%" font-family="sans-serif" font-size="22" fill="#64748b" text-anchor="middle">Webuy</text>' +
      '</svg>',
  );

export function toStudentProfile(s: AuthStudent, settings: AppSettings): StudentProfile {
  return {
    id: s.id,
    regNo: s.regNo,
    fullName: s.fullName,
    department: s.department,
    faculty: s.department,
    level: `${s.level}`.includes('Level') ? s.level : `${s.level} Level`,
    academicSession: '2025/2026 First Semester',
    email: s.email,
    phone: s.phone ?? '',
    avatarUrl: s.avatarUrl ?? DEFAULT_AVATAR,
    emailVerified: s.emailVerified,
    freeProfileEditUsed: s.freeProfileEditUsed,
    phoneEditCount: s.phoneEditCount,
    marketAccess: Boolean(s.marketAccess),
    classId: s.classId ?? null,
    className: s.className ?? null,
    inviteCode: s.inviteCode ?? null,
  };
}

interface MyTextbookRow {
  textbook_id: string;
  student_textbook_id: string | null;
  course_code: string;
  course_title: string;
  book_title: string;
  author: string | null;
  edition: string | null;
  price: number;
  isbn: string | null;
  department: string;
  level: string;
  lecturer_name: string | null;
  pickup_location: string;
  class_rep_name: string | null;
  cover_url: string | null;
  status: 'unpaid' | 'paid' | 'collected' | null;
  paid_at: string | null;
  collected_at: string | null;
  transaction_reference: string | null;
  pass_token: string | null;
}

export function toTextbook(r: MyTextbookRow): Textbook {
  return {
    id: r.textbook_id,
    studentTextbookId: r.student_textbook_id ?? undefined,
    courseCode: r.course_code,
    courseTitle: r.course_title,
    bookTitle: r.book_title,
    author: r.author ?? '',
    edition: r.edition ?? '',
    price: r.price,
    status: r.status ?? 'unpaid',
    coverUrl: r.cover_url || DEFAULT_COVER,
    department: r.department,
    level: r.level,
    lecturerName: r.lecturer_name ?? '',
    isbn: r.isbn ?? '',
    pickupLocation: r.pickup_location,
    classRepName: r.class_rep_name ?? '',
    paidAt: r.paid_at ?? undefined,
    collectedAt: r.collected_at ?? undefined,
    transactionRef: r.transaction_reference ?? undefined,
    passToken: r.pass_token ?? undefined,
  };
}

interface CatalogRow {
  id: string;
  course_code: string;
  course_title: string;
  book_title: string;
  author: string | null;
  edition: string | null;
  price: number;
  isbn: string | null;
  department: string;
  level: string;
  lecturer_name: string | null;
  pickup_location: string;
  class_rep_name: string | null;
  cover_url: string | null;
  added_by?: string | null;
}

export function toCatalogTextbook(r: CatalogRow): Textbook {
  return {
    id: r.id,
    courseCode: r.course_code,
    courseTitle: r.course_title,
    bookTitle: r.book_title,
    author: r.author ?? '',
    edition: r.edition ?? '',
    price: r.price,
    status: 'unpaid',
    coverUrl: r.cover_url || DEFAULT_COVER,
    department: r.department,
    level: r.level,
    lecturerName: r.lecturer_name ?? '',
    isbn: r.isbn ?? '',
    pickupLocation: r.pickup_location,
    classRepName: r.class_rep_name ?? '',
    addedBy: r.added_by ?? null,
  };
}

interface TransactionRow {
  reference: string;
  amount: number;
  fee: number;
  total: number;
  method: string;
  status: string;
  createdAt: string;
  books: { courseCode: string; courseTitle?: string; bookTitle: string; amount: number }[];
  category?: 'purchase' | 'topup' | 'refund';
  direction?: 'in' | 'out';
  note?: string | null;
}

export function toTransaction(r: TransactionRow, regNo: string): PaymentTransaction {
  const isDeposit = r.method === 'points_deposit';
  const isRefund = r.method === 'points_refund';
  return {
    id: r.reference,
    textbookId: r.reference,
    bookTitle: r.books[0]?.bookTitle ?? 'Textbook',
    courseCode: r.books[0]?.courseCode ?? 'COURSE',
    courseTitle: r.books[0]?.courseTitle ?? '',
    amount: r.books[0]?.amount ?? r.amount,
    fee: r.fee,
    total: r.total,
    date: r.createdAt,
    status: (r.status === 'success'
      ? 'successful'
      : r.status) as PaymentTransaction['status'],
    reference: r.reference,
    method: (
      r.method === 'card'
        ? 'card'
        : r.method === 'bank_transfer'
          ? 'bank_transfer'
          : 'wallet'
    ) as PaymentTransaction['method'],
    category: r.category ?? (isDeposit ? 'topup' : isRefund ? 'refund' : 'purchase'),
    direction: r.direction ?? (isDeposit || isRefund ? 'in' : 'out'),
    studentRegNo: regNo,
    books: r.books,
    note: r.note ?? null,
  };
}

// ---- Textbooks / transactions ---------------------------------------------
export const dataApi = {
  getCatalog: () =>
    request<{ textbooks: CatalogRow[] }>('/api/textbooks').then((r) =>
      r.textbooks.map(toCatalogTextbook),
    ),

  getMyTextbooks: () =>
    request<{ textbooks: MyTextbookRow[] }>('/api/me/textbooks').then((r) =>
      r.textbooks.map(toTextbook),
    ),

  assignTextbook: (textbookId: string) =>
    request<{ ok: boolean; studentTextbookId: string }>(
      '/api/me/textbooks',
      json('POST', { textbookId }),
    ),

  getMyTransactions: (regNo: string) =>
    request<{ transactions: TransactionRow[] }>('/api/me/transactions').then((r) =>
      r.transactions.map((t) => toTransaction(t, regNo)),
    ),
};

// ---- Points wallet ----------------------------------------------------------
export interface WalletTransaction {
  id: string;
  kind: 'deposit' | 'purchase' | 'refund';
  amount: number;
  reference: string;
  note?: string | null;
  created_at: string;
}

export const walletApi = {
  get: () =>
    request<{
      points: number;
      accountNumber: string;
      bankName: string;
      accountName: string;
      fundingError?: string | null;
      transactions: WalletTransaction[];
    }>('/api/wallet'),

  provision: () =>
    request<{
      ok: boolean;
      accountNumber: string;
      bankName: string;
      accountName: string;
      fundingError?: string | null;
    }>('/api/wallet/provision'),

  updatePhone: (phone: string) =>
    request<{
      ok: boolean;
      phone: string;
      points: number;
      accountNumber: string;
      bankName: string;
      accountName: string;
      fundingError?: string | null;
      transactions?: WalletTransaction[];
    }>('/api/wallet/phone', json('POST', { phone })),

  verify: () =>
    request<{
      ok: boolean;
      credited: number;
      totalFund: number;
      points: number;
      accountNumber: string;
      bankName: string;
      accountName: string;
      fundingError?: string | null;
      transactions?: WalletTransaction[];
    }>('/api/wallet/verify', json('POST')),

  checkout: (studentTextbookIds: string[]) =>
    request<{
      ok: boolean;
      spent: number;
      remaining: number;
      reference: string;
      paidIds: string[];
    }>('/api/wallet/checkout', json('POST', { studentTextbookIds })),
};

// ---- Passes ----------------------------------------------------------------
export interface PassVerifyResult {
  valid: boolean;
  reason?: string;
  status?: string;
  student?: {
    id: string;
    fullName: string;
    regNo: string;
    department: string;
    level: string;
  };
  book?: { courseCode: string; title: string };
  pickupLocation?: string;
}

export const passesApi = {
  verify: (token: string) =>
    request<PassVerifyResult>('/api/passes/verify', json('POST', { token })),

  collect: (token: string, location?: string) =>
    request<{ ok: boolean; collectedAt: string }>(
      '/api/passes/collect',
      json('POST', { token, location }),
    ),
};

// ---- Rep / admin -----------------------------------------------------------
export interface RosterItem {
  studentTextbookId: string;
  studentId: string;
  fullName: string;
  regNo: string;
  department: string;
  level: string;
  courseCode: string;
  bookTitle: string;
  pickupLocation: string;
  status: 'unpaid' | 'paid' | 'collected';
  isCollected: boolean;
  addedBy: string | null;
  paidAt: string | null;
  collectedAt: string | null;
  transactionRef: string | null;
}

function toRoster(r: Record<string, unknown>): RosterItem {
  return {
    studentTextbookId: String(r.student_textbook_id),
    studentId: String(r.student_id),
    fullName: String(r.full_name),
    regNo: String(r.reg_no),
    department: String(r.department),
    level: String(r.level),
    courseCode: String(r.course_code),
    bookTitle: String(r.book_title),
    pickupLocation: String(r.pickup_location),
    status: r.status as RosterItem['status'],
    isCollected: r.status === 'collected',
    addedBy: (r.added_by as string | null) ?? null,
    paidAt: (r.paid_at as string | null) ?? null,
    collectedAt: (r.collected_at as string | null) ?? null,
    transactionRef: (r.transaction_reference as string | null) ?? null,
  };
}

export interface PayoutRequest {
  id: string;
  amount: number;
  copies: number;
  status: string;
  reference: string;
  created_at: string;
  course_code?: string;
  course_title?: string;
  price?: number;
  rep_name?: string;
  rep_reg_no?: string;
  account_name?: string;
  account_number?: string;
  bank_name?: string;
}

export const repApi = {
  getRoster: (course: string) =>
    request<{
      course: string;
      roster: Record<string, unknown>[];
      ownerId: string | null;
      availableSlots: number | null;
    }>(`/api/rep/roster?course=${encodeURIComponent(course)}`).then((r) => ({
      roster: r.roster.map(toRoster),
      ownerId: r.ownerId,
      availableSlots: r.availableSlots,
    })),

  grantToggles: (textbookId: string, copies: number) =>
    request<{ ok: boolean }>(
      `/api/rep/toggles/${textbookId}/grant`,
      json('POST', { copies }),
    ),

  collectRoster: (id: string, location?: string) =>
    request<{ ok: boolean }>(
      `/api/rep/roster/${id}/collect`,
      json('POST', { location }),
    ),

  revertRoster: (id: string) =>
    request<{ ok: boolean }>(`/api/rep/roster/${id}/revert`, json('POST')),

  getUsers: () =>
    request<{ users: Record<string, unknown>[] }>('/api/rep/users').then((r) =>
      r.users.map(
        (u): PortalUser => ({
          id: String(u.id),
          regNo: String(u.reg_no),
          fullName: String(u.full_name),
          email: String(u.email),
          department: String(u.department),
          level: String(u.level),
          role: u.role as PortalUser['role'],
          emailVerified: Boolean(u.email_verified),
          marketAccess: Boolean(u.market_access),
          createdAt: String(u.created_at),
        }),
      ),
    ),

  setUserRole: (id: string, role: 'student' | 'class_rep') =>
    request<{ ok: boolean }>(
      `/api/rep/users/${id}/role`,
      json('PATCH', { role }),
    ),

  deleteUser: (id: string) =>
    request<{ ok: boolean; deleted: string }>(
      `/api/rep/users/${id}`,
      { method: 'DELETE' },
    ),

  setSecretAccess: (id: string, access: boolean) =>
    request<{ ok: boolean; access: boolean }>(
      `/api/rep/users/${id}/secret-access`,
      json('PATCH', { access }),
    ),

  getOverview: () =>
    request<{
      counts: {
        students: number;
        textbooks: number;
        paid: number;
        collected: number;
      };
      recentTransactions: {
        reference: string;
        amount: number;
        status: string;
        created_at: string;
        full_name: string | null;
        reg_no: string | null;
      }[];
      recentCollections: Record<string, unknown>[];
    }>('/api/rep/overview'),

  getRevenue: () =>
    request<{ revenue: number; paidBooks: number }>('/api/rep/revenue'),

  createPayout: (body: {
    textbookId: string;
    copies: number;
    accountNumber: string;
    bankCode: string;
    bankName: string;
  }) =>
    request<{ payout: PayoutRequest }>('/api/rep/payouts', json('POST', body)),

  getBanks: () =>
    request<{ banks: { code: string; name: string }[] }>('/api/rep/banks').then(
      (r) => r.banks,
    ),

  resolveAccount: (body: { accountNumber: string; bankCode: string }) =>
    request<{ accountName: string; accountNumber: string }>(
      '/api/rep/resolve-account',
      json('POST', body),
    ),

  getPayouts: () =>
    request<{ payouts: PayoutRequest[] }>('/api/rep/payouts').then(
      (r) => r.payouts,
    ),

  settlePayout: (id: string) =>
    request<{ ok: boolean; payout: { id: string; amount: number; status: string } }>(
      `/api/rep/payouts/${id}/settle`,
      json('POST'),
    ),

  getPaidCopies: (textbookId: string) =>
    request<{ paid: number }>(
      `/api/rep/textbooks/${textbookId}/paid-count`,
    ).then((r) => r.paid),

  getReps: () =>
    request<{ reps: { id: string; full_name: string; reg_no: string }[] }>(
      '/api/rep/reps',
    ).then((r) => r.reps),

  createTextbook: (body: Record<string, unknown>) =>
    request<{ textbook: { id: string } }>('/api/rep/textbooks', json('POST', body)),

  updateTextbook: (id: string, body: Record<string, unknown>) =>
    request<{ ok: boolean }>(`/api/rep/textbooks/${id}`, json('PATCH', body)),

  transferTextbook: (id: string, repId: string) =>
    request<{ ok: boolean }>(
      `/api/rep/textbooks/${id}/transfer`,
      json('PATCH', { repId }),
    ),

  deleteTextbook: (id: string) =>
    request<{ ok: boolean }>(`/api/rep/textbooks/${id}`, json('DELETE')),

  getDeletedTextbooks: () =>
    request<{ textbooks: CatalogRow[] }>('/api/rep/textbooks/deleted').then(
      (r) => r.textbooks.map(toCatalogTextbook),
    ),

  restoreTextbook: (id: string) =>
    request<{ ok: boolean }>(`/api/rep/textbooks/${id}/restore`, json('POST')),

  purgeTextbook: (id: string) =>
    request<{ ok: boolean }>(`/api/rep/textbooks/${id}/purge`, json('POST')),
};

// ---- Database Monitor (chief admin only) -----------------------------------
export interface DbTableInfo {
  tableName: string;
  size: string;
  sizeBytes: number;
  approxRows: number;
}

export interface DbMonitorData {
  db: {
    name: string;
    size: string;
    connections: number;
    generatedAt: string;
  };
  tables: DbTableInfo[];
  counts: {
    students: number;
    classes: number;
    textbooks_active: number;
    textbooks_deleted: number;
    assignments: number;
    wallet_txns: number;
    payouts: number;
    collections: number;
  };
  transactions: {
    kind: string;
    n: number;
    credits: number;
    debits: number;
  }[];
  mail: { status: string; n: number }[];
  notifications: {
    read_notifications: number;
    unread_notifications: number;
    expired_verification_tokens: number;
    expired_password_resets: number;
    stale_signups: number;
  };
}

export const dbApi = {
  monitor: () => request<DbMonitorData>('/api/rep/db-monitor'),
};

// ---- Classes ---------------------------------------------------------------
export interface ClassInfo {
  id: string;
  name: string;
  department: string;
  level: string;
  admin: { id: string; fullName: string; regNo: string } | null;
  studentCount: number;
  isMine: boolean;
  inviteCode: string | null;
}

export const classesApi = {
  list: () =>
    request<{ classes: ClassInfo[] }>('/api/classes').then((r) => r.classes),

  create: (body: {
    name: string;
    department: string;
    level: string;
    inviteCode?: string;
    adminId?: string;
  }) =>
    request<{
      class: {
        id: string;
        name: string;
        department: string;
        level: string;
        invite_code: string;
        admin_id: string | null;
      };
    }>('/api/classes', json('POST', body)),

  changeCode: (id: string, inviteCode: string) =>
    request<{ ok: boolean; inviteCode: string }>(
      `/api/classes/${id}/invite-code`,
      json('PATCH', { inviteCode }),
    ),

  updateLevel: (id: string, level: string) =>
    request<{ ok: boolean; level: string; studentsUpdated: number }>(
      `/api/classes/${id}/level`,
      json('PATCH', { level }),
    ),
};

// ---- Notifications ---------------------------------------------------------
export const notificationsApi = {
  get: (unreadOnly = false) =>
    request<{ notifications: Record<string, unknown>[] }>(
      `/api/notifications${unreadOnly ? '?unread=1' : ''}`,
    ).then((r) =>
      r.notifications.map(
        (n): NotificationItem => ({
          id: String(n.id),
          type: String(n.type),
          title: String(n.title),
          body: String(n.body ?? ''),
          read: Boolean(n.read),
          createdAt: String(n.created_at),
        }),
      ),
    ),

  markAllRead: () =>
    request<{ ok: boolean }>('/api/notifications/read-all', json('PATCH')),

  markRead: (id: string) =>
    request<{ ok: boolean }>(`/api/notifications/${id}/read`, json('PATCH')),
};

// ---- Common account ledger --------------------------------------------------
export interface AccountEntry {
  type: 'deposit' | 'withdrawal';
  amount: number;
  note?: string | null;
  created_at: string;
}

export interface AccountTransaction {
  kind: 'deposit' | 'withdrawal' | 'purchase';
  amount: number;
  person: string;
  reg_no: string | null;
  reference: string;
  status: string;
  rep?: string;
  book?: string;
  created_at: string;
}

export const accountApi = {
  get: () =>
    request<{
      balance: number;
      textbookValue: number;
      withdrawals: number;
      livePocketFi: number | null;
      userWallets: number;
      recent: AccountEntry[];
    }>('/api/account'),

  transactions: (params?: {
    q?: string;
    from?: string;
    to?: string;
    limit?: number;
    offset?: number;
    view?: 'purchases' | 'payins';
    repId?: string;
  }) => {
    const qs = new URLSearchParams();
    if (params?.q) qs.set('q', params.q);
    if (params?.from) qs.set('from', params.from);
    if (params?.to) qs.set('to', params.to);
    if (params?.limit) qs.set('limit', String(params.limit));
    if (params?.offset) qs.set('offset', String(params.offset));
    if (params?.view) qs.set('view', params.view);
    if (params?.repId) qs.set('repId', params.repId);
    const suffix = qs.toString() ? `?${qs.toString()}` : '';
    return request<{
      transactions: AccountTransaction[];
      total: number;
      limit: number;
      offset: number;
    }>(`/api/account/transactions${suffix}`);
  },
};

// ---- Secret Marketplace -----------------------------------------------------
export interface SecretProduct {
  id: string;
  name: string;
  price: number;
  basePrice?: number;
  purchaseCount?: number;
}
export interface SecretPurchase {
  id: string;
  productId: string;
  price: number;
  status: string;
  paidAt: string;
  name: string;
}
export interface SecretOrder {
  id: string;
  price: number;
  status: string;
  paidAt: string;
  studentId: string;
  fullName: string;
  regNo: string;
  productId: string;
  productName: string;
}

export const secretApi = {
  access: () => request<{ access: boolean }>('/api/secret/access'),

  products: () =>
    request<{ products: SecretProduct[]; points: number }>(
      '/api/secret/products',
    ).then((r) => ({
      points: r.points,
      products: r.products.map((p) => ({ ...p, basePrice: p.basePrice })),
    })),

  purchases: () =>
    request<{ purchases: SecretPurchase[] }>('/api/secret/purchases'),

  orders: () =>
    request<{ orders: SecretOrder[] }>('/api/secret/orders'),

  buy: (productId: string) =>
    request<{ ok: boolean; points: number; product: SecretProduct }>(
      '/api/secret/buy',
      json('POST', { productId }),
    ),

  createProduct: (body: { name: string; price: number }) =>
    request<{ ok: boolean }>('/api/secret/products', json('POST', body)),

  deleteProduct: (id: string) =>
    request<{ ok: boolean }>(`/api/secret/products/${id}`, {
      method: 'DELETE',
    }),
};
