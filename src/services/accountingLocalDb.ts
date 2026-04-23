import Dexie, { type Table } from 'dexie';

export type SyncEntityType =
  | 'raw_material'
  | 'supplier'
  | 'final_product'
  | 'recipe_item'
  | 'cash_bank_account'
  | 'operational_expense';

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

export class MenusAccountingDb extends Dexie {
  rawMaterials!: Table<any, number>;
  suppliers!: Table<any, number>;
  finalProducts!: Table<any, number>;
  recipeItems!: Table<any, number>;
  cashBankAccounts!: Table<any, number>;
  operationalExpenses!: Table<any, number>;
  purchaseInvoices!: Table<any, number>;
  purchaseInvoiceItems!: Table<any, number>;
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
  return accountingDb.syncOperations
    .where('[restaurantId+status]')
    .anyOf([
      [restaurantId, 'pending'],
      [restaurantId, 'failed'],
    ])
    .limit(limit)
    .toArray();
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
    default:
      return 'rawMaterials';
  }
}

export async function upsertPulledEntities(entityType: SyncEntityType, rows: any[]) {
  const tableName = mapCollectionName(entityType);
  const table = accountingDb.table<any, any>(tableName as string);
  await table.bulkPut(rows || []);
}

export async function getSyncMeta(key: string): Promise<string | null> {
  const row = await accountingDb.syncMeta.get(key);
  return row?.value ?? null;
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

export async function createPurchaseInvoiceLocal(input: {
  restaurantId: number;
  supplierId: number;
  invoiceNumber: string;
  purchaseDate: string;
  items: Array<{ rawMaterialId: number; quantity: number; unitPrice: number }>;
  extraCosts?: number;
}) {
  const id = nextLocalEntityId();
  const now = new Date().toISOString();
  const items = input.items.map((x) => ({
    id: nextLocalEntityId(),
    purchaseInvoiceId: id,
    rawMaterialId: x.rawMaterialId,
    quantity: Number(x.quantity),
    unitPrice: Number(x.unitPrice),
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
  items: Array<{ rawMaterialId: number; quantity: number; unitPrice: number }>;
  extraCosts?: number;
}) {
  const existing = await accountingDb.purchaseInvoices.get(input.invoiceId);
  if (!existing) return null;
  const now = new Date().toISOString();
  const lineItems = input.items.map((x) => ({
    id: nextLocalEntityId(),
    purchaseInvoiceId: input.invoiceId,
    rawMaterialId: x.rawMaterialId,
    quantity: Number(x.quantity),
    unitPrice: Number(x.unitPrice),
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

export async function deletePurchaseInvoiceDraftLocal(invoiceId: number) {
  const existing = await accountingDb.purchaseInvoices.get(invoiceId);
  if (!existing) return false;
  await accountingDb.purchaseInvoiceItems.where('purchaseInvoiceId').equals(invoiceId).delete();
  await accountingDb.purchaseInvoices.delete(invoiceId);
  return true;
}
