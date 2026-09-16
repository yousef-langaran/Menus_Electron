import Dexie, { type Table } from 'dexie';
import { catalogDb } from './catalogLocalDb';

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
  | 'sale_income'        // فروش (فاکتور فروش)
  | 'credit_payment'     // دریافت وجه بابت نسیه
  | 'expense_payment'    // پرداخت هزینه
  | 'purchase_payment'   // پرداخت به تامین‌کننده
  | 'manual_in'          // ورودی دستی
  | 'manual_out';        // خروجی دستی

export type CashAccountType = 'cash' | 'card' | 'online' | 'bank';

export interface CashAccountTransaction {
  id?: number;
  restaurantId: number;
  accountType: CashAccountType;
  accountName: string;    // 'صندوق' | 'کارتخوان' | 'آنلاین' | نام بانک
  transactionType: CashTransactionType;
  amount: number;         // positive = ورودی, negative = خروجی
  orderId?: number;
  orderNumber?: string;
  customerPhone?: string;
  referenceCode?: string; // RRN / tracking code from card terminal
  description?: string;
  date: string;           // YYYY-MM-DD
  createdAt: string;
  localId?: string;       // unique local ID for server dedup
  syncStatus?: 'pending' | 'synced' | 'failed';
}

export class MenusAccountingDb extends Dexie {
  rawMaterials!: Table<any, number>;
  suppliers!: Table<any, number>;
  finalProducts!: Table<any, number>;
  recipeItems!: Table<any, number>;
  cashBankAccounts!: Table<any, number>;
  operationalExpenses!: Table<any, number>;
  expenseCategories!: Table<any, number>;
  rawMaterialCategories!: Table<any, number>;
  purchaseInvoices!: Table<any, number>;
  purchaseInvoiceItems!: Table<any, number>;
  cheques!: Table<any, number>;
  customerReceivables!: Table<any, number>;
  purchaseReturns!: Table<any, number>;
  purchaseReturnItems!: Table<any, number>;
  warehouses!: Table<any, number>;
  warehouseTransfers!: Table<any, number>;
  warehouseStocks!: Table<any, number>;
  cashAccountTransactions!: Table<CashAccountTransaction, number>;
  syncOperations!: Table<LocalSyncOperation, number>;
  syncMeta!: Table<SyncMeta, string>;

  constructor() {
    super('menus-accounting-db');
    this.version(1).stores({
      rawMaterials: 'id, restaurantId, updatedAt, name, barcode',
      suppliers: 'id, restaurantId, updatedAt, name',
      finalProducts: 'id, restaurantId, updatedAt, name, productId',
      recipeItems: 'id, restaurantId, updatedAt, finalProductId, rawMaterialId',
      cashBankAccounts: 'id, restaurantId, updatedAt, accountType, name',
      operationalExpenses: 'id, restaurantId, updatedAt, expenseDate, expenseCategoryId',
      syncOperations:
        '++id, localOpId, restaurantId, status, entityType, entityId, createdAt, updatedAt',
      syncMeta: 'key',
    });
    this.version(2).stores({
      rawMaterials: 'id, restaurantId, updatedAt, name, barcode',
      suppliers: 'id, restaurantId, updatedAt, name',
      finalProducts: 'id, restaurantId, updatedAt, name, productId',
      recipeItems: 'id, restaurantId, updatedAt, finalProductId, rawMaterialId',
      cashBankAccounts: 'id, restaurantId, updatedAt, accountType, name',
      operationalExpenses: 'id, restaurantId, updatedAt, expenseDate, expenseCategoryId',
      purchaseInvoices: 'id, restaurantId, updatedAt, supplierId, status, purchaseDate',
      purchaseInvoiceItems: 'id, purchaseInvoiceId, rawMaterialId',
      syncOperations:
        '++id, localOpId, restaurantId, status, entityType, entityId, createdAt, updatedAt',
      syncMeta: 'key',
    });
    this.version(3).stores({
      rawMaterials: 'id, restaurantId, updatedAt, name, barcode',
      suppliers: 'id, restaurantId, updatedAt, name',
      finalProducts: 'id, restaurantId, updatedAt, name, productId',
      recipeItems: 'id, restaurantId, updatedAt, finalProductId, rawMaterialId',
      cashBankAccounts: 'id, restaurantId, updatedAt, accountType, name',
      operationalExpenses: 'id, restaurantId, updatedAt, expenseDate, expenseCategoryId',
      purchaseInvoices:
        'id, restaurantId, updatedAt, supplierId, status, purchaseDate, localSyncStatus, syncError',
      purchaseInvoiceItems: 'id, purchaseInvoiceId, rawMaterialId',
      syncOperations:
        '++id, localOpId, restaurantId, status, entityType, entityId, createdAt, updatedAt',
      syncMeta: 'key',
    });
    this.version(4).stores({
      rawMaterials: 'id, restaurantId, updatedAt, name, barcode',
      suppliers: 'id, restaurantId, updatedAt, name',
      finalProducts: 'id, restaurantId, updatedAt, name, productId',
      recipeItems: 'id, restaurantId, updatedAt, finalProductId, rawMaterialId',
      cashBankAccounts: 'id, restaurantId, updatedAt, accountType, name',
      operationalExpenses: 'id, restaurantId, updatedAt, expenseDate, expenseCategoryId',
      purchaseInvoices:
        'id, restaurantId, updatedAt, supplierId, status, purchaseDate, localSyncStatus, syncError, [restaurantId+localSyncStatus]',
      purchaseInvoiceItems: 'id, purchaseInvoiceId, rawMaterialId',
      syncOperations:
        '++id, localOpId, restaurantId, status, entityType, entityId, createdAt, updatedAt, [restaurantId+status]',
      syncMeta: 'key',
    });
    // v5: adds finalProductId index to purchaseInvoiceItems
    this.version(5).stores({
      rawMaterials: 'id, restaurantId, updatedAt, name, barcode',
      suppliers: 'id, restaurantId, updatedAt, name',
      finalProducts: 'id, restaurantId, updatedAt, name, productId',
      recipeItems: 'id, restaurantId, updatedAt, finalProductId, rawMaterialId',
      cashBankAccounts: 'id, restaurantId, updatedAt, accountType, name',
      operationalExpenses: 'id, restaurantId, updatedAt, expenseDate, expenseCategoryId',
      purchaseInvoices:
        'id, restaurantId, updatedAt, supplierId, status, purchaseDate, localSyncStatus, syncError, [restaurantId+localSyncStatus]',
      purchaseInvoiceItems: 'id, purchaseInvoiceId, rawMaterialId, finalProductId',
      syncOperations:
        '++id, localOpId, restaurantId, status, entityType, entityId, createdAt, updatedAt, [restaurantId+status]',
      syncMeta: 'key',
    });
    // v6: adds cheques, customerReceivables, purchaseReturns, purchaseReturnItems
    this.version(6).stores({
      rawMaterials: 'id, restaurantId, updatedAt, name, barcode',
      suppliers: 'id, restaurantId, updatedAt, name',
      finalProducts: 'id, restaurantId, updatedAt, name, productId',
      recipeItems: 'id, restaurantId, updatedAt, finalProductId, rawMaterialId',
      cashBankAccounts: 'id, restaurantId, updatedAt, accountType, name',
      operationalExpenses: 'id, restaurantId, updatedAt, expenseDate, expenseCategoryId',
      purchaseInvoices:
        'id, restaurantId, updatedAt, supplierId, status, purchaseDate, localSyncStatus, syncError, [restaurantId+localSyncStatus]',
      purchaseInvoiceItems: 'id, purchaseInvoiceId, rawMaterialId, finalProductId',
      cheques: 'id, restaurantId, updatedAt, chequeType, status, dueDate, [restaurantId+status]',
      customerReceivables:
        'id, restaurantId, updatedAt, status, dueDate, salesInvoiceId, [restaurantId+status]',
      purchaseReturns: 'id, restaurantId, updatedAt, purchaseInvoiceId, status',
      purchaseReturnItems: 'id, purchaseReturnId, rawMaterialId',
      syncOperations:
        '++id, localOpId, restaurantId, status, entityType, entityId, createdAt, updatedAt, [restaurantId+status]',
      syncMeta: 'key',
    });
    // v7: adds warehouses (read-only pull from server)
    this.version(7).stores({
      rawMaterials: 'id, restaurantId, updatedAt, name, barcode',
      suppliers: 'id, restaurantId, updatedAt, name',
      finalProducts: 'id, restaurantId, updatedAt, name, productId',
      recipeItems: 'id, restaurantId, updatedAt, finalProductId, rawMaterialId',
      cashBankAccounts: 'id, restaurantId, updatedAt, accountType, name',
      operationalExpenses: 'id, restaurantId, updatedAt, expenseDate, expenseCategoryId',
      purchaseInvoices:
        'id, restaurantId, updatedAt, supplierId, status, purchaseDate, localSyncStatus, syncError, [restaurantId+localSyncStatus]',
      purchaseInvoiceItems: 'id, purchaseInvoiceId, rawMaterialId, finalProductId',
      cheques: 'id, restaurantId, updatedAt, chequeType, status, dueDate, [restaurantId+status]',
      customerReceivables:
        'id, restaurantId, updatedAt, status, dueDate, salesInvoiceId, [restaurantId+status]',
      purchaseReturns: 'id, restaurantId, updatedAt, purchaseInvoiceId, status',
      purchaseReturnItems: 'id, purchaseReturnId, rawMaterialId',
      warehouses: 'id, restaurantId, updatedAt, isDefault, isActive',
      syncOperations:
        '++id, localOpId, restaurantId, status, entityType, entityId, createdAt, updatedAt, [restaurantId+status]',
      syncMeta: 'key',
    });
    // v8: adds warehouseTransfers (read-only pull from server)
    this.version(8).stores({
      rawMaterials: 'id, restaurantId, updatedAt, name, barcode',
      suppliers: 'id, restaurantId, updatedAt, name',
      finalProducts: 'id, restaurantId, updatedAt, name, productId',
      recipeItems: 'id, restaurantId, updatedAt, finalProductId, rawMaterialId',
      cashBankAccounts: 'id, restaurantId, updatedAt, accountType, name',
      operationalExpenses: 'id, restaurantId, updatedAt, expenseDate, expenseCategoryId',
      purchaseInvoices:
        'id, restaurantId, updatedAt, supplierId, status, purchaseDate, localSyncStatus, syncError, [restaurantId+localSyncStatus]',
      purchaseInvoiceItems: 'id, purchaseInvoiceId, rawMaterialId, finalProductId',
      cheques: 'id, restaurantId, updatedAt, chequeType, status, dueDate, [restaurantId+status]',
      customerReceivables:
        'id, restaurantId, updatedAt, status, dueDate, salesInvoiceId, [restaurantId+status]',
      purchaseReturns: 'id, restaurantId, updatedAt, purchaseInvoiceId, status',
      purchaseReturnItems: 'id, purchaseReturnId, rawMaterialId',
      warehouses: 'id, restaurantId, updatedAt, isDefault, isActive',
      warehouseTransfers: 'id, restaurantId, updatedAt, status, fromWarehouseId, toWarehouseId',
      syncOperations:
        '++id, localOpId, restaurantId, status, entityType, entityId, createdAt, updatedAt, [restaurantId+status]',
      syncMeta: 'key',
    });
    // v9: adds warehouseStocks (per-warehouse quantity, read-only pull from server)
    this.version(9).stores({
      rawMaterials: 'id, restaurantId, updatedAt, name, barcode',
      suppliers: 'id, restaurantId, updatedAt, name',
      finalProducts: 'id, restaurantId, updatedAt, name, productId',
      recipeItems: 'id, restaurantId, updatedAt, finalProductId, rawMaterialId',
      cashBankAccounts: 'id, restaurantId, updatedAt, accountType, name',
      operationalExpenses: 'id, restaurantId, updatedAt, expenseDate, expenseCategoryId',
      purchaseInvoices:
        'id, restaurantId, updatedAt, supplierId, status, purchaseDate, localSyncStatus, syncError, [restaurantId+localSyncStatus]',
      purchaseInvoiceItems: 'id, purchaseInvoiceId, rawMaterialId, finalProductId',
      cheques: 'id, restaurantId, updatedAt, chequeType, status, dueDate, [restaurantId+status]',
      customerReceivables:
        'id, restaurantId, updatedAt, status, dueDate, salesInvoiceId, [restaurantId+status]',
      purchaseReturns: 'id, restaurantId, updatedAt, purchaseInvoiceId, status',
      purchaseReturnItems: 'id, purchaseReturnId, rawMaterialId',
      warehouses: 'id, restaurantId, updatedAt, isDefault, isActive',
      warehouseTransfers: 'id, restaurantId, updatedAt, status, fromWarehouseId, toWarehouseId',
      warehouseStocks: 'id, warehouseId, restaurantId, rawMaterialId, finalProductId, updatedAt',
      syncOperations:
        '++id, localOpId, restaurantId, status, entityType, entityId, createdAt, updatedAt, [restaurantId+status]',
      syncMeta: 'key',
    });
    // v10: adds cashAccountTransactions for local payment/cash ledger
    this.version(10).stores({
      rawMaterials: 'id, restaurantId, updatedAt, name, barcode',
      suppliers: 'id, restaurantId, updatedAt, name',
      finalProducts: 'id, restaurantId, updatedAt, name, productId',
      recipeItems: 'id, restaurantId, updatedAt, finalProductId, rawMaterialId',
      cashBankAccounts: 'id, restaurantId, updatedAt, accountType, name',
      operationalExpenses: 'id, restaurantId, updatedAt, expenseDate, expenseCategoryId',
      purchaseInvoices:
        'id, restaurantId, updatedAt, supplierId, status, purchaseDate, localSyncStatus, syncError, [restaurantId+localSyncStatus]',
      purchaseInvoiceItems: 'id, purchaseInvoiceId, rawMaterialId, finalProductId',
      cheques: 'id, restaurantId, updatedAt, chequeType, status, dueDate, [restaurantId+status]',
      customerReceivables:
        'id, restaurantId, updatedAt, status, dueDate, salesInvoiceId, [restaurantId+status]',
      purchaseReturns: 'id, restaurantId, updatedAt, purchaseInvoiceId, status',
      purchaseReturnItems: 'id, purchaseReturnId, rawMaterialId',
      warehouses: 'id, restaurantId, updatedAt, isDefault, isActive',
      warehouseTransfers: 'id, restaurantId, updatedAt, status, fromWarehouseId, toWarehouseId',
      warehouseStocks: 'id, warehouseId, restaurantId, rawMaterialId, finalProductId, updatedAt',
      cashAccountTransactions:
        '++id, restaurantId, accountType, transactionType, date, orderId, [restaurantId+accountType], [restaurantId+date]',
      syncOperations:
        '++id, localOpId, restaurantId, status, entityType, entityId, createdAt, updatedAt, [restaurantId+status]',
      syncMeta: 'key',
    });
    // v11: adds localId + syncStatus to cashAccountTransactions for server sync
    this.version(11).stores({
      rawMaterials: 'id, restaurantId, updatedAt, name, barcode',
      suppliers: 'id, restaurantId, updatedAt, name',
      finalProducts: 'id, restaurantId, updatedAt, name, productId',
      recipeItems: 'id, restaurantId, updatedAt, finalProductId, rawMaterialId',
      cashBankAccounts: 'id, restaurantId, updatedAt, accountType, name',
      operationalExpenses: 'id, restaurantId, updatedAt, expenseDate, expenseCategoryId',
      purchaseInvoices:
        'id, restaurantId, updatedAt, supplierId, status, purchaseDate, localSyncStatus, syncError, [restaurantId+localSyncStatus]',
      purchaseInvoiceItems: 'id, purchaseInvoiceId, rawMaterialId, finalProductId',
      cheques: 'id, restaurantId, updatedAt, chequeType, status, dueDate, [restaurantId+status]',
      customerReceivables:
        'id, restaurantId, updatedAt, status, dueDate, salesInvoiceId, [restaurantId+status]',
      purchaseReturns: 'id, restaurantId, updatedAt, purchaseInvoiceId, status',
      purchaseReturnItems: 'id, purchaseReturnId, rawMaterialId',
      warehouses: 'id, restaurantId, updatedAt, isDefault, isActive',
      warehouseTransfers: 'id, restaurantId, updatedAt, status, fromWarehouseId, toWarehouseId',
      warehouseStocks: 'id, warehouseId, restaurantId, rawMaterialId, finalProductId, updatedAt',
      cashAccountTransactions:
        '++id, restaurantId, accountType, transactionType, date, orderId, localId, syncStatus, [restaurantId+accountType], [restaurantId+date], [restaurantId+syncStatus]',
      syncOperations:
        '++id, localOpId, restaurantId, status, entityType, entityId, createdAt, updatedAt, [restaurantId+status]',
      syncMeta: 'key',
    });
    // v12: adds expenseCategories table for offline support
    this.version(12).stores({
      rawMaterials: 'id, restaurantId, updatedAt, name, barcode',
      suppliers: 'id, restaurantId, updatedAt, name',
      finalProducts: 'id, restaurantId, updatedAt, name, productId',
      recipeItems: 'id, restaurantId, updatedAt, finalProductId, rawMaterialId',
      cashBankAccounts: 'id, restaurantId, updatedAt, accountType, name',
      operationalExpenses: 'id, restaurantId, updatedAt, expenseDate, expenseCategoryId',
      expenseCategories: 'id, restaurantId, updatedAt, isActive',
      purchaseInvoices:
        'id, restaurantId, updatedAt, supplierId, status, purchaseDate, localSyncStatus, syncError, [restaurantId+localSyncStatus]',
      purchaseInvoiceItems: 'id, purchaseInvoiceId, rawMaterialId, finalProductId',
      cheques: 'id, restaurantId, updatedAt, chequeType, status, dueDate, [restaurantId+status]',
      customerReceivables:
        'id, restaurantId, updatedAt, status, dueDate, salesInvoiceId, [restaurantId+status]',
      purchaseReturns: 'id, restaurantId, updatedAt, purchaseInvoiceId, status',
      purchaseReturnItems: 'id, purchaseReturnId, rawMaterialId',
      warehouses: 'id, restaurantId, updatedAt, isDefault, isActive',
      warehouseTransfers: 'id, restaurantId, updatedAt, status, fromWarehouseId, toWarehouseId',
      warehouseStocks: 'id, warehouseId, restaurantId, rawMaterialId, finalProductId, updatedAt',
      cashAccountTransactions:
        '++id, restaurantId, accountType, transactionType, date, orderId, localId, syncStatus, [restaurantId+accountType], [restaurantId+date], [restaurantId+syncStatus]',
      syncOperations:
        '++id, localOpId, restaurantId, status, entityType, entityId, createdAt, updatedAt, [restaurantId+status]',
      syncMeta: 'key',
    });
    // v13: adds rawMaterialCategories table for offline support
    this.version(13).stores({
      rawMaterials: 'id, restaurantId, updatedAt, name, barcode',
      suppliers: 'id, restaurantId, updatedAt, name',
      finalProducts: 'id, restaurantId, updatedAt, name, productId',
      recipeItems: 'id, restaurantId, updatedAt, finalProductId, rawMaterialId',
      cashBankAccounts: 'id, restaurantId, updatedAt, accountType, name',
      operationalExpenses: 'id, restaurantId, updatedAt, expenseDate, expenseCategoryId',
      expenseCategories: 'id, restaurantId, updatedAt, isActive',
      rawMaterialCategories: 'id, restaurantId, updatedAt, isActive',
      purchaseInvoices:
        'id, restaurantId, updatedAt, supplierId, status, purchaseDate, localSyncStatus, syncError, [restaurantId+localSyncStatus]',
      purchaseInvoiceItems: 'id, purchaseInvoiceId, rawMaterialId, finalProductId',
      cheques: 'id, restaurantId, updatedAt, chequeType, status, dueDate, [restaurantId+status]',
      customerReceivables:
        'id, restaurantId, updatedAt, status, dueDate, salesInvoiceId, [restaurantId+status]',
      purchaseReturns: 'id, restaurantId, updatedAt, purchaseInvoiceId, status, localSyncStatus',
      purchaseReturnItems: 'id, purchaseReturnId, rawMaterialId',
      warehouses: 'id, restaurantId, updatedAt, isDefault, isActive',
      warehouseTransfers: 'id, restaurantId, updatedAt, status, fromWarehouseId, toWarehouseId',
      warehouseStocks: 'id, warehouseId, restaurantId, rawMaterialId, finalProductId, updatedAt',
      cashAccountTransactions:
        '++id, restaurantId, accountType, transactionType, date, orderId, localId, syncStatus, [restaurantId+accountType], [restaurantId+date], [restaurantId+syncStatus]',
      syncOperations:
        '++id, localOpId, restaurantId, status, entityType, entityId, createdAt, updatedAt, [restaurantId+status]',
      syncMeta: 'key',
    });
  }
}

export const accountingDb = new MenusAccountingDb();

export async function enqueueAccountingOperation(
  input: Omit<LocalSyncOperation, 'id' | 'status' | 'retryCount' | 'createdAt' | 'updatedAt'>,
): Promise<number> {
  const now = new Date().toISOString();
  return accountingDb.syncOperations.add({
    ...input,
    status: 'pending',
    retryCount: 0,
    createdAt: now,
    updatedAt: now,
  });
}

export async function getPendingAccountingOperations(
  restaurantId: number,
  limit = 200,
): Promise<LocalSyncOperation[]> {
  try {
    return await accountingDb.syncOperations
      .where('[restaurantId+status]')
      .anyOf([
        [restaurantId, 'pending'],
        [restaurantId, 'failed'],
      ])
      .limit(limit)
      .toArray();
  } catch {
    // Fallback for legacy IndexedDB schemas missing compound index.
    const rows = await accountingDb.syncOperations.toArray();
    return rows
      .filter(
        (row) =>
          row.restaurantId === restaurantId &&
          (row.status === 'pending' || row.status === 'failed'),
      )
      .slice(0, limit);
  }
}

export async function updateOperationSyncStatus(
  id: number,
  status: LocalSyncOperationStatus,
  patch?: Partial<LocalSyncOperation>,
) {
  await accountingDb.syncOperations.update(id, {
    ...patch,
    status,
    updatedAt: new Date().toISOString(),
  });
}

/**
 * حذف عملیات صف‌شده برای یک موجودیت که مستقیماً (بدون واسطه صف) با سرور سینک شده است —
 * مثلاً وقتی حین آنلاین بودن، علاوه بر ثبت local، یک درخواست مستقیم به سرور هم زده شده.
 * بدون این پاکسازی، عملیات صف‌شده دوباره توسط سینک پس‌زمینه (AccountingSyncManager) ارسال
 * می‌شود و چون entityId آن یک id موقت محلی است، سرور یک رکورد تکراری واقعی می‌سازد
 * (برای دسته‌بندی‌ها) یا برای همیشه با خطای اعتبارسنجی شکست می‌خورد (برای هزینه‌های عملیاتی
 * که fiscalYearId در payload قدیمی موجود نیست).
 */
export async function cancelPendingSyncOp(
  entityType: SyncEntityType,
  entityId: string,
): Promise<void> {
  const ops = await accountingDb.syncOperations
    .where('entityType')
    .equals(entityType)
    .filter((op) => op.entityId === entityId && op.status !== 'synced')
    .toArray();
  if (ops.length) {
    await accountingDb.syncOperations.bulkDelete(ops.map((op) => op.id!).filter((id) => id !== undefined));
  }
}

/**
 * وقتی یک صفحه (مثل ثبت هزینه) علاوه بر صف‌کردن عملیات، بلافاصله هم یک درخواست
 * مستقیم به سرور می‌زند، باید عملیات صف‌شده را قبل از شروع آن درخواست از حالت
 * 'pending' خارج کند — وگرنه سینک پس‌زمینه (AccountingSyncManager، هر ۳۰ ثانیه یا
 * روی رویداد focus/online) ممکن است دقیقاً در همان بازه، همان عملیات را هم پوش کند
 * و روی سرور یک رکورد تکراری واقعی بسازد. این تابع عملیات‌های 'pending' مطابق را
 * موقتاً به 'syncing' می‌برد تا getPendingAccountingOperations آن‌ها را انتخاب نکند.
 */
export async function markPendingSyncOpsInFlight(
  entityType: SyncEntityType,
  entityId: string,
): Promise<void> {
  const ops = await accountingDb.syncOperations
    .where('entityType')
    .equals(entityType)
    .filter((op) => op.entityId === entityId && op.status === 'pending')
    .toArray();
  const now = new Date().toISOString();
  await Promise.all(
    ops.map((op) => accountingDb.syncOperations.update(op.id!, { status: 'syncing', updatedAt: now })),
  );
}

/** اگر درخواست مستقیم بالا شکست خورد، عملیات صف‌شده را برای تلاش مجدد توسط سینک پس‌زمینه برگردان. */
export async function restorePendingSyncOps(
  entityType: SyncEntityType,
  entityId: string,
): Promise<void> {
  const ops = await accountingDb.syncOperations
    .where('entityType')
    .equals(entityType)
    .filter((op) => op.entityId === entityId && op.status === 'syncing')
    .toArray();
  const now = new Date().toISOString();
  await Promise.all(
    ops.map((op) => accountingDb.syncOperations.update(op.id!, { status: 'pending', updatedAt: now })),
  );
}

/**
 * بعد از اینکه یک عملیات 'create' که فقط از طریق صف پس‌زمینه (بدون درخواست مستقیم)
 * سینک شده موفق شد، رکورد محلیِ با id موقت (temp، از nextLocalEntityId) را حذف کن.
 * سرور در پاسخ push، entityId موقت خودِ کلاینت را echo می‌کند نه id واقعی سرور —
 * پس هیچ راهی برای جایگزینی آن رکورد وجود ندارد. اگر حذفش نکنیم، pull بعدی همان
 * چرخه، نسخه‌ی سرور را با id واقعی اضافه می‌کند و رکورد موقت هم برای همیشه کنارش
 * باقی می‌ماند — دقیقاً همان باگِ «بعد از رفرش دوتا نشون می‌دهد».
 */
export async function deleteLocalTempEntity(
  entityType: SyncEntityType,
  entityId: string,
): Promise<void> {
  const tableName = mapCollectionName(entityType);
  const table = accountingDb.table<any, any>(tableName as string);
  const numericId = Number(entityId);
  if (!Number.isFinite(numericId)) return;
  await table.delete(numericId);
}

function mapCollectionName(entityType: SyncEntityType): keyof MenusAccountingDb {
  switch (entityType) {
    case 'raw_material':
      return 'rawMaterials';
    case 'supplier':
      return 'suppliers';
    case 'final_product':
      return 'finalProducts';
    case 'recipe_item':
      return 'recipeItems';
    case 'cash_bank_account':
      return 'cashBankAccounts';
    case 'operational_expense':
      return 'operationalExpenses';
    case 'expense_category':
      return 'expenseCategories';
    case 'raw_material_category':
      return 'rawMaterialCategories';
    case 'purchase_return':
      return 'purchaseReturns';
    default:
      return 'rawMaterials';
  }
}

export async function upsertPulledEntities(entityType: SyncEntityType, rows: any[]) {
  if (!rows?.length) return;
  const tableName = mapCollectionName(entityType);
  const table = accountingDb.table<any, any>(tableName as string);

  // موجودیت‌های این ماژول همه id از نوع Postgres bigint دارند (برای این‌که id های
  // client-generated مثل Date.now() هم جا بشوند) — TypeORM چنین id هایی را به صورت
  // رشته سریالایز می‌کند، در حالی‌که رکوردهای ساخته‌شده محلی (nextLocalEntityId) از
  // نوع number هستند. اگر رشته همین‌طور در Dexie ذخیره شود، primary key آن رکورد با
  // نسخه‌ی number‌ی که بقیه‌ی کد (مثلاً Number(row.id) در حذف) انتظار دارد یکی نیست و
  // IndexedDB هیچ رکوردی پیدا نمی‌کند — دقیقاً همان باگ «حذف می‌کنم ولی تا رفرش نکنم
  // از لیست نمی‌رود». همه‌ی id ها را همین‌جا، قبل از ورود به Dexie، number می‌کنیم.
  const normalizedRows = rows.map((r) => (r && r.id != null ? { ...r, id: Number(r.id) } : r));

  // اگر کاربر همین الان رکوردی را حذف کرده و عملیات 'delete' آن هنوز در صف/در حال
  // ارسال است (سرور هنوز واقعاً حذفش نکرده)، این pull ممکن است همان رکوردِ قدیمی
  // را برگردانده باشد — دوباره درجش نکن. وگرنه حذف خوش‌بینانه‌ی محلی توسط همین
  // pull پس‌زمینه لغو می‌شود و کاربر تا رفرش بعدی دوباره همان رکورد را می‌بیند.
  const pendingDeletes = await accountingDb.syncOperations
    .where('entityType').equals(entityType)
    .filter((op) => op.operationType === 'delete' && op.status !== 'synced')
    .toArray();
  const rowsToApply = pendingDeletes.length
    ? normalizedRows.filter((r) => !pendingDeletes.some((op) => op.entityId === String(r.id)))
    : normalizedRows;
  if (!rowsToApply.length) return;

  // داده‌های قدیمی (از قبل از فیکس بالا) ممکن است هنوز با id رشته‌ای در Dexie نشسته
  // باشند. اگر همان نسخه‌ی رشته‌ای هنوز هست، پاکش کن — وگرنه کنار نسخه‌ی number‌یِ
  // تازه به‌عنوان یک رکورد تکراریِ همیشگی باقی می‌ماند.
  const staleStringKeys = rowsToApply.map((r) => String(r.id));
  const staleExisting = await table.bulkGet(staleStringKeys);
  const staleKeysToDelete = staleStringKeys.filter((_, i) => staleExisting[i] != null);
  if (staleKeysToDelete.length) {
    await table.bulkDelete(staleKeysToDelete);
  }

  // برای final_product: اگر سرور productId نداشت (TypeORM relation بدون @Column مستقیم
  // این فیلد را در getMany() برنمی‌گرداند)، مقدار محلی موجود را حفظ کن.
  if (entityType === 'final_product') {
    const ids = rowsToApply.map((r) => r.id);
    const existingArr = await table.bulkGet(ids);
    const existingMap = new Map<any, any>();
    existingArr.forEach((e: any) => { if (e) existingMap.set(e.id, e); });
    const merged = rowsToApply.map((r) => {
      if (r.productId != null) return r;
      const local = existingMap.get(r.id);
      return local?.productId != null ? { ...r, productId: local.productId } : r;
    });
    await table.bulkPut(merged);
    return;
  }

  await table.bulkPut(rowsToApply);
}

/**
 * Merge server-pulled purchase invoices into the local Dexie table.
 * Avoids duplicates: if a local draft was already synced (serverInvoiceId == server.id),
 * update its status instead of inserting a second record.
 */
export async function upsertPulledInvoices(restaurantId: number, serverInvoices: any[]) {
  if (!serverInvoices?.length) return;

  // Build a map: serverInvoiceId → local Dexie record id
  const localRows = await accountingDb.purchaseInvoices
    .where('restaurantId').equals(restaurantId).toArray();
  const serverIdToLocalId = new Map<number, number>();
  for (const row of localRows) {
    if (row.serverInvoiceId != null) serverIdToLocalId.set(Number(row.serverInvoiceId), row.id);
  }

  const toInsert: any[] = [];
  for (const inv of serverInvoices) {
    const localId = serverIdToLocalId.get(Number(inv.id));
    if (localId != null) {
      // Already tracked as a local draft — just refresh mutable fields.
      await accountingDb.purchaseInvoices.update(localId, {
        status: inv.status,
        totalAmount: inv.totalAmount,
        supplierName: inv.supplierName,
        localSyncStatus: 'synced',
        updatedAt: typeof inv.updatedAt === 'string' ? inv.updatedAt : new Date(inv.updatedAt).toISOString(),
      });
    } else {
      toInsert.push({
        ...inv,
        localSyncStatus: 'synced',
        syncError: null,
        serverInvoiceId: Number(inv.id),
        updatedAt: typeof inv.updatedAt === 'string' ? inv.updatedAt : new Date(inv.updatedAt).toISOString(),
        createdAt: typeof inv.createdAt === 'string' ? inv.createdAt : new Date(inv.createdAt).toISOString(),
      });
    }
  }
  if (toInsert.length) await accountingDb.purchaseInvoices.bulkPut(toInsert);
}

export async function upsertPulledInvoiceItems(items: any[]) {
  if (!items?.length) return;
  await accountingDb.purchaseInvoiceItems.bulkPut(items);
}

export async function upsertPulledCheques(cheques: any[]) {
  if (!cheques?.length) return;
  await accountingDb.cheques.bulkPut(cheques);
}

export async function upsertPulledReceivables(receivables: any[]) {
  if (!receivables?.length) return;
  await accountingDb.customerReceivables.bulkPut(receivables);
}

export async function upsertPulledPurchaseReturns(returns: any[]) {
  if (!returns?.length) return;
  await accountingDb.purchaseReturns.bulkPut(returns);
}

export async function upsertPulledWarehouses(warehouses: any[]) {
  if (!warehouses?.length) return;
  await accountingDb.warehouses.bulkPut(warehouses);
}

export async function upsertPulledWarehouseTransfers(transfers: any[]) {
  if (!transfers?.length) return;
  await (accountingDb as any).warehouseTransfers.bulkPut(transfers);
}

export async function upsertPulledWarehouseStocks(stocks: any[]) {
  if (!stocks?.length) return;
  await accountingDb.warehouseStocks.bulkPut(stocks);
}

export async function getWarehouseStocksLocal(restaurantId: number, warehouseId?: number): Promise<any[]> {
  const query = warehouseId != null
    ? accountingDb.warehouseStocks.where('warehouseId').equals(warehouseId)
    : accountingDb.warehouseStocks.where('restaurantId').equals(restaurantId);
  return query.toArray();
}

export async function getDefaultWarehouseLocal(restaurantId: number): Promise<any | undefined> {
  return accountingDb.warehouses
    .where('restaurantId')
    .equals(restaurantId)
    .filter((w) => w.isDefault === true)
    .first();
}

export async function listWarehousesLocal(restaurantId: number): Promise<any[]> {
  return accountingDb.warehouses.where('restaurantId').equals(restaurantId).toArray();
}

export async function upsertPulledPurchaseReturnItems(items: any[]) {
  if (!items?.length) return;
  await accountingDb.purchaseReturnItems.bulkPut(items);
}

/**
 * Full-sync reconciliation: removes entities from local Dexie that the server no longer has.
 * Only deletes records that have no pending/failed local sync op (i.e. they're not awaiting push).
 */
export async function reconcileDeletedEntities(
  restaurantId: number,
  entityType: SyncEntityType,
  serverIds: Set<number>,
): Promise<number> {
  const tableName = mapCollectionName(entityType);
  const table = accountingDb.table<any, any>(tableName as string);

  const all = await accountingDb.syncOperations.toArray();
  const pendingEntityIds = new Set(
    all
      .filter(
        (op) =>
          op.restaurantId === restaurantId &&
          op.entityType === entityType &&
          (op.status === 'pending' || op.status === 'failed' || op.status === 'syncing'),
      )
      .map((op) => Number(op.entityId)),
  );

  const localRows = await table.where('restaurantId').equals(restaurantId).toArray();
  const idsToDelete = localRows
    .filter((r) => !serverIds.has(Number(r.id)) && !pendingEntityIds.has(Number(r.id)))
    .map((r) => r.id);

  if (idsToDelete.length) {
    await table.bulkDelete(idsToDelete);
  }
  return idsToDelete.length;
}

export async function getSyncMeta(key: string): Promise<string | null> {
  const row = await accountingDb.syncMeta.get(key);
  return row?.value ?? null;
}

export async function resetAccountingPullTimestamp(restaurantId: number): Promise<void> {
  await accountingDb.syncMeta.delete(`accounting:lastPullAt:${restaurantId}`);
}

/**
 * Resets ALL entity sync operations (any status) back to 'pending' so they are
 * re-pushed on the next sync.  Safe because rawUpsertSyncEntity uses ON CONFLICT
 * DO UPDATE — re-sending an already-synced entity is idempotent.
 *
 * Use this when the server may have stored wrong sequence-generated ids instead of
 * the client-generated bigint ids (the pre-fix TypeORM upsert bug).
 */
export async function resetEntitySyncOperationsToPending(restaurantId: number): Promise<number> {
  const entityTypes: SyncEntityType[] = [
    'supplier', 'raw_material', 'final_product', 'recipe_item', 'cash_bank_account',
    'operational_expense', 'expense_category', 'raw_material_category',
  ];
  const all = await accountingDb.syncOperations
    .where('restaurantId')
    .equals(restaurantId)
    .toArray();
  // Reset failed, syncing, and already-synced entity ops — server is idempotent (ON CONFLICT DO UPDATE).
  const toReset = all.filter((op) => entityTypes.includes(op.entityType as SyncEntityType));
  await repairOrphanedFinalProductPayloads(toReset);
  const now = new Date().toISOString();
  await Promise.all(
    toReset.map((op) =>
      accountingDb.syncOperations.update(op.id!, {
        status: 'pending',
        retryCount: 0,
        errorMessage: undefined,
        updatedAt: now,
      }),
    ),
  );
  return toReset.length;
}

export async function getFailedAccountingSyncOps(restaurantId: number): Promise<LocalSyncOperation[]> {
  try {
    return await accountingDb.syncOperations
      .where('[restaurantId+status]')
      .equals([restaurantId, 'failed'])
      .toArray();
  } catch {
    const rows = await accountingDb.syncOperations.toArray();
    return rows.filter((row) => row.restaurantId === restaurantId && row.status === 'failed');
  }
}

/**
 * عملیات «ایجاد محصول نهایی» قدیمی که قبل از resolveFinalProductTempProductId
 * ساخته شده‌اند، ممکن است هنوز payload.productId منفی (temp ID) داشته باشند —
 * حتی اگر محصول واقعی مدت‌ها پیش با موفقیت sync شده باشد. چون آن لحظه‌ی resolve
 * گذشته، رابطهٔ temp-id → real-id دیگر در Dexie وجود ندارد، پس با تطبیق نام
 * محصول (در میان محصولات کاتالوگ که واقعاً sync شده‌اند) تلاش می‌کنیم اصلاح کنیم.
 * فقط وقتی دقیقاً یک محصول هم‌نام پیدا شود لینک را اصلاح می‌کنیم؛ در غیر این
 * صورت (صفر یا چند مورد مشابه) برای جلوگیری از لینک‌شدن اشتباه، فقط لینک را
 * پاک می‌کنیم تا رکورد حداقل بدون خطای «out of range» سینک شود.
 */
async function repairOrphanedFinalProductPayloads(
  ops: LocalSyncOperation[],
): Promise<void> {
  const orphaned = ops.filter(
    (op) => op.entityType === 'final_product' && Number(op.payload?.productId) < 0,
  );
  if (!orphaned.length) return;

  const restaurantIds = Array.from(new Set(orphaned.map((op) => op.restaurantId)));
  const syncedProductsByRestaurant = new Map<number, any[]>();
  await Promise.all(
    restaurantIds.map(async (rid) => {
      const products = await catalogDb.products
        .where('restaurantId')
        .equals(rid)
        .filter((p) => Number(p.id) > 0)
        .toArray();
      syncedProductsByRestaurant.set(rid, products);
    }),
  );

  const now = new Date().toISOString();
  await Promise.all(
    orphaned.map(async (op) => {
      const name = String(op.payload?.name || '').trim();
      const candidates = (syncedProductsByRestaurant.get(op.restaurantId) || []).filter(
        (p) => (p.name_fa || p.name || '').trim() === name,
      );
      const fixedProductId = name && candidates.length === 1 ? Number(candidates[0].id) : null;

      await accountingDb.syncOperations.update(op.id!, {
        payload: { ...op.payload, productId: fixedProductId },
      });
      const fpId = Number(op.entityId);
      if (fpId) {
        await accountingDb.finalProducts.update(fpId, { productId: fixedProductId, updatedAt: now });
      }
    }),
  );
}

export async function retryFailedAccountingOps(restaurantId: number): Promise<number> {
  const failed = await getFailedAccountingSyncOps(restaurantId);
  await repairOrphanedFinalProductPayloads(failed);
  const now = new Date().toISOString();
  await Promise.all(
    failed.map((op) =>
      accountingDb.syncOperations.update(op.id!, {
        status: 'pending',
        retryCount: 0,
        errorMessage: undefined,
        updatedAt: now,
      }),
    ),
  );
  return failed.length;
}

/**
 * Permanently removes a single failed sync operation from the local queue.
 *
 * Useful for operations that will never succeed (e.g. a delete blocked by an FK the
 * server protects, or a create whose payload is inherently invalid). The row is removed
 * from IndexedDB only — it is never re-sent to the server.
 */
export async function discardAccountingSyncOp(opId: number): Promise<void> {
  await accountingDb.syncOperations.delete(opId);
}

/**
 * Permanently removes every failed sync operation for a restaurant from the local queue.
 * Returns the number of operations discarded. Mirrors retryFailedAccountingOps but
 * deletes instead of resetting to 'pending'.
 */
export async function discardFailedAccountingSyncOps(
  restaurantId: number,
): Promise<number> {
  const failed = await getFailedAccountingSyncOps(restaurantId);
  const ids = failed.map((op) => op.id!).filter((id) => id !== undefined);
  if (ids.length > 0) {
    await accountingDb.syncOperations.bulkDelete(ids);
  }
  return failed.length;
}

export async function setSyncMeta(key: string, value: string): Promise<void> {
  await accountingDb.syncMeta.put({ key, value });
}

function nextLocalEntityId(): number {
  return Date.now() + Math.floor(Math.random() * 10000);
}

function nextOpId() {
  return `op-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export async function createRawMaterialLocal(input: {
  restaurantId: number;
  name: string;
  unit: string;
  barcode?: string;
  minStock?: number;
  currentStock?: number;
  rawMaterialCategoryId?: number | null;
}) {
  const id = nextLocalEntityId();
  const now = new Date().toISOString();
  const row = {
    id,
    restaurantId: input.restaurantId,
    name: input.name.trim(),
    unit: input.unit,
    barcode: input.barcode?.trim() || null,
    minStock: Number(input.minStock || 0),
    currentStock: Number(input.currentStock || 0),
    rawMaterialCategoryId: input.rawMaterialCategoryId ?? null,
    isActive: true,
    createdAt: now,
    updatedAt: now,
  };
  await accountingDb.rawMaterials.put(row);
  await enqueueAccountingOperation({
    localOpId: nextOpId(),
    restaurantId: input.restaurantId,
    entityType: 'raw_material',
    entityId: String(id),
    operationType: 'create',
    payload: row,
    version: 1,
    clientUpdatedAt: now,
  });
  return row;
}

export async function createSupplierLocal(input: {
  restaurantId: number;
  name: string;
  phone?: string;
  address?: string;
  notes?: string;
}) {
  const id = nextLocalEntityId();
  const now = new Date().toISOString();
  const row = {
    id,
    restaurantId: input.restaurantId,
    name: input.name.trim(),
    phone: input.phone?.trim() || null,
    address: input.address?.trim() || null,
    notes: input.notes?.trim() || null,
    createdAt: now,
    updatedAt: now,
  };
  await accountingDb.suppliers.put(row);
  await enqueueAccountingOperation({
    localOpId: nextOpId(),
    restaurantId: input.restaurantId,
    entityType: 'supplier',
    entityId: String(id),
    operationType: 'create',
    payload: row,
    version: 1,
    clientUpdatedAt: now,
  });
  return row;
}

export async function updateRawMaterialLocal(input: {
  id: number;
  restaurantId: number;
  patch: Partial<{
    name: string;
    unit: string;
    barcode: string | null;
    minStock: number;
    currentStock: number;
    isActive: boolean;
    rawMaterialCategoryId: number | null;
  }>;
}) {
  const existing = await accountingDb.rawMaterials.get(input.id);
  if (!existing) return null;
  const now = new Date().toISOString();
  const next = {
    ...existing,
    ...input.patch,
    updatedAt: now,
  };
  await accountingDb.rawMaterials.put(next);
  await enqueueAccountingOperation({
    localOpId: nextOpId(),
    restaurantId: input.restaurantId,
    entityType: 'raw_material',
    entityId: String(input.id),
    operationType: 'update',
    payload: next,
    version: Number(existing.version || 1) + 1,
    clientUpdatedAt: now,
  });
  return next;
}

export async function deleteRawMaterialLocal(input: { id: number; restaurantId: number }) {
  const existing = await accountingDb.rawMaterials.get(input.id);
  if (!existing) return false;
  await accountingDb.rawMaterials.delete(input.id);
  await enqueueAccountingOperation({
    localOpId: nextOpId(),
    restaurantId: input.restaurantId,
    entityType: 'raw_material',
    entityId: String(input.id),
    operationType: 'delete',
    payload: { id: input.id },
    version: Number(existing.version || 1) + 1,
    clientUpdatedAt: new Date().toISOString(),
  });
  return true;
}

export async function updateSupplierLocal(input: {
  id: number;
  restaurantId: number;
  patch: Partial<{ name: string; phone: string | null; address: string | null; notes: string | null }>;
}) {
  const existing = await accountingDb.suppliers.get(input.id);
  if (!existing) return null;
  const now = new Date().toISOString();
  const next = {
    ...existing,
    ...input.patch,
    updatedAt: now,
  };
  await accountingDb.suppliers.put(next);
  await enqueueAccountingOperation({
    localOpId: nextOpId(),
    restaurantId: input.restaurantId,
    entityType: 'supplier',
    entityId: String(input.id),
    operationType: 'update',
    payload: next,
    version: Number(existing.version || 1) + 1,
    clientUpdatedAt: now,
  });
  return next;
}

export async function deleteSupplierLocal(input: { id: number; restaurantId: number }) {
  const existing = await accountingDb.suppliers.get(input.id);
  if (!existing) return false;
  await accountingDb.suppliers.delete(input.id);
  await enqueueAccountingOperation({
    localOpId: nextOpId(),
    restaurantId: input.restaurantId,
    entityType: 'supplier',
    entityId: String(input.id),
    operationType: 'delete',
    payload: { id: input.id },
    version: Number(existing.version || 1) + 1,
    clientUpdatedAt: new Date().toISOString(),
  });
  return true;
}

export async function resetFailedPurchaseDraftsToPending(restaurantId: number) {
  const failed = await accountingDb.purchaseInvoices
    .where('[restaurantId+localSyncStatus]')
    .equals([restaurantId, 'failed'])
    .toArray();
  const now = new Date().toISOString();
  await Promise.all(
    failed.map((row) =>
      accountingDb.purchaseInvoices.update(row.id, {
        localSyncStatus: 'pending',
        syncError: null,
        updatedAt: now,
      }),
    ),
  );
  return failed.length;
}

// ─── دسته‌بندی مواد اولیه (آفلاین) ──────────────────────────────────────────

export async function listRawMaterialCategoriesLocal(restaurantId: number): Promise<any[]> {
  return accountingDb.rawMaterialCategories.where('restaurantId').equals(restaurantId).toArray();
}

export async function upsertPulledRawMaterialCategories(categories: any[]): Promise<void> {
  if (!categories?.length) return;
  await accountingDb.rawMaterialCategories.bulkPut(categories);
}

export async function createRawMaterialCategoryLocal(input: { restaurantId: number; name: string }) {
  const id = nextLocalEntityId();
  const now = new Date().toISOString();
  const row = { id, restaurantId: input.restaurantId, name: input.name.trim(), isActive: true, createdAt: now, updatedAt: now };
  await accountingDb.rawMaterialCategories.put(row);
  await enqueueAccountingOperation({
    localOpId: nextOpId(), restaurantId: input.restaurantId, entityType: 'raw_material_category',
    entityId: String(id), operationType: 'create', payload: row, version: 1, clientUpdatedAt: now,
  });
  return row;
}

export async function updateRawMaterialCategoryLocal(input: { id: number; restaurantId: number; patch: Partial<{ name: string; isActive: boolean }> }) {
  const existing = await accountingDb.rawMaterialCategories.get(input.id);
  if (!existing) return null;
  const now = new Date().toISOString();
  const next = { ...existing, ...input.patch, updatedAt: now };
  await accountingDb.rawMaterialCategories.put(next);
  await enqueueAccountingOperation({
    localOpId: nextOpId(), restaurantId: input.restaurantId, entityType: 'raw_material_category',
    entityId: String(input.id), operationType: 'update', payload: next,
    version: Number(existing.version || 1) + 1, clientUpdatedAt: now,
  });
  return next;
}

export async function deleteRawMaterialCategoryLocal(input: { id: number; restaurantId: number }) {
  const existing = await accountingDb.rawMaterialCategories.get(input.id);
  if (!existing) return false;
  await accountingDb.rawMaterialCategories.delete(input.id);
  await enqueueAccountingOperation({
    localOpId: nextOpId(), restaurantId: input.restaurantId, entityType: 'raw_material_category',
    entityId: String(input.id), operationType: 'delete', payload: { id: input.id },
    version: Number(existing.version || 1) + 1, clientUpdatedAt: new Date().toISOString(),
  });
  return true;
}

// ─── مرجوعی خرید (آفلاین) ───────────────────────────────────────────────────

export async function createPurchaseReturnLocal(input: {
  restaurantId: number;
  purchaseInvoiceId: number;
  returnDate: string;
  notes?: string;
  items: Array<{ rawMaterialId?: number; finalProductId?: number; quantity: number; unitPrice: number }>;
}) {
  const id = nextLocalEntityId();
  const now = new Date().toISOString();
  const returnRow = {
    id,
    restaurantId: input.restaurantId,
    purchaseInvoiceId: input.purchaseInvoiceId,
    returnDate: input.returnDate,
    notes: input.notes || null,
    status: 'draft',
    localSyncStatus: 'pending',
    createdAt: now,
    updatedAt: now,
  };
  const items = input.items.map((x) => ({
    id: nextLocalEntityId(),
    purchaseReturnId: id,
    rawMaterialId: x.rawMaterialId ?? null,
    finalProductId: x.finalProductId ?? null,
    quantity: Number(x.quantity),
    unitPrice: Number(x.unitPrice),
  }));
  await accountingDb.purchaseReturns.put(returnRow);
  await accountingDb.purchaseReturnItems.bulkPut(items);
  await enqueueAccountingOperation({
    localOpId: nextOpId(), restaurantId: input.restaurantId, entityType: 'purchase_return',
    entityId: String(id), operationType: 'create',
    payload: { ...returnRow, items },
    version: 1, clientUpdatedAt: now,
  });
  return { returnRow, items };
}

export async function getPendingPurchaseReturnDrafts(restaurantId: number): Promise<any[]> {
  return accountingDb.purchaseReturns
    .where('restaurantId').equals(restaurantId)
    .filter((r) => r.localSyncStatus === 'pending' || r.localSyncStatus === 'failed')
    .toArray();
}

export async function markPurchaseReturnSyncState(
  id: number,
  localSyncStatus: 'pending' | 'syncing' | 'synced' | 'failed',
  patch?: { syncError?: string | null; serverReturnId?: number },
) {
  await accountingDb.purchaseReturns.update(id, { localSyncStatus, ...patch, updatedAt: new Date().toISOString() });
}

// ─── دسته‌بندی هزینه (آفلاین) ────────────────────────────────────────────────

export async function listExpenseCategoriesLocal(restaurantId: number): Promise<any[]> {
  return accountingDb.expenseCategories.where('restaurantId').equals(restaurantId).toArray();
}

export async function upsertPulledExpenseCategories(categories: any[]): Promise<void> {
  if (!categories?.length) return;
  await accountingDb.expenseCategories.bulkPut(categories);
}

export async function createExpenseCategoryLocal(input: {
  restaurantId: number;
  name: string;
  parentCategoryId?: number | null;
}) {
  const id = nextLocalEntityId();
  const now = new Date().toISOString();
  const row = {
    id,
    restaurantId: input.restaurantId,
    name: input.name.trim(),
    isActive: true,
    parentCategoryId: input.parentCategoryId ?? null,
    createdAt: now,
    updatedAt: now,
  };
  await accountingDb.expenseCategories.put(row);
  await enqueueAccountingOperation({
    localOpId: nextOpId(),
    restaurantId: input.restaurantId,
    entityType: 'expense_category',
    entityId: String(id),
    operationType: 'create',
    payload: row,
    version: 1,
    clientUpdatedAt: now,
  });
  return row;
}

export async function updateExpenseCategoryLocal(input: {
  id: number;
  restaurantId: number;
  patch: Partial<{ name: string; isActive: boolean; parentCategoryId: number | null }>;
}) {
  const existing = await accountingDb.expenseCategories.get(input.id);
  if (!existing) return null;
  const now = new Date().toISOString();
  const next = { ...existing, ...input.patch, updatedAt: now };
  await accountingDb.expenseCategories.put(next);
  await enqueueAccountingOperation({
    localOpId: nextOpId(),
    restaurantId: input.restaurantId,
    entityType: 'expense_category',
    entityId: String(input.id),
    operationType: 'update',
    payload: next,
    version: Number(existing.version || 1) + 1,
    clientUpdatedAt: now,
  });
  return next;
}

export async function deleteExpenseCategoryLocal(input: { id: number; restaurantId: number }) {
  const existing = await accountingDb.expenseCategories.get(input.id);
  if (!existing) return false;
  await accountingDb.expenseCategories.delete(input.id);
  await enqueueAccountingOperation({
    localOpId: nextOpId(),
    restaurantId: input.restaurantId,
    entityType: 'expense_category',
    entityId: String(input.id),
    operationType: 'delete',
    payload: { id: input.id },
    version: Number(existing.version || 1) + 1,
    clientUpdatedAt: new Date().toISOString(),
  });
  return true;
}

export async function createOperationalExpenseLocal(input: {
  restaurantId: number;
  expenseCategoryId: number;
  fiscalYearId?: number | null;
  expenseDate: string; // YYYY-MM-DD
  amount: number;
  description?: string;
}) {
  const id = nextLocalEntityId();
  const now = new Date().toISOString();
  const row = {
    id,
    restaurantId: input.restaurantId,
    expenseCategoryId: input.expenseCategoryId,
    fiscalYearId: input.fiscalYearId ?? null,
    expenseDate: input.expenseDate,
    amount: Number(input.amount),
    description: input.description?.trim() || null,
    createdAt: now,
    updatedAt: now,
  };
  await accountingDb.operationalExpenses.put(row);
  await enqueueAccountingOperation({
    localOpId: nextOpId(),
    restaurantId: input.restaurantId,
    entityType: 'operational_expense',
    entityId: String(id),
    operationType: 'create',
    payload: row,
    version: 1,
    clientUpdatedAt: now,
  });
  return row;
}

/**
 * حذف بهینه‌بینانه‌ی محلی + صف‌کردن حذف برای سینک پس‌زمینه — بدون این صف، یک حذفِ
 * آفلاین یا یک درخواست مستقیمِ ناموفق برای همیشه گم می‌شد و pull بعدی همان هزینه
 * را دوباره از سرور برمی‌گرداند (رفع باگ «حذف می‌کنم ولی تا رفرش نکنم از لیست نمی‌رود»).
 */
export async function deleteOperationalExpenseLocal(input: {
  // ممکن است رکورد قبل از فیکس bigint-as-string با id رشته‌ای در Dexie ذخیره شده
  // باشد (سرور id ستون bigint را به صورت رشته برمی‌گرداند) — هر دو نوع را می‌پذیریم.
  id: number | string;
  restaurantId: number;
}): Promise<void> {
  const numericId = Number(input.id);
  const entityId = String(numericId);

  // primary key واقعیِ رکورد ممکن است number (نرمالایز‌شده) یا رشته (داده‌ی قدیمی)
  // باشد — چون IndexedDB بین کلید عددی و رشته‌ای فرق می‌گذارد، هر دو را حذف کن؛
  // حذفِ کلیدی که وجود ندارد بی‌خطر است (no-op). جدول تایپش number است ولی
  // IndexedDB واقعاً هر مقداری را به‌عنوان کلید می‌پذیرد، پس cast به any لازم است.
  await accountingDb.operationalExpenses.delete(input.id as any);
  await accountingDb.operationalExpenses.delete(numericId);
  await accountingDb.operationalExpenses.delete(entityId as any);

  // اگر رکورد هنوز یک عملیات 'create' سینک‌نشده دارد (id موقت — هیچ‌وقت روی سرور
  // وجود نداشته)، همان را لغو کن؛ نیازی به فرستادن یک 'delete' جداگانه نیست.
  const pendingCreate = await accountingDb.syncOperations
    .where('entityType')
    .equals('operational_expense')
    .filter(
      (op) => op.entityId === entityId && op.operationType === 'create' && op.status !== 'synced',
    )
    .toArray();
  if (pendingCreate.length) {
    await accountingDb.syncOperations.bulkDelete(
      pendingCreate.map((op) => op.id!).filter((id) => id !== undefined),
    );
    return;
  }

  await enqueueAccountingOperation({
    localOpId: nextOpId(),
    restaurantId: input.restaurantId,
    entityType: 'operational_expense',
    entityId,
    operationType: 'delete',
    payload: { id: numericId },
    version: 1,
    clientUpdatedAt: new Date().toISOString(),
  });
}

export async function createPurchaseInvoiceLocal(input: {
  restaurantId: number;
  supplierId: number;
  invoiceNumber: string;
  purchaseDate: string;
  items: Array<{ rawMaterialId?: number; finalProductId?: number; quantity: number; unitPrice: number; salePrice?: number; warehouseId?: number }>;
  extraCosts?: number;
}) {
  const id = nextLocalEntityId();
  const now = new Date().toISOString();
  const items = input.items.map((x) => ({
    id: nextLocalEntityId(),
    purchaseInvoiceId: id,
    rawMaterialId: x.rawMaterialId ?? null,
    finalProductId: x.finalProductId ?? null,
    quantity: Number(x.quantity),
    unitPrice: Number(x.unitPrice),
    salePrice: x.salePrice != null ? Number(x.salePrice) : null,
    warehouseId: x.warehouseId ?? null,
    lineTotal: Number((Number(x.quantity) * Number(x.unitPrice)).toFixed(2)),
  }));
  const totalAmount = Number(
    (
      items.reduce((acc, x) => acc + Number(x.lineTotal), 0) + Number(input.extraCosts || 0)
    ).toFixed(2),
  );
  const invoiceRow = {
    id,
    restaurantId: input.restaurantId,
    supplierId: input.supplierId,
    invoiceNumber: input.invoiceNumber.trim(),
    purchaseDate: input.purchaseDate,
    status: 'pending_approval',
    localSyncStatus: 'pending',
    syncError: null as string | null,
    serverInvoiceId: null as number | null,
    extraCosts: Number(input.extraCosts || 0),
    totalAmount,
    createdAt: now,
    updatedAt: now,
  };
  await accountingDb.purchaseInvoices.put(invoiceRow);
  await accountingDb.purchaseInvoiceItems.bulkPut(items);
  return { invoice: invoiceRow, items };
}

export async function getPendingPurchaseInvoiceDrafts(restaurantId: number, limit = 50) {
  return accountingDb.purchaseInvoices
    .where('[restaurantId+localSyncStatus]')
    .anyOf([
      [restaurantId, 'pending'],
      [restaurantId, 'failed'],
    ])
    .limit(limit)
    .toArray();
}

export async function getPurchaseInvoiceItemsByInvoiceId(purchaseInvoiceId: number) {
  return accountingDb.purchaseInvoiceItems.where('purchaseInvoiceId').equals(purchaseInvoiceId).toArray();
}

export async function markPurchaseInvoiceSyncState(
  purchaseInvoiceId: number,
  patch: {
    localSyncStatus: 'pending' | 'syncing' | 'synced' | 'failed';
    syncError?: string | null;
    serverInvoiceId?: number | null;
  },
) {
  await accountingDb.purchaseInvoices.update(purchaseInvoiceId, {
    ...patch,
    updatedAt: new Date().toISOString(),
  });
}

export async function updatePurchaseInvoiceDraftLocal(input: {
  invoiceId: number;
  restaurantId: number;
  supplierId: number;
  invoiceNumber: string;
  purchaseDate: string;
  items: Array<{ rawMaterialId?: number; finalProductId?: number; quantity: number; unitPrice: number; salePrice?: number; warehouseId?: number }>;
  extraCosts?: number;
}) {
  const existing = await accountingDb.purchaseInvoices.get(input.invoiceId);
  if (!existing) return null;
  const now = new Date().toISOString();
  const lineItems = input.items.map((x) => ({
    id: nextLocalEntityId(),
    purchaseInvoiceId: input.invoiceId,
    rawMaterialId: x.rawMaterialId ?? null,
    finalProductId: x.finalProductId ?? null,
    quantity: Number(x.quantity),
    unitPrice: Number(x.unitPrice),
    salePrice: x.salePrice != null ? Number(x.salePrice) : null,
    warehouseId: x.warehouseId ?? null,
    lineTotal: Number((Number(x.quantity) * Number(x.unitPrice)).toFixed(2)),
  }));
  const totalAmount = Number(
    (
      lineItems.reduce((acc, x) => acc + Number(x.lineTotal), 0) + Number(input.extraCosts || 0)
    ).toFixed(2),
  );
  await accountingDb.purchaseInvoiceItems
    .where('purchaseInvoiceId')
    .equals(input.invoiceId)
    .delete();
  await accountingDb.purchaseInvoiceItems.bulkPut(lineItems);

  const nextInvoice = {
    ...existing,
    supplierId: input.supplierId,
    invoiceNumber: input.invoiceNumber.trim(),
    purchaseDate: input.purchaseDate,
    extraCosts: Number(input.extraCosts || 0),
    totalAmount,
    localSyncStatus: 'pending',
    syncError: null as string | null,
    updatedAt: now,
  };
  await accountingDb.purchaseInvoices.put(nextInvoice);
  return { invoice: nextInvoice, items: lineItems };
}

export async function createFinalProductLocal(input: {
  restaurantId: number;
  name: string;
  productId?: number;
}) {
  const id = nextLocalEntityId();
  const now = new Date().toISOString();
  const row = {
    id,
    restaurantId: input.restaurantId,
    name: input.name.trim(),
    productId: input.productId ?? null,
    barcode: null,
    salePrice: 0,
    isActive: true,
    currentStock: 0,
    createdAt: now,
    updatedAt: now,
  };
  await accountingDb.finalProducts.put(row);
  await enqueueAccountingOperation({
    localOpId: nextOpId(),
    restaurantId: input.restaurantId,
    entityType: 'final_product',
    entityId: String(id),
    operationType: 'create',
    payload: row,
    version: 1,
    clientUpdatedAt: now,
  });
  return row;
}

/**
 * وقتی یک محصول منوی ساخته‌شده آفلاین واقعاً sync می‌شود، temp ID منفی‌اش
 * (مثلاً ‎-1781108301585‎) با یک ID واقعی سرور جایگزین می‌شود (catalogLocalDb →
 * resolveProductTempId). اما اگر قبل از آن sync، یک «محصول نهایی» حسابداری
 * (FinalProduct) با ‎productId = همان temp ID منفی‎ ساخته و در صف ارسال
 * گذاشته شده باشد (مثلاً از فاکتور خرید)، آن رکورد محلی و payload عملیات
 * سینکش برای همیشه به temp ID اشاره می‌کند — چون چیزی این مقدار را اصلاح
 * نمی‌کند. سرور چنین مقداری را اصلاً نمی‌شناسد (هرگز در جدول product وجود
 * نداشته) و چون ستون product_id از نوع integer است، حتی قبل از رسیدن به
 * خطای FK، با خطای «out of range for type integer» رد می‌شود — و «تلاش
 * مجدد» تا ابد همین خطا را تکرار می‌کند چون payload هیچ‌وقت اصلاح نمی‌شود.
 *
 * این تابع بعد از resolveProductTempId صدا زده می‌شود تا temp ID را در
 * رکوردهای FinalProduct و در payload عملیات سینک pending/failed مربوطه با
 * ID واقعی جایگزین کند و آن عملیات را برای ارسال دوباره به pending برگرداند.
 */
export async function resolveFinalProductTempProductId(
  tempProductId: number,
  realProductId: number,
): Promise<void> {
  const affected = await accountingDb.finalProducts
    .where('productId')
    .equals(tempProductId)
    .toArray();
  await Promise.all(
    affected.map((fp) =>
      accountingDb.finalProducts.update(fp.id, { productId: realProductId, updatedAt: new Date().toISOString() }),
    ),
  );

  const ops = await accountingDb.syncOperations
    .where('entityType')
    .equals('final_product')
    .toArray();
  const now = new Date().toISOString();
  await Promise.all(
    ops
      .filter((op) => Number(op.payload?.productId) === tempProductId)
      .map((op) =>
        accountingDb.syncOperations.update(op.id!, {
          payload: { ...op.payload, productId: realProductId },
          status: 'pending',
          retryCount: 0,
          errorMessage: undefined,
          updatedAt: now,
        }),
      ),
  );
}

/** پیدا کردن یا ساختن FinalProduct حسابداری برای یک محصول منو */
export async function getOrCreateFinalProductByProductId(
  restaurantId: number,
  menuProductId: number,
  name: string,
): Promise<number> {
  const results = await accountingDb.finalProducts
    .where('productId')
    .equals(menuProductId)
    .toArray();
  const existing = results.find((fp) => fp.restaurantId === restaurantId);
  if (existing) return existing.id;
  const newFp = await createFinalProductLocal({ restaurantId, name, productId: menuProductId });
  return newFp.id;
}

/**
 * نقشه‌ای از productId (محصول منو) → currentStock (موجودی محصول نهایی) می‌سازد.
 * فقط ردیف‌هایی که productId دارند و به این رستوران تعلق دارند در نظر گرفته می‌شوند.
 * برای نمایش موجودی هر محصول در لیست محصولات استفاده می‌شود.
 */
export async function getFinalProductStockByProductId(
  restaurantId: number,
): Promise<Map<number, number>> {
  const rows = await accountingDb.finalProducts
    .where('restaurantId')
    .equals(restaurantId)
    .toArray();
  const map = new Map<number, number>();
  for (const fp of rows) {
    const pid = Number(fp.productId);
    if (!Number.isFinite(pid) || pid <= 0) continue;
    // اگر چند FinalProduct به یک productId وصل بودند، مجموع را نگه می‌داریم
    // (احتمالاً نباید چنین چیزی رخ دهد، ولی محافظ کار اضافه است).
    const stock = Number(fp.currentStock || 0);
    map.set(pid, (map.get(pid) ?? 0) + stock);
  }
  return map;
}

export async function deletePurchaseInvoiceDraftLocal(invoiceId: number) {
  const existing = await accountingDb.purchaseInvoices.get(invoiceId);
  if (!existing) return false;
  await accountingDb.purchaseInvoiceItems.where('purchaseInvoiceId').equals(invoiceId).delete();
  await accountingDb.purchaseInvoices.delete(invoiceId);
  return true;
}

// ─── Cash Account Transaction Helpers ────────────────────────────────────────

export function accountTypeLabel(type: CashAccountType): string {
  switch (type) {
    case 'cash': return 'صندوق';
    case 'card': return 'کارتخوان';
    case 'online': return 'آنلاین';
    case 'bank': return 'بانک';
    default: return type;
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
  cashAccountName?: string;   // e.g., "صندوق جلو" (defaults to 'صندوق')
  cardAccountName?: string;   // e.g., "کارتخوان ۱" (defaults to 'کارتخوان')
}): Promise<void> {
  const {
    restaurantId, orderId, orderNumber, customerPhone,
    paymentMethod, finalAmount, splitCash, splitCard, splitOnline, mixedHasCredit,
    referenceCode,
  } = params;
  const cashName = params.cashAccountName || 'صندوق';
  const cardName = params.cardAccountName || 'کارتخوان';
  const today = new Date().toISOString().slice(0, 10);
  const base = {
    restaurantId, orderId, orderNumber,
    customerPhone: customerPhone || undefined,
    transactionType: 'sale_income' as CashTransactionType,
    date: today,
    referenceCode: referenceCode || undefined,
  };

  if (paymentMethod === 'cash') {
    await recordCashTransaction({ ...base, accountType: 'cash', accountName: cashName, amount: finalAmount });
  } else if (paymentMethod === 'card') {
    await recordCashTransaction({ ...base, accountType: 'card', accountName: cardName, amount: finalAmount });
  } else if (paymentMethod === 'online') {
    await recordCashTransaction({ ...base, accountType: 'online', accountName: 'آنلاین', amount: finalAmount });
  } else if (paymentMethod === 'mixed' || paymentMethod === 'credit') {
    // Record each portion to its respective account
    if (splitCash > 0) {
      await recordCashTransaction({ ...base, accountType: 'cash', accountName: cashName, amount: splitCash });
    }
    if (splitCard > 0) {
      await recordCashTransaction({ ...base, accountType: 'card', accountName: cardName, amount: splitCard, referenceCode });
    }
    if (splitOnline > 0) {
      await recordCashTransaction({ ...base, accountType: 'online', accountName: 'آنلاین', amount: splitOnline });
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
      .where('restaurantId').equals(restaurantId)
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
  let rows = await accountingDb.cashAccountTransactions
    .where('restaurantId').equals(restaurantId)
    .reverse().sortBy('createdAt') as CashAccountTransaction[];

  if (opts?.accountType) rows = rows.filter((r) => r.accountType === opts.accountType);
  if (opts?.fromDate) rows = rows.filter((r) => r.date >= opts.fromDate!);
  if (opts?.toDate) rows = rows.filter((r) => r.date <= opts.toDate!);
  if (opts?.limit) rows = rows.slice(0, opts.limit);
  return rows;
}

export async function getAllCashAccountsSummary(restaurantId: number): Promise<
  Array<{ accountType: CashAccountType; accountName: string; balance: number; txCount: number }>
> {
  const all = await accountingDb.cashAccountTransactions
    .where('restaurantId').equals(restaurantId).toArray() as CashAccountTransaction[];

  const types: CashAccountType[] = ['cash', 'card', 'online', 'bank'];
  return types.map((type) => {
    const txs = all.filter((r) => r.accountType === type);
    const balance = txs.reduce((sum, r) => sum + Number(r.amount || 0), 0);
    return { accountType: type, accountName: accountTypeLabel(type), balance, txCount: txs.length };
  }).filter((s) => s.txCount > 0 || s.accountType === 'cash' || s.accountType === 'card');
}

export async function getPendingCashTransactions(restaurantId: number, limit = 100): Promise<CashAccountTransaction[]> {
  try {
    return await accountingDb.cashAccountTransactions
      .where('[restaurantId+syncStatus]')
      .equals([restaurantId, 'pending'])
      .limit(limit)
      .toArray() as CashAccountTransaction[];
  } catch {
    const all = await accountingDb.cashAccountTransactions.where('restaurantId').equals(restaurantId).toArray() as CashAccountTransaction[];
    return all.filter((tx) => tx.syncStatus === 'pending').slice(0, limit);
  }
}

export async function markCashTransactionsSynced(ids: number[]): Promise<void> {
  await Promise.all(ids.map((id) => accountingDb.cashAccountTransactions.update(id, { syncStatus: 'synced' })));
}
