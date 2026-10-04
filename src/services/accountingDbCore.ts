import Dexie, { type Table } from 'dexie';
import { LocalSyncOperation, SyncMeta, CashAccountTransaction } from './accountingDbTypes';

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
