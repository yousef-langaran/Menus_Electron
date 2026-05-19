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
    default:
      return 'rawMaterials';
  }
}

export async function upsertPulledEntities(entityType: SyncEntityType, rows: any[]) {
  const tableName = mapCollectionName(entityType);
  const table = accountingDb.table<any, any>(tableName as string);
  await table.bulkPut(rows || []);
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
    'supplier', 'raw_material', 'final_product', 'recipe_item', 'cash_bank_account', 'operational_expense',
  ];
  const all = await accountingDb.syncOperations
    .where('restaurantId')
    .equals(restaurantId)
    .toArray();
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
  items: Array<{ rawMaterialId?: number; finalProductId?: number; quantity: number; unitPrice: number; salePrice?: number }>;
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
  items: Array<{ rawMaterialId?: number; finalProductId?: number; quantity: number; unitPrice: number; salePrice?: number }>;
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
