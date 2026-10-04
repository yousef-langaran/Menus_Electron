import { CashTransactionType, CashAccountType, CashAccountTransaction } from './accountingDbTypes';
import { accountingDb } from './accountingDbCore';

// ─── Cash Account Transaction Helpers ────────────────────────────────────────

export function accountTypeLabel(type: CashAccountType): string {
  switch (type) {
    case 'cash':
      return 'صندوق';
    case 'card':
      return 'کارتخوان';
    case 'online':
      return 'آنلاین';
    case 'bank':
      return 'بانک';
    default:
      return type;
  }
}

export async function recordCashTransaction(
  input: Omit<CashAccountTransaction, 'id' | 'createdAt' | 'localId' | 'syncStatus'>,
): Promise<number> {
  const now = new Date().toISOString();
  const localId = `tx-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  return accountingDb.cashAccountTransactions.add({
    ...input,
    localId,
    syncStatus: 'pending',
    date: input.date || now.slice(0, 10),
    createdAt: now,
  });
}

export async function recordOrderPaymentTransactions(params: {
  restaurantId: number;
  orderId?: number;
  orderNumber?: string;
  customerPhone?: string;
  paymentMethod: 'cash' | 'card' | 'online' | 'mixed' | 'credit';
  finalAmount: number;
  splitCash: number;
  splitCard: number;
  splitOnline: number;
  mixedHasCredit: boolean;
  referenceCode?: string;
  cashAccountName?: string; // e.g., "صندوق جلو" (defaults to 'صندوق')
  cardAccountName?: string; // e.g., "کارتخوان ۱" (defaults to 'کارتخوان')
}): Promise<void> {
  const {
    restaurantId,
    orderId,
    orderNumber,
    customerPhone,
    paymentMethod,
    finalAmount,
    splitCash,
    splitCard,
    splitOnline,
    referenceCode,
  } = params;
  const cashName = params.cashAccountName || 'صندوق';
  const cardName = params.cardAccountName || 'کارتخوان';
  const today = new Date().toISOString().slice(0, 10);
  const base = {
    restaurantId,
    orderId,
    orderNumber,
    customerPhone: customerPhone || undefined,
    transactionType: 'sale_income' as CashTransactionType,
    date: today,
    referenceCode: referenceCode || undefined,
  };

  if (paymentMethod === 'cash') {
    await recordCashTransaction({
      ...base,
      accountType: 'cash',
      accountName: cashName,
      amount: finalAmount,
    });
  } else if (paymentMethod === 'card') {
    await recordCashTransaction({
      ...base,
      accountType: 'card',
      accountName: cardName,
      amount: finalAmount,
    });
  } else if (paymentMethod === 'online') {
    await recordCashTransaction({
      ...base,
      accountType: 'online',
      accountName: 'آنلاین',
      amount: finalAmount,
    });
  } else if (paymentMethod === 'mixed' || paymentMethod === 'credit') {
    // Record each portion to its respective account
    if (splitCash > 0) {
      await recordCashTransaction({
        ...base,
        accountType: 'cash',
        accountName: cashName,
        amount: splitCash,
      });
    }
    if (splitCard > 0) {
      await recordCashTransaction({
        ...base,
        accountType: 'card',
        accountName: cardName,
        amount: splitCard,
        referenceCode,
      });
    }
    if (splitOnline > 0) {
      await recordCashTransaction({
        ...base,
        accountType: 'online',
        accountName: 'آنلاین',
        amount: splitOnline,
      });
    }
    // Note: the credit portion is NOT a cash transaction — it's a receivable
  }
}

export async function recordCreditPaymentTransaction(params: {
  restaurantId: number;
  orderId?: number;
  orderNumber?: string;
  customerPhone?: string;
  accountType: CashAccountType;
  amount: number;
  referenceCode?: string;
  description?: string;
}): Promise<number> {
  const today = new Date().toISOString().slice(0, 10);
  return recordCashTransaction({
    restaurantId: params.restaurantId,
    accountType: params.accountType,
    accountName: accountTypeLabel(params.accountType),
    transactionType: 'credit_payment',
    amount: params.amount,
    orderId: params.orderId,
    orderNumber: params.orderNumber,
    customerPhone: params.customerPhone,
    referenceCode: params.referenceCode,
    description: params.description,
    date: today,
  });
}

export async function getCashAccountBalance(
  restaurantId: number,
  accountType?: CashAccountType,
): Promise<number> {
  let rows: CashAccountTransaction[];
  if (accountType) {
    rows = await accountingDb.cashAccountTransactions
      .where('[restaurantId+accountType]')
      .equals([restaurantId, accountType])
      .toArray();
  } else {
    rows = await accountingDb.cashAccountTransactions
      .where('restaurantId')
      .equals(restaurantId)
      .toArray();
  }
  return rows.reduce((sum, r) => sum + Number(r.amount || 0), 0);
}

export async function getCashAccountTransactions(
  restaurantId: number,
  opts?: {
    accountType?: CashAccountType;
    fromDate?: string;
    toDate?: string;
    limit?: number;
  },
): Promise<CashAccountTransaction[]> {
  let rows = (await accountingDb.cashAccountTransactions
    .where('restaurantId')
    .equals(restaurantId)
    .reverse()
    .sortBy('createdAt')) as CashAccountTransaction[];

  if (opts?.accountType) rows = rows.filter((r) => r.accountType === opts.accountType);
  if (opts?.fromDate) rows = rows.filter((r) => r.date >= opts.fromDate!);
  if (opts?.toDate) rows = rows.filter((r) => r.date <= opts.toDate!);
  if (opts?.limit) rows = rows.slice(0, opts.limit);
  return rows;
}

export async function getAllCashAccountsSummary(
  restaurantId: number,
): Promise<
  Array<{ accountType: CashAccountType; accountName: string; balance: number; txCount: number }>
> {
  const all = (await accountingDb.cashAccountTransactions
    .where('restaurantId')
    .equals(restaurantId)
    .toArray()) as CashAccountTransaction[];

  const types: CashAccountType[] = ['cash', 'card', 'online', 'bank'];
  return types
    .map((type) => {
      const txs = all.filter((r) => r.accountType === type);
      const balance = txs.reduce((sum, r) => sum + Number(r.amount || 0), 0);
      return {
        accountType: type,
        accountName: accountTypeLabel(type),
        balance,
        txCount: txs.length,
      };
    })
    .filter((s) => s.txCount > 0 || s.accountType === 'cash' || s.accountType === 'card');
}

export async function getPendingCashTransactions(
  restaurantId: number,
  limit = 100,
): Promise<CashAccountTransaction[]> {
  try {
    return (await accountingDb.cashAccountTransactions
      .where('[restaurantId+syncStatus]')
      .equals([restaurantId, 'pending'])
      .limit(limit)
      .toArray()) as CashAccountTransaction[];
  } catch {
    const all = (await accountingDb.cashAccountTransactions
      .where('restaurantId')
      .equals(restaurantId)
      .toArray()) as CashAccountTransaction[];
    return all.filter((tx) => tx.syncStatus === 'pending').slice(0, limit);
  }
}

export async function markCashTransactionsSynced(ids: number[]): Promise<void> {
  await Promise.all(
    ids.map((id) => accountingDb.cashAccountTransactions.update(id, { syncStatus: 'synced' })),
  );
}
