// PocketFi client — shared merchant account + per-student funding accounts.
// Real endpoints (see https://developer.pocketfi.ng, base https://api.pocketfi.ng/api/v1):
//   POST /virtual-accounts/create        -> create virtual account
//   GET  /virtual-accounts/fetch         -> list accounts + total_fund
//   GET  /account/balance                -> wallet balance (naira)
import { randomBytes } from 'node:crypto';
import { config } from '../config';
import { HttpError } from './http';

function pocketfiFetch(url: string, init: RequestInit = {}): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20_000);
  return fetch(url, {
    ...init,
    signal: controller.signal,
    headers: {
      Authorization: `Bearer ${config.pocketfiSecret}`,
      'Content-Type': 'application/json',
      ...init.headers,
    },
  })
    .catch((err) => {
      if ((err as Error).name === 'AbortError') {
        throw new HttpError(504, 'PocketFi request timed out. Try again.');
      }
      throw err;
    })
    .finally(() => clearTimeout(timer));
}

export function makeDepositReference(): string {
  return `WEBUY-${Date.now().toString(36).toUpperCase()}-${randomBytes(4)
    .toString('hex')
    .toUpperCase()}`;
}

export interface VirtualAccount {
  accountNumber: string;
  bankName: string;
  accountName: string;
  customerId: string;
}

/**
 * Create (or reuse) a PocketFi virtual account for a student. All funds still
 * settle into the merchant's PocketFi balance; the account only labels who paid.
 * NIN/BVN are NOT sent — they're only required for PalmPay funding accounts or
 * withdrawals, which Webuy users don't perform directly.
 */
export async function createPocketFiVirtualAccount(opts: {
  studentId: string;
  email: string;
  fullName: string;
  regNo: string;
  phone?: string | null;
}): Promise<VirtualAccount> {
  // MOCK mode: synthesise a stable virtual account from the student id so the
  // deposit flow is testable without a PocketFi key.
  if (!config.pocketfiSecret) {
    const digits = opts.studentId.replace(/[^0-9a-f]/gi, '').slice(0, 10).toUpperCase();
    return {
      accountNumber: `10${digits.padEnd(8, '0').slice(0, 8)}`,
      bankName: 'MOCK BANK',
      accountName: opts.fullName,
      customerId: opts.studentId,
    };
  }

  const [first, ...rest] = opts.fullName.trim().split(/\s+/);
  const res = await pocketfiFetch(`${config.pocketfiBase}/virtual-accounts/create`, {
    method: 'POST',
    body: JSON.stringify({
      first_name: first ?? opts.fullName,
      last_name: rest.join(' ') || (first ?? ''),
      email: opts.email,
      phone: opts.phone ?? '',
      bank: config.pocketfiBank,
      businessId: config.pocketfiBusinessId,
    }),
  });
  if (!res.ok) {
    throw new HttpError(502, `PocketFi virtual account failed (${res.status})`);
  }
  const json = (await res.json()) as {
    status?: unknown;
    banks?: Array<{ bankName?: string; accountNumber?: string; accountName?: string }>;
    message?: string;
  };
  if (json.status !== true) {
    throw new HttpError(502, json.message ?? 'PocketFi virtual account failed');
  }
  const bank = json.banks?.[0];
  return {
    accountNumber: bank?.accountNumber ?? '',
    bankName: bank?.bankName ?? config.pocketfiBank,
    accountName: bank?.accountName ?? first ?? opts.fullName,
    customerId: opts.studentId,
  };
}

/**
 * Fetch every virtual account under the business with its cumulative funded
 * amount (`total_fund`). This is PocketFi's authoritative per-VA balance and is
 * what we use to reconcile a student's points when a webhook didn't arrive
 * (e.g. the API isn't deployed at a public webhook URL yet).
 */
export async function fetchVirtualAccountsFunds(): Promise<
  { accountNumber: string; totalFund: number; name: string }[]
> {
  if (!config.pocketfiSecret) return [];
  const res = await pocketfiFetch(
    `${config.pocketfiBase}/virtual-accounts/fetch?businessId=${config.pocketfiBusinessId}`,
  );
  if (!res.ok) {
    throw new HttpError(502, `PocketFi virtual accounts failed (${res.status})`);
  }
  const json = (await res.json()) as {
    status?: unknown;
    accounts?: Array<{ account?: string | number; total_fund?: string | number; name?: string }>;
  };
  if (json.status !== true || !Array.isArray(json.accounts)) {
    throw new HttpError(502, 'PocketFi virtual accounts failed');
  }
  return json.accounts.map((a) => ({
    accountNumber: String(a.account ?? ''),
    totalFund: Math.floor(Number(a.total_fund ?? 0)),
    name: String(a.name ?? ''),
  }));
}

/** Pull the current wallet balance (naira) from PocketFi. */
export async function getPocketFiBalance(): Promise<number> {
  if (!config.pocketfiSecret) return 0;
  const res = await pocketfiFetch(`${config.pocketfiBase}/account/balance`);
  if (!res.ok) {
    throw new HttpError(502, `PocketFi balance failed (${res.status})`);
  }
  const json = (await res.json()) as {
    status?: unknown;
    balance?: number | string;
    message?: string;
  };
  if (json.status !== true) {
    throw new HttpError(502, json.message ?? 'PocketFi balance failed');
  }
  return Math.round(Number(json.balance ?? 0));
}

/**
 * Verify the owner's name of a bank account before a payout transfer. The rep
 * enters bank code + account number; PocketFi returns the authoritative account
 * name, which the rep then confirms. The server always uses this resolved name.
 */
export async function verifyBankAccount(opts: {
  accountNumber: string;
  bankCode: string;
}): Promise<{ accountName: string; accountNumber: string }> {
  const res = await pocketfiFetch(`${config.pocketfiBase}/payout/verify-bank`, {
    method: 'POST',
    body: JSON.stringify({
      account_number: opts.accountNumber,
      bank_code: opts.bankCode,
    }),
  });
  if (!res.ok) {
    throw new HttpError(502, `PocketFi bank verify failed (${res.status})`);
  }
  const json = (await res.json()) as {
    status?: unknown;
    account_name?: string;
    message?: string;
  };
  const ok = json.status === 'success' || json.status === true;
  if (!ok || !json.account_name) {
    throw new HttpError(400, json.message ?? 'Could not verify this account number');
  }
  return {
    accountName: String(json.account_name),
    accountNumber: opts.accountNumber,
  };
}

/**
 * List PocketFi banks (code + name) so the rep can pick the right one. Parsed
 * defensively against a few common response shapes.
 */
export async function listPocketFiBanks(): Promise<{ code: string; name: string }[]> {
  const res = await pocketfiFetch(`${config.pocketfiBase}/payout/bank-list`);
  if (!res.ok) {
    throw new HttpError(502, `PocketFi bank list failed (${res.status})`);
  }
  const json = (await res.json()) as unknown;
  let arr: unknown[] = [];
  if (Array.isArray(json)) arr = json;
  else if (json && typeof json === 'object') {
    const obj = json as Record<string, unknown>;
    if (Array.isArray(obj.banks)) arr = obj.banks;
    else if (Array.isArray(obj.data)) arr = obj.data;
    else if (Array.isArray(obj.result)) arr = obj.result;
  }
  const out: { code: string; name: string }[] = [];
  for (const b of arr) {
    if (!b || typeof b !== 'object') continue;
    const rec = b as Record<string, unknown>;
    const code = String(rec.code ?? rec.bank_code ?? rec.bankCode ?? '');
    const name = String(rec.name ?? rec.bank_name ?? rec.bankName ?? '');
    if (code && name) out.push({ code, name });
  }
  return out;
}

