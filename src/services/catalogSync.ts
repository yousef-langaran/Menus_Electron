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
  reconcileCatalogCategories,
  reconcileCatalogProducts,
  resolveCategoryTempId,
  resolveProductTempId,
  setCatalogSyncMeta,
} from './catalogLocalDb';
import { resolveFinalProductTempProductId } from './accountingLocalDb';
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

async function concurrentMap<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = [];
  for (let i = 0; i < items.length; i += limit) {
    const chunk = items.slice(i, i + limit);
    const chunkResults = await Promise.all(chunk.map(fn));
    results.push(...chunkResults);
  }
  return results;
}

export async function runCatalogSync(args: {
  restaurantId: number;
  restaurantName?: string;
  token: string;
  forceFullSync?: boolean;
}): Promise<CatalogSyncResult> {
  const { restaurantId, restaurantName, token, forceFullSync = false } = args;

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

  const catResults = await concurrentMap(pendingCategories, 5, async (cat) => {
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
        return { pushed: 1, failed: 0 };
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
        return { pushed: 1, failed: 0 };
      }
      return { pushed: 0, failed: 0 };
    } catch (e: any) {
      const msg = e?.response?.data?.message || e?.message || 'خطای سینک دسته‌بندی';
      await markCategoryFailed(cat.id, msg);
      return { pushed: 0, failed: 1 };
    }
  });
  for (const r of catResults) {
    categoriesPushed += r.pushed;
    categoriesFailed += r.failed;
  }

  // ─── PUSH: محصولات ────────────────────────────────────────────────────────
  const pendingProducts = await getPendingProducts(restaurantId);

  const prodResults = await concurrentMap(pendingProducts, 5, async (prod) => {
    // اگر category_id هنوز منفی است یعنی دسته offline ساخته شده و هنوز sync نشده
    if (prod.category_id < 0) {
      return { pushed: 0, failed: 0 }; // بعد از sync دسته، این محصول در دور بعدی sync خواهد شد
    }
    try {
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
        // اگر قبل از sync این محصول، یک «محصول نهایی» حسابداری (مثلاً از فاکتور
        // خرید) با temp ID منفی همین محصول ساخته شده بود، آن ارجاع را هم اصلاح کن
        // — وگرنه برای همیشه به یک productId موهوم اشاره می‌کند و sync آن fail می‌ماند.
        await resolveFinalProductTempProductId(prod.id, Number(serverProd.id));
        return { pushed: 1, failed: 0 };
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
        return { pushed: 1, failed: 0 };
      }
      return { pushed: 0, failed: 0 };
    } catch (e: any) {
      const msg = e?.response?.data?.message || e?.message || 'خطای سینک محصول';
      await markProductFailed(prod.id, msg);
      return { pushed: 0, failed: 1 };
    }
  });
  for (const r of prodResults) {
    productsPushed += r.pushed;
    productsFailed += r.failed;
  }

  // ─── PULL: دسته‌بندی‌ها و محصولات ────────────────────────────────────────
  const catMetaKey = `catalog:categories:lastUpdatedAt:${restaurantId}`;
  const prodMetaKey = `catalog:products:lastUpdatedAt:${restaurantId}`;
  const lastFullCatalogSyncKey = `catalog:lastFullSyncAt:${restaurantId}`;

  // Full sync when: forceFullSync flag set, first sync ever, or safety fallback every 4h.
  const MS_4H = 4 * 60 * 60 * 1000;
  const lastFullCatalogSync = await getCatalogSyncMeta(lastFullCatalogSyncKey);
  const needsFullCatalogSync =
    forceFullSync ||
    !lastFullCatalogSync ||
    Date.now() - new Date(lastFullCatalogSync).getTime() > MS_4H;

  let categoriesPulled = 0;
  let productsPulled = 0;

  try {
    const cachedCatUpdatedAt = await getCatalogSyncMeta(catMetaKey);
    const { lastUpdatedAt: serverCatUpdatedAt } = await getCategoriesLastUpdatedAt(restaurantId, token);
    const shouldPullCategories = needsFullCatalogSync || (serverCatUpdatedAt && serverCatUpdatedAt !== cachedCatUpdatedAt);

    if (shouldPullCategories) {
      const serverCategories = await getCategories(restaurantName, restaurantId, token);
      await bulkUpsertCategories(serverCategories, restaurantId);
      await reconcileCatalogCategories(restaurantId, serverCategories);
      categoriesPulled = serverCategories.length;
      if (serverCatUpdatedAt) await setCatalogSyncMeta(catMetaKey, serverCatUpdatedAt);
    }
  } catch {
    // pull خطا داد، سینک push را خراب نمی‌کند
  }

  // ─── PULL: محصولات ────────────────────────────────────────────────────────
  try {
    const cachedProdUpdatedAt = await getCatalogSyncMeta(prodMetaKey);
    const { lastUpdatedAt: serverProdUpdatedAt } = await getProductsLastUpdatedAt(restaurantId, token);
    const shouldPullProducts = needsFullCatalogSync || (serverProdUpdatedAt && serverProdUpdatedAt !== cachedProdUpdatedAt);

    if (shouldPullProducts) {
      const CHUNK = 100;
      const first = await getProductsAdmin({ restaurantId, restaurantName, page: 1, limit: CHUNK }, token);
      const totalPages = Math.ceil(first.total / CHUNK);
      const remainingPages = Array.from({ length: Math.max(0, totalPages - 1) }, (_, i) => i + 2);
      // قبلاً همهٔ صفحات با Promise.all بدون محدودیت هم‌زمان درخواست می‌شدند —
      // با کاتالوگ‌های بزرگ این یعنی ده‌ها درخواست هم‌زمان به سرور، که هم بار
      // غیرضروری ایجاد می‌کند هم ریسک پاسخ ناقص/تایم‌اوت زیر بار را بالا می‌برد.
      const remaining = await concurrentMap(
        remainingPages,
        5,
        (pg) => getProductsAdmin({ restaurantId, restaurantName, page: pg, limit: CHUNK }, token),
      );
      const allProducts = [first.data, ...remaining.map((r) => r.data)].flat();
      await bulkUpsertProducts(allProducts, restaurantId);
      await reconcileCatalogProducts(restaurantId, allProducts);
      productsPulled = allProducts.length;
      if (serverProdUpdatedAt) await setCatalogSyncMeta(prodMetaKey, serverProdUpdatedAt);
    }
  } catch {
    // pull خطا داد
  }

  if (needsFullCatalogSync) {
    await setCatalogSyncMeta(lastFullCatalogSyncKey, new Date().toISOString());
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
