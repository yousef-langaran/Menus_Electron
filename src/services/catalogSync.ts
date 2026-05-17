import {
  bulkUpsertCategories,
  bulkUpsertProducts,
  getCatalogSyncMeta,
  getLocalCategories,
  getLocalProducts,
  getPendingCategories,
  getPendingProducts,
  markCategoryFailed,
  markCategorySynced,
  markProductFailed,
  markProductSynced,
  resolveCategoryTempId,
  resolveProductTempId,
  setCatalogSyncMeta,
} from './catalogLocalDb';
import {
  createCategory,
  createProduct,
  getCategoriesLastUpdatedAt,
  getCategories,
  getProductsLastUpdatedAt,
  getProductsAdmin,
  updateCategoryById,
  updateProductById,
} from './api';
import { cacheMenu, getCachedMenu } from './cache';

export interface CatalogSyncResult {
  isOnline: boolean;
  categoriesPushed: number;
  categoriesFailed: number;
  productsPushed: number;
  productsFailed: number;
  categoriesPulled: number;
  productsPulled: number;
}

function resolveOnlineStatus(): Promise<boolean> {
  if (typeof window !== 'undefined' && window.electronAPI?.checkOnline) {
    return window.electronAPI.checkOnline();
  }
  return Promise.resolve(typeof navigator !== 'undefined' ? navigator.onLine : true);
}

export async function runCatalogSync(args: {
  restaurantId: number;
  restaurantName?: string;
  token: string;
}): Promise<CatalogSyncResult> {
  const { restaurantId, restaurantName, token } = args;

  const isOnline = await resolveOnlineStatus();
  if (!isOnline) {
    return {
      isOnline: false,
      categoriesPushed: 0,
      categoriesFailed: 0,
      productsPushed: 0,
      productsFailed: 0,
      categoriesPulled: 0,
      productsPulled: 0,
    };
  }

  let categoriesPushed = 0;
  let categoriesFailed = 0;
  let productsPushed = 0;
  let productsFailed = 0;

  // ─── PUSH: دسته‌بندی‌ها ────────────────────────────────────────────────────
  const pendingCategories = await getPendingCategories(restaurantId);

  for (const cat of pendingCategories) {
    try {
      if (cat._syncStatus === 'pending_create' || (cat._syncStatus === 'failed' && cat.id < 0)) {
        const serverCat = await createCategory(
          {
            name_fa: cat.name_fa,
            name: cat.name || undefined,
            description: cat.description || undefined,
            restaurantId,
          },
          token,
        );
        await resolveCategoryTempId(cat.id, Number(serverCat.id));
        categoriesPushed++;
      } else if (cat._syncStatus === 'pending_update' || cat._syncStatus === 'failed') {
        await updateCategoryById(
          cat.id,
          {
            name_fa: cat.name_fa,
            name: cat.name || undefined,
            description: cat.description || undefined,
          },
          token,
        );
        await markCategorySynced(cat.id);
        categoriesPushed++;
      }
    } catch (e: any) {
      const msg = e?.response?.data?.message || e?.message || 'خطای سینک دسته‌بندی';
      await markCategoryFailed(cat.id, msg);
      categoriesFailed++;
    }
  }

  // ─── PUSH: محصولات ────────────────────────────────────────────────────────
  const pendingProducts = await getPendingProducts(restaurantId);

  for (const prod of pendingProducts) {
    try {
      // اگر category_id هنوز منفی است یعنی دسته offline ساخته شده و هنوز sync نشده
      if (prod.category_id < 0) {
        continue; // بعد از sync دسته، این محصول در دور بعدی sync خواهد شد
      }

      if (prod._syncStatus === 'pending_create' || (prod._syncStatus === 'failed' && prod.id < 0)) {
        const serverProd = await createProduct(
          {
            name_fa: prod.name_fa,
            name: prod.name || undefined,
            price: prod.price,
            category_id: prod.category_id,
            barcode: prod.barcode || undefined,
            isAvailable: prod.isAvailable,
            restaurantId,
            unit: prod.unit,
          },
          token,
        );
        await resolveProductTempId(prod.id, Number(serverProd.id));
        productsPushed++;
      } else if (prod._syncStatus === 'pending_update' || prod._syncStatus === 'failed') {
        await updateProductById(
          prod.id,
          {
            name_fa: prod.name_fa,
            name: prod.name || undefined,
            price: prod.price,
            category_id: prod.category_id,
            barcode: prod.barcode || undefined,
            isAvailable: prod.isAvailable,
            unit: prod.unit,
          },
          token,
        );
        await markProductSynced(prod.id);
        productsPushed++;
      }
    } catch (e: any) {
      const msg = e?.response?.data?.message || e?.message || 'خطای سینک محصول';
      await markProductFailed(prod.id, msg);
      productsFailed++;
    }
  }

  // ─── PULL: دسته‌بندی‌ها ────────────────────────────────────────────────────
  const catMetaKey = `catalog:categories:lastUpdatedAt:${restaurantId}`;
  const prodMetaKey = `catalog:products:lastUpdatedAt:${restaurantId}`;

  let categoriesPulled = 0;
  let productsPulled = 0;

  try {
    const cachedCatUpdatedAt = await getCatalogSyncMeta(catMetaKey);
    const { lastUpdatedAt: serverCatUpdatedAt } = await getCategoriesLastUpdatedAt(restaurantId, token);

    if (serverCatUpdatedAt && serverCatUpdatedAt !== cachedCatUpdatedAt) {
      const serverCategories = await getCategories(restaurantName, restaurantId, token);
      await bulkUpsertCategories(serverCategories, restaurantId);
      categoriesPulled = serverCategories.length;
      await setCatalogSyncMeta(catMetaKey, serverCatUpdatedAt);
    }
  } catch {
    // pull خطا داد، سینک push را خراب نمی‌کند
  }

  // ─── PULL: محصولات ────────────────────────────────────────────────────────
  try {
    const cachedProdUpdatedAt = await getCatalogSyncMeta(prodMetaKey);
    const { lastUpdatedAt: serverProdUpdatedAt } = await getProductsLastUpdatedAt(restaurantId, token);

    if (serverProdUpdatedAt && serverProdUpdatedAt !== cachedProdUpdatedAt) {
      const CHUNK = 100;
      let allProducts: any[] = [];
      const first = await getProductsAdmin({ restaurantId, restaurantName, page: 1, limit: CHUNK }, token);
      allProducts = first.data;
      const totalPages = Math.ceil(first.total / CHUNK);
      for (let pg = 2; pg <= totalPages; pg++) {
        const chunk = await getProductsAdmin({ restaurantId, restaurantName, page: pg, limit: CHUNK }, token);
        allProducts = allProducts.concat(chunk.data);
      }
      await bulkUpsertProducts(allProducts, restaurantId);
      productsPulled = allProducts.length;
      await setCatalogSyncMeta(prodMetaKey, serverProdUpdatedAt);
    }
  } catch {
    // pull خطا داد
  }

  // ─── به‌روزرسانی کش صفحه سفارش ─────────────────────────────────────────
  // اگر هر چیزی تغییر کرد، cacheMenu را هم به‌روز کنیم تا Order.tsx از کش جدید بهره‌مند شود
  if (categoriesPulled > 0 || productsPulled > 0) {
    try {
      const existing = await getCachedMenu(restaurantId, restaurantName);
      const [{ data: localProducts }, localCategories] = await Promise.all([
        getLocalProducts(restaurantId),
        getLocalCategories(restaurantId),
      ]);
      // فقط محصولات synced به کش Order اضافه می‌شوند
      const syncedProducts = localProducts.filter((p) => p._syncStatus === 'synced');
      const syncedCategories = localCategories.filter((c) => c._syncStatus === 'synced');
      // محصولات را با اطلاعات دسته‌بندی غنی‌سازی می‌کنیم (فرمت مورد انتظار Order.tsx)
      const catMap = new Map(syncedCategories.map((c) => [c.id, c]));
      const enrichedProducts = syncedProducts.map((p) => ({
        ...p,
        category: catMap.get(p.category_id) || { id: p.category_id, name_fa: '' },
      }));
      // نام‌های دسته‌بندی به صورت string[] (فرمت مورد انتظار Order.tsx)
      const catNames = Array.from(new Set(syncedCategories.map((c) => c.name_fa).filter(Boolean)));
      await cacheMenu(
        restaurantId,
        restaurantName || existing?.restaurantName || '',
        enrichedProducts,
        catNames,
        existing?.cartItemOptions,
        existing?.isMobileRequiredInElectronPanel,
        existing?.isScaleIntegrationEnabled,
        existing?.restrictScaleAccessToElectronManagers,
        existing?.isCardTerminalEnabled,
        existing?.restrictCardTerminalAccessToElectronManagers,
        existing?.allowDirectSendAmountToCardTerminal,
        new Date().toISOString(),
      );
    } catch {
      // به‌روزرسانی cacheMenu اختیاری است
    }
  }

  // اطلاع به کامپوننت‌های React که sync انجام شد
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event('catalog:synced'));
  }

  return {
    isOnline: true,
    categoriesPushed,
    categoriesFailed,
    productsPushed,
    productsFailed,
    categoriesPulled,
    productsPulled,
  };
}

/** تعداد آیتم‌های در صف سینک */
export async function getCatalogQueueStats(restaurantId: number): Promise<{
  pendingCount: number;
  failedCount: number;
}> {
  const [cats, prods] = await Promise.all([
    getPendingCategories(restaurantId),
    getPendingProducts(restaurantId),
  ]);
  const pending = [...cats, ...prods].filter(
    (x) => x._syncStatus === 'pending_create' || x._syncStatus === 'pending_update',
  ).length;
  const failed = [...cats, ...prods].filter((x) => x._syncStatus === 'failed').length;
  return { pendingCount: pending, failedCount: failed };
}
