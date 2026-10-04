export type SyncEntityType =
  | 'raw_material'
  | 'supplier'
  | 'final_product'
  | 'recipe_item'
  | 'cash_bank_account'
  | 'operational_expense'
  | 'expense_category'
  | 'raw_material_category'
  | 'purchase_return';

export type LocalSyncOperationStatus = 'pending' | 'syncing' | 'synced' | 'failed';
export type LocalSyncOperationType = 'create' | 'update' | 'delete';

export interface LocalSyncOperation {
  id?: number;
  localOpId: string;
  restaurantId: number;
  entityType: SyncEntityType;
  entityId: string;
  operationType: LocalSyncOperationType;
  payload: Record<string, any>;
  status: LocalSyncOperationStatus;
  version: number;
  retryCount: number;
  errorMessage?: string;
  clientUpdatedAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface SyncMeta {
  key: string;
  value: string;
}

// ─── Cash / Bank Account Transactions ────────────────────────────────────────

export type CashTransactionType =
  | 'sale_income' // فروش (فاکتور فروش)
  | 'credit_payment' // دریافت وجه بابت نسیه
  | 'expense_payment' // پرداخت هزینه
  | 'purchase_payment' // پرداخت به تامین‌کننده
  | 'manual_in' // ورودی دستی
  | 'manual_out'; // خروجی دستی

export type CashAccountType = 'cash' | 'card' | 'online' | 'bank';

export interface CashAccountTransaction {
  id?: number;
  restaurantId: number;
  accountType: CashAccountType;
  accountName: string; // 'صندوق' | 'کارتخوان' | 'آنلاین' | نام بانک
  transactionType: CashTransactionType;
  amount: number; // positive = ورودی, negative = خروجی
  orderId?: number;
  orderNumber?: string;
  customerPhone?: string;
  referenceCode?: string; // RRN / tracking code from card terminal
  description?: string;
  date: string; // YYYY-MM-DD
  createdAt: string;
  localId?: string; // unique local ID for server dedup
  syncStatus?: 'pending' | 'synced' | 'failed';
}
