import Dexie, { type Table } from 'dexie';

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

  // برای final_product: اگر سرور productId نداشت (TypeORM relation بدون @Column مستقیم
  // این فیلد را در getMany() برنمی‌گرداند)، مقدار محلی موجود را حفظ کن.
  if (entityType === 'final_product') {
    const ids = rows.map((r) => r.id);
    const existingArr = await table.bulkGet(ids);
    const existingMap = new Map<any, any>();
    existingArr.forEach((e: any) => { if (e) existingMap.set(e.id, e); });
    const merged = rows.map((r) => {
      if (r.productId != null) return r;
      const local = existingMap.get(r.id);
      return local?.productId != null ? { ...r, productId: local.productId } : r;
    });
    await table.bulkPut(merged);
    return;
  }

  await table.bulkPut(rows);
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

export async function retryFailedAccountingOps(restaurantId: number): Promise<number> {
  const failed = await getFailedAccountingSyncOps(restaurantId);
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
}) {
  const id = nextLocalEntityId();
  const now = new Date().toISOString();
  const row = {
    id,
    restaurantId: input.restaurantId,
    name: input.name.trim(),
    isActive: true,
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
  patch: Partial<{ name: string; isActive: boolean }>;
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
