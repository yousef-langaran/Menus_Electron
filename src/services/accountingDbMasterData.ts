import { catalogDb } from './catalogLocalDb';
import { SyncEntityType, LocalSyncOperation } from './accountingDbTypes';
import { accountingDb } from './accountingDbCore';
import { enqueueAccountingOperation } from './accountingDbSyncOps';
import { nextLocalEntityId, nextOpId } from './accountingDbIds';

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
    'supplier',
    'raw_material',
    'final_product',
    'recipe_item',
    'cash_bank_account',
    'operational_expense',
    'expense_category',
    'raw_material_category',
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

export async function getFailedAccountingSyncOps(
  restaurantId: number,
): Promise<LocalSyncOperation[]> {
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
async function repairOrphanedFinalProductPayloads(ops: LocalSyncOperation[]): Promise<void> {
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
        await accountingDb.finalProducts.update(fpId, {
          productId: fixedProductId,
          updatedAt: now,
        });
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
export async function discardFailedAccountingSyncOps(restaurantId: number): Promise<number> {
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
  patch: Partial<{
    name: string;
    phone: string | null;
    address: string | null;
    notes: string | null;
  }>;
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

export async function createRawMaterialCategoryLocal(input: {
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
  await accountingDb.rawMaterialCategories.put(row);
  await enqueueAccountingOperation({
    localOpId: nextOpId(),
    restaurantId: input.restaurantId,
    entityType: 'raw_material_category',
    entityId: String(id),
    operationType: 'create',
    payload: row,
    version: 1,
    clientUpdatedAt: now,
  });
  return row;
}

export async function updateRawMaterialCategoryLocal(input: {
  id: number;
  restaurantId: number;
  patch: Partial<{ name: string; isActive: boolean }>;
}) {
  const existing = await accountingDb.rawMaterialCategories.get(input.id);
  if (!existing) return null;
  const now = new Date().toISOString();
  const next = { ...existing, ...input.patch, updatedAt: now };
  await accountingDb.rawMaterialCategories.put(next);
  await enqueueAccountingOperation({
    localOpId: nextOpId(),
    restaurantId: input.restaurantId,
    entityType: 'raw_material_category',
    entityId: String(input.id),
    operationType: 'update',
    payload: next,
    version: Number(existing.version || 1) + 1,
    clientUpdatedAt: now,
  });
  return next;
}

export async function deleteRawMaterialCategoryLocal(input: { id: number; restaurantId: number }) {
  const existing = await accountingDb.rawMaterialCategories.get(input.id);
  if (!existing) return false;
  await accountingDb.rawMaterialCategories.delete(input.id);
  await enqueueAccountingOperation({
    localOpId: nextOpId(),
    restaurantId: input.restaurantId,
    entityType: 'raw_material_category',
    entityId: String(input.id),
    operationType: 'delete',
    payload: { id: input.id },
    version: Number(existing.version || 1) + 1,
    clientUpdatedAt: new Date().toISOString(),
  });
  return true;
}

// ─── مرجوعی خرید (آفلاین) ───────────────────────────────────────────────────

export async function createPurchaseReturnLocal(input: {
  restaurantId: number;
  purchaseInvoiceId: number;
  returnDate: string;
  notes?: string;
  items: Array<{
    rawMaterialId?: number;
    finalProductId?: number;
    quantity: number;
    unitPrice: number;
  }>;
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
    localOpId: nextOpId(),
    restaurantId: input.restaurantId,
    entityType: 'purchase_return',
    entityId: String(id),
    operationType: 'create',
    payload: { ...returnRow, items },
    version: 1,
    clientUpdatedAt: now,
  });
  return { returnRow, items };
}

export async function getPendingPurchaseReturnDrafts(restaurantId: number): Promise<any[]> {
  return accountingDb.purchaseReturns
    .where('restaurantId')
    .equals(restaurantId)
    .filter((r) => r.localSyncStatus === 'pending' || r.localSyncStatus === 'failed')
    .toArray();
}

export async function markPurchaseReturnSyncState(
  id: number,
  localSyncStatus: 'pending' | 'syncing' | 'synced' | 'failed',
  patch?: { syncError?: string | null; serverReturnId?: number },
) {
  await accountingDb.purchaseReturns.update(id, {
    localSyncStatus,
    ...patch,
    updatedAt: new Date().toISOString(),
  });
}
