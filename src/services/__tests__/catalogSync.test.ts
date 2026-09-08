// Dexie needs a real (or fake) IndexedDB backend, which jsdom does not provide.
// This must be imported before catalogLocalDb.ts (which constructs the Dexie
// database at module load time) is ever imported, directly or transitively.
import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Only the API layer (and the optional order-cache) is mocked — catalogSync's
// interaction with its *local* Dexie store (catalogLocalDb) is exercised for
// real via fake-indexeddb, so idempotency assertions reflect actual local
// state transitions rather than a hand-rolled stand-in for them.
vi.mock('../api', () => ({
  createCategory: vi.fn(),
  createProduct: vi.fn(),
  getCategoriesLastUpdatedAt: vi.fn(),
  getCategories: vi.fn(),
  getProductsLastUpdatedAt: vi.fn(),
  getProductsAdmin: vi.fn(),
  updateCategoryById: vi.fn(),
  updateProductById: vi.fn(),
}));

vi.mock('../cache', () => ({
  cacheMenu: vi.fn(),
  getCachedMenu: vi.fn().mockResolvedValue(null),
}));

import * as api from '../api';
import { runCatalogSync } from '../catalogSync';
import {
  catalogDb,
  createCategoryLocal,
  createProductLocal,
  setCatalogSyncMeta,
  updateCategoryLocal,
} from '../catalogLocalDb';

const RID = 42;
const TOKEN = 'test-token';

function mockNoPullChanges() {
  (api.getCategoriesLastUpdatedAt as any).mockResolvedValue({ lastUpdatedAt: null });
  (api.getProductsLastUpdatedAt as any).mockResolvedValue({ lastUpdatedAt: null });
  (api.getCategories as any).mockResolvedValue([]);
  (api.getProductsAdmin as any).mockResolvedValue({ data: [], total: 0 });
}

beforeEach(async () => {
  vi.clearAllMocks();
  await catalogDb.categories.clear();
  await catalogDb.products.clear();
  await catalogDb.syncMeta.clear();
  mockNoPullChanges();
  // These tests are only about push behavior. Seed the "full catalog sync
  // already happened recently" watermark so runCatalogSync's PULL branch
  // (which reconciles/deletes any local row the mocked `getCategories`
  // response doesn't mention) does not run and interfere with push-only
  // assertions — a full pull is a separate concern covered by its own test
  // below.
  await setCatalogSyncMeta(`catalog:lastFullSyncAt:${RID}`, new Date().toISOString());
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('runCatalogSync push idempotency', () => {
  it('pushes an offline-created category exactly once across two sync runs', async () => {
    const local = await createCategoryLocal({ restaurantId: RID, name_fa: 'نوشیدنی' });
    (api.createCategory as any).mockResolvedValue({ id: 501 });

    const first = await runCatalogSync({ restaurantId: RID, token: TOKEN });
    expect(first.categoriesPushed).toBe(1);
    expect(api.createCategory).toHaveBeenCalledTimes(1);

    const afterFirst = await catalogDb.categories.get(501);
    expect(afterFirst?._syncStatus).toBe('synced');
    expect(await catalogDb.categories.get(local.id)).toBeUndefined();

    // Simulate a second, redundant sync trigger (e.g. both an "online" event
    // and a periodic timer firing back-to-back) with nothing new dirty.
    const second = await runCatalogSync({ restaurantId: RID, token: TOKEN });
    expect(second.categoriesPushed).toBe(0);
    // The real regression this protects: createCategory must NOT be called
    // again just because sync ran twice.
    expect(api.createCategory).toHaveBeenCalledTimes(1);
  });

  it('pushes an offline update to an already-synced category exactly once across two sync runs', async () => {
    await catalogDb.categories.put({
      id: 7,
      restaurantId: RID,
      name: '',
      name_fa: 'قهوه',
      description: '',
      sortOrder: 0,
      hasVat: false,
      updatedAt: new Date().toISOString(),
      _syncStatus: 'synced',
      _syncError: null,
    });
    await updateCategoryLocal(7, { name_fa: 'قهوه فرانسه' });
    (api.updateCategoryById as any).mockResolvedValue({});

    const first = await runCatalogSync({ restaurantId: RID, token: TOKEN });
    expect(first.categoriesPushed).toBe(1);
    expect(api.updateCategoryById).toHaveBeenCalledTimes(1);

    const second = await runCatalogSync({ restaurantId: RID, token: TOKEN });
    expect(second.categoriesPushed).toBe(0);
    expect(api.updateCategoryById).toHaveBeenCalledTimes(1);
  });

  it('pushes an offline-created product exactly once across two sync runs', async () => {
    await catalogDb.categories.put({
      id: 7,
      restaurantId: RID,
      name: '',
      name_fa: 'قهوه',
      description: '',
      sortOrder: 0,
      hasVat: false,
      updatedAt: new Date().toISOString(),
      _syncStatus: 'synced',
      _syncError: null,
    });
    const localProduct = await createProductLocal({
      restaurantId: RID,
      name_fa: 'اسپرسو',
      price: 90000,
      category_id: 7,
    });
    (api.createProduct as any).mockResolvedValue({ id: 900 });

    const first = await runCatalogSync({ restaurantId: RID, token: TOKEN });
    expect(first.productsPushed).toBe(1);
    expect(api.createProduct).toHaveBeenCalledTimes(1);
    expect(await catalogDb.products.get(localProduct.id)).toBeUndefined();
    expect((await catalogDb.products.get(900))?._syncStatus).toBe('synced');

    const second = await runCatalogSync({ restaurantId: RID, token: TOKEN });
    expect(second.productsPushed).toBe(0);
    expect(api.createProduct).toHaveBeenCalledTimes(1);
  });

  // This is the FK-race scenario the electron-offline-sync skill documents:
  // a product created offline under a category ALSO created offline (both
  // negative temp IDs). The product must never be pushed while its parent
  // category still has an unresolved temp ID, and once the category push
  // does succeed it must not require a *third* trigger to catch up.
  it('keeps a dependent product unpushed while its parent category push is still failing, and syncs both once the category push succeeds', async () => {
    const localCategory = await createCategoryLocal({ restaurantId: RID, name_fa: 'دسته جدید' });
    const localProduct = await createProductLocal({
      restaurantId: RID,
      name_fa: 'محصول جدید',
      price: 50000,
      category_id: localCategory.id, // negative temp ID, same as the category's own temp id
    });
    expect(localProduct.category_id).toBe(localCategory.id);

    (api.createCategory as any).mockRejectedValueOnce(new Error('offline'));

    const first = await runCatalogSync({ restaurantId: RID, token: TOKEN });
    expect(first.categoriesFailed).toBe(1);
    expect(first.categoriesPushed).toBe(0);
    // Product is skipped this round because category_id is still negative —
    // pushing it now would reference a category the server has never heard of.
    expect(first.productsPushed).toBe(0);
    expect(api.createProduct).not.toHaveBeenCalled();
    expect((await catalogDb.products.get(localProduct.id))?.category_id).toBe(localCategory.id);

    // Category push now succeeds. resolveCategoryTempId immediately patches
    // any dependent product's category_id in the SAME sync pass (before the
    // product-push section re-reads pending products), so both the category
    // and its dependent product resolve together in this one run.
    (api.createCategory as any).mockResolvedValueOnce({ id: 600 });
    (api.createProduct as any).mockResolvedValueOnce({ id: 901 });

    const second = await runCatalogSync({ restaurantId: RID, token: TOKEN });
    expect(second.categoriesPushed).toBe(1);
    expect(second.productsPushed).toBe(1);
    expect(api.createProduct).toHaveBeenCalledTimes(1);
    expect(api.createProduct).toHaveBeenCalledWith(
      expect.objectContaining({ category_id: 600 }),
      TOKEN,
    );

    // A third, redundant sync must not resend either one.
    const third = await runCatalogSync({ restaurantId: RID, token: TOKEN });
    expect(third.categoriesPushed).toBe(0);
    expect(third.productsPushed).toBe(0);
    expect(api.createCategory).toHaveBeenCalledTimes(2); // 1 failure + 1 success, never a 3rd
    expect(api.createProduct).toHaveBeenCalledTimes(1);
  });

  it('marks a category failed (not synced) when the server rejects the push, and retries it on the next sync without duplicating on eventual success', async () => {
    await createCategoryLocal({ restaurantId: RID, name_fa: 'دسته ناموفق' });
    (api.createCategory as any).mockRejectedValueOnce(new Error('network error'));

    const first = await runCatalogSync({ restaurantId: RID, token: TOKEN });
    expect(first.categoriesFailed).toBe(1);
    expect(first.categoriesPushed).toBe(0);

    const failedRows = await catalogDb.categories.where('restaurantId').equals(RID).toArray();
    expect(failedRows).toHaveLength(1);
    expect(failedRows[0]._syncStatus).toBe('failed');

    (api.createCategory as any).mockResolvedValueOnce({ id: 777 });
    const second = await runCatalogSync({ restaurantId: RID, token: TOKEN });
    expect(second.categoriesPushed).toBe(1);
    expect(api.createCategory).toHaveBeenCalledTimes(2);

    // Once synced, a third sync must not resend it a third time.
    const third = await runCatalogSync({ restaurantId: RID, token: TOKEN });
    expect(third.categoriesPushed).toBe(0);
    expect(api.createCategory).toHaveBeenCalledTimes(2);
  });
});

describe('runCatalogSync pull reconciliation', () => {
  it('deletes a locally-synced category the server no longer returns on a full pull', async () => {
    await catalogDb.categories.put({
      id: 501,
      restaurantId: RID,
      name: '',
      name_fa: 'حذف‌شده',
      description: '',
      sortOrder: 0,
      hasVat: false,
      updatedAt: new Date().toISOString(),
      _syncStatus: 'synced',
      _syncError: null,
    });
    // Force a full pull and simulate the server no longer listing this category.
    await catalogDb.syncMeta.delete(`catalog:lastFullSyncAt:${RID}`);
    (api.getCategoriesLastUpdatedAt as any).mockResolvedValue({ lastUpdatedAt: '2026-09-01T00:00:00.000Z' });
    (api.getCategories as any).mockResolvedValue([]);

    const result = await runCatalogSync({ restaurantId: RID, token: TOKEN });
    expect(result.categoriesPulled).toBe(0);
    expect(await catalogDb.categories.get(501)).toBeUndefined();
  });
});

describe('runCatalogSync offline short-circuit', () => {
  it('does nothing and pushes/pulls nothing when offline', async () => {
    const originalOnLine = Object.getOwnPropertyDescriptor(window.navigator, 'onLine');
    Object.defineProperty(window.navigator, 'onLine', { value: false, configurable: true });
    try {
      await createCategoryLocal({ restaurantId: RID, name_fa: 'در صف' });
      const result = await runCatalogSync({ restaurantId: RID, token: TOKEN });
      expect(result).toEqual({
        isOnline: false,
        categoriesPushed: 0,
        categoriesFailed: 0,
        productsPushed: 0,
        productsFailed: 0,
        categoriesPulled: 0,
        productsPulled: 0,
      });
      expect(api.createCategory).not.toHaveBeenCalled();
    } finally {
      if (originalOnLine) Object.defineProperty(window.navigator, 'onLine', originalOnLine);
    }
  });
});
