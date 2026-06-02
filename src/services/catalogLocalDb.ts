import Dexie, { type Table } from 'dexie';

export type CatalogSyncStatus = 'synced' | 'pending_create' | 'pending_update' | 'failed';

export interface LocalCategory {
  id: number;           // سرور ID (مثبت) یا temp ID (منفی = offline-created)
  restaurantId: number;
  name: string;
  name_fa: string;
  description: string;
  sortOrder: number;
  updatedAt: string;
  _syncStatus: CatalogSyncStatus;
  _syncError?: string | null;
}

export interface LocalProduct {
  id: number;           // سرور ID (مثبت) یا temp ID (منفی = offline-created)
  restaurantId: number;
  name: string;
  name_fa: string;
  barcode?: string | null;
  price: number;
  category_id: number;  // می‌تواند temp (منفی) باشد اگر دسته offline ساخته شده
  unit: string;
  useScaleForWeight?: boolean;
  isAvailable: boolean;
  sortOrder: number;
  updatedAt: string;
  _syncStatus: CatalogSyncStatus;
  _syncError?: string | null;
}

export interface CatalogSyncMeta {
  key: string;
  value: string;
}

export class MenusCatalogDb extends Dexie {
  categories!: Table<LocalCategory, number>;
  products!: Table<LocalProduct, number>;
  syncMeta!: Table<CatalogSyncMeta, string>;

  constructor() {
    super('menus-catalog-db');
    this.version(1).stores({
      categories: 'id, restaurantId, _syncStatus, updatedAt',
      products: 'id, restaurantId, category_id, _syncStatus, updatedAt',
      syncMeta: 'key',
    });
    // v2 — Rial migration: cached prices were in Toman. Clear the catalog and the
    // sync watermarks so the next sync performs a FULL re-pull from the (now Rial)
    // API. NOTE: any catalog edits made offline and not yet synced are dropped, so
    // the POS must be synced/online when this upgrade runs (coordinated release).
    this.version(2)
      .stores({
        categories: 'id, restaurantId, _syncStatus, updatedAt',
        products: 'id, restaurantId, category_id, _syncStatus, updatedAt',
        syncMeta: 'key',
      })
      .upgrade(async (tx) => {
        await tx.table('products').clear();
        await tx.table('categories').clear();
        await tx.table('syncMeta').clear();
      });
  }
}

export const catalogDb = new MenusCatalogDb();

// ─── helpers ────────────────────────────────────────────────────────────────

function nextTempId(): number {
  return -(Date.now() + Math.floor(Math.random() * 1000));
}

// ─── sync meta ──────────────────────────────────────────────────────────────

export async function getCatalogSyncMeta(key: string): Promise<string | null> {
  const row = await catalogDb.syncMeta.get(key);
  return row?.value ?? null;
}

export async function setCatalogSyncMeta(key: string, value: string): Promise<void> {
  await catalogDb.syncMeta.put({ key, value });
}

// ─── categories ─────────────────────────────────────────────────────────────

export async function getLocalCategories(restaurantId: number): Promise<LocalCategory[]> {
  return catalogDb.categories
    .where('restaurantId')
    .equals(restaurantId)
    .toArray();
}

export async function createCategoryLocal(input: {
  restaurantId: number;
  name_fa: string;
  name?: string;
  description?: string;
}): Promise<LocalCategory> {
  const now = new Date().toISOString();
  const row: LocalCategory = {
    id: nextTempId(),
    restaurantId: input.restaurantId,
    name_fa: input.name_fa.trim(),
    name: input.name?.trim() || '',
    description: input.description?.trim() || '',
    sortOrder: 0,
    updatedAt: now,
    _syncStatus: 'pending_create',
    _syncError: null,
  };
  await catalogDb.categories.put(row);
  return row;
}

export async function updateCategoryLocal(
  id: number,
  patch: Partial<Pick<LocalCategory, 'name_fa' | 'name' | 'description'>>,
): Promise<LocalCategory | null> {
  const existing = await catalogDb.categories.get(id);
  if (!existing) return null;
  const now = new Date().toISOString();
  const next: LocalCategory = {
    ...existing,
    ...patch,
    updatedAt: now,
    _syncStatus: existing._syncStatus === 'pending_create' ? 'pending_create' : 'pending_update',
    _syncError: null,
  };
  await catalogDb.categories.put(next);
  return next;
}

/** بعد از sync موفق: temp ID → server ID و به‌روزرسانی همه محصولاتی که به این دسته اشاره دارند */
export async function resolveCategoryTempId(tempId: number, serverId: number): Promise<void> {
  const existing = await catalogDb.categories.get(tempId);
  if (!existing) return;
  await catalogDb.categories.delete(tempId);
  await catalogDb.categories.put({ ...existing, id: serverId, _syncStatus: 'synced', _syncError: null });
  // به‌روزرسانی محصولاتی که به این دسته اشاره دارند
  const dependentProducts = await catalogDb.products.where('category_id').equals(tempId).toArray();
  await Promise.all(
    dependentProducts.map((p) => catalogDb.products.update(p.id, { category_id: serverId })),
  );
}

export async function markCategorySynced(id: number): Promise<void> {
  await catalogDb.categories.update(id, { _syncStatus: 'synced', _syncError: null });
}

export async function markCategoryFailed(id: number, error: string): Promise<void> {
  await catalogDb.categories.update(id, { _syncStatus: 'failed', _syncError: error });
}

export async function deleteCategoryLocal(id: number): Promise<void> {
  await catalogDb.categories.delete(id);
}

export async function getPendingCategories(restaurantId: number): Promise<LocalCategory[]> {
  const all = await catalogDb.categories.where('restaurantId').equals(restaurantId).toArray();
  return all.filter((c) => c._syncStatus === 'pending_create' || c._syncStatus === 'pending_update' || c._syncStatus === 'failed');
}

/** upsert دسته‌بندی‌های دریافت‌شده از سرور — فقط ردیف‌های synced به‌روز می‌شوند */
export async function bulkUpsertCategories(
  categories: any[],
  restaurantId: number,
): Promise<void> {
  const pendingIds = new Set(
    (await catalogDb.categories.where('restaurantId').equals(restaurantId).toArray())
      .filter((c) => c._syncStatus !== 'synced')
      .map((c) => c.id),
  );
  const rows: LocalCategory[] = categories
    .filter((c) => !pendingIds.has(Number(c.id)))
    .map((c) => ({
      id: Number(c.id),
      restaurantId,
      name_fa: c.name_fa || '',
      name: c.name || '',
      description: c.description || '',
      sortOrder: Number(c.sortOrder ?? 0),
      updatedAt: c.updated_at || c.updatedAt || new Date().toISOString(),
      _syncStatus: 'synced' as const,
      _syncError: null,
    }));
  if (rows.length > 0) await catalogDb.categories.bulkPut(rows);
}

// ─── products ────────────────────────────────────────────────────────────────

export async function getLocalProducts(
  restaurantId: number,
  opts?: { search?: string; page?: number; limit?: number },
): Promise<{ data: LocalProduct[]; total: number }> {
  let all = await catalogDb.products.where('restaurantId').equals(restaurantId).toArray();

  if (opts?.search) {
    const q = opts.search.trim().toLowerCase();
    all = all.filter(
      (p) =>
        p.name_fa.toLowerCase().includes(q) ||
        (p.name || '').toLowerCase().includes(q) ||
        (p.barcode || '').includes(q),
    );
  }

  const total = all.length;
  if (opts?.page && opts?.limit) {
    const start = (opts.page - 1) * opts.limit;
    return { data: all.slice(start, start + opts.limit), total };
  }
  return { data: all, total };
}

export async function createProductLocal(input: {
  restaurantId: number;
  name_fa: string;
  name?: string;
  price: number;
  category_id: number;
  barcode?: string;
  unit?: string;
  isAvailable?: boolean;
}): Promise<LocalProduct> {
  const now = new Date().toISOString();
  const row: LocalProduct = {
    id: nextTempId(),
    restaurantId: input.restaurantId,
    name_fa: input.name_fa.trim(),
    name: input.name?.trim() || '',
    price: Number(input.price),
    category_id: Number(input.category_id),
    barcode: input.barcode?.trim() || null,
    unit: input.unit || 'عدد',
    isAvailable: input.isAvailable !== false,
    sortOrder: 0,
    updatedAt: now,
    _syncStatus: 'pending_create',
    _syncError: null,
  };
  await catalogDb.products.put(row);
  return row;
}

export async function updateProductLocal(
  id: number,
  patch: Partial<Pick<LocalProduct, 'name_fa' | 'name' | 'price' | 'category_id' | 'barcode' | 'unit' | 'isAvailable'>>,
): Promise<LocalProduct | null> {
  const existing = await catalogDb.products.get(id);
  if (!existing) return null;
  const now = new Date().toISOString();
  const next: LocalProduct = {
    ...existing,
    ...patch,
    updatedAt: now,
    _syncStatus: existing._syncStatus === 'pending_create' ? 'pending_create' : 'pending_update',
    _syncError: null,
  };
  await catalogDb.products.put(next);
  return next;
}

export async function markProductSynced(id: number): Promise<void> {
  await catalogDb.products.update(id, { _syncStatus: 'synced', _syncError: null });
}

export async function markProductFailed(id: number, error: string): Promise<void> {
  await catalogDb.products.update(id, { _syncStatus: 'failed', _syncError: error });
}

export async function deleteProductLocal(id: number): Promise<void> {
  await catalogDb.products.delete(id);
}

/** بعد از sync موفق ایجاد آفلاین: temp ID → server ID */
export async function resolveProductTempId(tempId: number, serverId: number): Promise<void> {
  const existing = await catalogDb.products.get(tempId);
  if (!existing) return;
  await catalogDb.products.delete(tempId);
  await catalogDb.products.put({ ...existing, id: serverId, _syncStatus: 'synced', _syncError: null });
}

export async function getPendingProducts(restaurantId: number): Promise<LocalProduct[]> {
  const all = await catalogDb.products.where('restaurantId').equals(restaurantId).toArray();
  return all.filter((p) => p._syncStatus === 'pending_create' || p._syncStatus === 'pending_update' || p._syncStatus === 'failed');
}

/** upsert محصولات دریافت‌شده از سرور — فقط ردیف‌های synced به‌روز می‌شوند */
export async function bulkUpsertProducts(
  products: any[],
  restaurantId: number,
): Promise<void> {
  const allLocal = await catalogDb.products.where('restaurantId').equals(restaurantId).toArray();
  const pendingIds = new Set(allLocal.filter((p) => p._syncStatus !== 'synced').map((p) => p.id));
  // نگه‌داری فیلدهای local-only مثل useScaleForWeight
  const localMap = new Map(allLocal.map((p) => [p.id, p]));

  const rows: LocalProduct[] = products
    .filter((p) => !pendingIds.has(Number(p.id)))
    .map((p) => ({
      id: Number(p.id),
      restaurantId,
      name_fa: p.name_fa || '',
      name: p.name || '',
      price: Number(p.price ?? 0),
      category_id: Number(p.category?.id ?? p.category_id ?? 0),
      barcode: p.barcode ?? null,
      unit: p.unit || 'عدد',
      useScaleForWeight: localMap.get(Number(p.id))?.useScaleForWeight ?? false,
      isAvailable: p.isAvailable !== false,
      sortOrder: Number(p.sortOrder ?? 0),
      updatedAt: p.update_at || p.updatedAt || new Date().toISOString(),
      _syncStatus: 'synced' as const,
      _syncError: null,
    }));
  if (rows.length > 0) await catalogDb.products.bulkPut(rows);
}
