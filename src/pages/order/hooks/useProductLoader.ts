import { useState, useEffect, useRef } from 'react';
import { useAuthStore } from '../../../store/authStore';
import {
  getCategories,
  getRestaurantByName,
  getRestaurantById,
  getProductsLastUpdatedAt,
  getProductsPublicPaginated,
} from '../../../services/api';
import { getCachedMenu, cacheMenu } from '../../../services/cache';
import {
  getLocalProducts,
  getLocalCategories,
  bulkUpsertProducts,
  reconcileCatalogProducts,
  setCatalogSyncMeta,
} from '../../../services/catalogLocalDb';

export function useProductLoader() {
  const { user, token } = useAuthStore();
  const [products, setProducts] = useState<any[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [productCategories, setProductCategories] = useState<any[]>([]);
  const [cartItemOptions, setCartItemOptions] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  // true در طول کل loadProducts (از شروع fetch سرور تا finally) — از race condition
  // جلوگیری می‌کند که catalog:synced بتواند state را قبل از پاسخ سرور overwrite کند.
  const isFetchingRef = useRef(false);
  // لاگ تشخیصی: هر writer لیست محصولات باید خودش را اینجا اعلام کند تا مشخص شود
  // کدام مسیر لیست را خالی می‌کند (server refetch یا catalog:synced یا cache paint).
  const log = (msg: string, ...args: unknown[]) => console.warn(`[order:products] ${msg}`, ...args);
  // آینهٔ همزمانِ state محصولات — برای تصمیم‌هایی که نمی‌توانند منتظر re-render بمانند
  // (مثل «آیا الان محصولی روی صفحه هست؟» قبل از بازنویسی کش/Dexie).
  const productsRef = useRef<any[]>([]);
  useEffect(() => { productsRef.current = products; }, [products]);

  // Restaurant settings
  const [isMobileRequired, setIsMobileRequired] = useState(true);
  const [isScaleIntegrationEnabled, setIsScaleIntegrationEnabled] = useState(false);
  const [restrictScaleAccess, setRestrictScaleAccess] = useState(true);
  const [isCardTerminalEnabled, setIsCardTerminalEnabled] = useState(false);
  const [restrictCardTerminalAccess, setRestrictCardTerminalAccess] = useState(true);
  const [allowDirectSendAmountToCardTerminal, setAllowDirectSendAmountToCardTerminal] = useState(false);

  // The fresh server fetch in loadProducts() (step 6) and the Dexie catalog-sync
  // handler below both replace the whole `products` array on a timer/network delay
  // after the cache-first paint already showed photos. If a refetched product comes
  // back without multiMedia (stale relation, slow join, etc.), don't let that regress
  // a photo that was already visible — keep the last known-good one for this session.
  const setProductsKeepingMedia = (fresh: any[], source: string) => {
    setProducts((prev) => {
      // گارد پاسخ خالی: هیچ writer ای اجازه ندارد لیستِ در حال نمایش را با آرایهٔ خالی
      // جایگزین کند — پاسخ خالی وقتی محصول روی صفحه داریم تقریباً همیشه یعنی پاسخ
      // ناقص/اشتباه سرور یا Dexie، نه حذف واقعی همهٔ محصولات.
      if (fresh.length === 0 && prev.length > 0) {
        log(`${source}: incoming list is EMPTY while ${prev.length} products are on screen — KEEPING current list`);
        return prev;
      }
      log(`${source}: replacing product list ${prev.length} → ${fresh.length}`);
      const mediaMap = new Map(prev.map((pp) => [pp.id, pp.multiMedia]));
      return fresh.map((p) => (p.multiMedia?.url ? p : { ...p, multiMedia: mediaMap.get(p.id) ?? p.multiMedia }));
    });
  };

  const applyRestaurantSettings = (settings: {
    cartItemOptions?: string[];
    isMobileRequired?: boolean;
    isScaleIntegrationEnabled?: boolean;
    restrictScaleAccess?: boolean;
    isCardTerminalEnabled?: boolean;
    restrictCardTerminalAccess?: boolean;
    allowDirectSendAmountToCardTerminal?: boolean;
  }) => {
    if (settings.cartItemOptions !== undefined) setCartItemOptions(settings.cartItemOptions);
    if (settings.isMobileRequired !== undefined) setIsMobileRequired(settings.isMobileRequired);
    if (settings.isScaleIntegrationEnabled !== undefined) setIsScaleIntegrationEnabled(settings.isScaleIntegrationEnabled);
    if (settings.restrictScaleAccess !== undefined) setRestrictScaleAccess(settings.restrictScaleAccess);
    if (settings.isCardTerminalEnabled !== undefined) setIsCardTerminalEnabled(settings.isCardTerminalEnabled);
    if (settings.restrictCardTerminalAccess !== undefined) setRestrictCardTerminalAccess(settings.restrictCardTerminalAccess);
    if (settings.allowDirectSendAmountToCardTerminal !== undefined) setAllowDirectSendAmountToCardTerminal(settings.allowDirectSendAmountToCardTerminal);
  };

  const loadProducts = async () => {
    isFetchingRef.current = true;
    setIsLoading(true);
    setError('');
    const restaurantName = user?.restaurants?.[0]?.name;
    const restaurantId = user?.restaurants?.[0]?.id;
    let productsData: any[] = [];

    try {
      // 1. Cache first — show immediately so the screen is not blank while the server fetch runs.
      const cached = await getCachedMenu(restaurantId, restaurantName);
      if (cached) {
        productsData = cached.products;
        log(`cache paint: ${productsData.length} products (restaurant ${restaurantId})`);
        setProducts(productsData);
        setCategories(cached.categories);
        setProductCategories(Array.isArray(cached.productCategories) ? cached.productCategories : []);
        applyRestaurantSettings({
          cartItemOptions: Array.isArray(cached.cartItemOptions) ? cached.cartItemOptions : [],
          isMobileRequired: cached.isMobileRequiredInElectronPanel ?? true,
          isScaleIntegrationEnabled: Boolean(cached.isScaleIntegrationEnabled),
          restrictScaleAccess: cached.restrictScaleAccessToElectronManagers !== false,
          isCardTerminalEnabled: Boolean(cached.isCardTerminalEnabled),
          restrictCardTerminalAccess: cached.restrictCardTerminalAccessToElectronManagers !== false,
          allowDirectSendAmountToCardTerminal: Boolean(cached.allowDirectSendAmountToCardTerminal),
        });
        setIsLoading(false);
      }

      // 2. Dexie fallback if no cache
      let hasDexieFallback = false;
      if (!cached && restaurantId) {
        try {
          const [{ data: localProds }, localCats] = await Promise.all([
            getLocalProducts(restaurantId),
            getLocalCategories(restaurantId),
          ]);
          const syncedProds = localProds.filter((p) => p._syncStatus === 'synced');
          const syncedCats = localCats.filter((c) => c._syncStatus === 'synced');
          if (syncedProds.length > 0) {
            const catMap = new Map(syncedCats.map((c) => [c.id, c]));
            const enriched = syncedProds.map((p) => ({
              ...p,
              category: catMap.get(p.category_id) || { id: p.category_id, name_fa: '' },
            }));
            productsData = enriched;
            log(`dexie fallback paint: ${enriched.length} products (no cache)`);
            setProducts(enriched);
            setProductCategories(syncedCats);
            setCategories(Array.from(new Set(syncedCats.map((c) => c.name_fa).filter(Boolean))));
            setIsLoading(false);
            hasDexieFallback = true;
          }
        } catch {}
      }

      // 3. Check online
      const isOnline = window.electronAPI
        ? await window.electronAPI.checkOnline()
        : navigator.onLine;

      if (!token || !isOnline) {
        if (!cached && !hasDexieFallback) setError('اتصال به سرور برقرار نیست و منو در حافظه ذخیره نشده است.');
        return;
      }

      // 4. Always fetch fresh products from server.
      //    The lastUpdatedAt check is kept only to decide whether to rewrite the cache.
      let serverLastUpdatedAt: string | null = null;
      let productMetadataChanged = true;
      if (restaurantId) {
        try {
          const { lastUpdatedAt } = await getProductsLastUpdatedAt(Number(restaurantId), token);
          serverLastUpdatedAt = lastUpdatedAt;
          if (lastUpdatedAt && lastUpdatedAt === cached?.lastUpdatedAt) productMetadataChanged = false;
        } catch {}
      }

      // 5. Parallel fetch categories + restaurant
      const categoriesPromise = getCategories(restaurantName, restaurantId, token).catch(() => null);
      const restaurantPromise = (restaurantId
        ? getRestaurantById(Number(restaurantId), token)
        : getRestaurantByName(restaurantName || '', token)
      ).catch(() => null);

      // 6. Paginated product fetch — collect ALL pages then setProducts once atomically.
      let emptyServerResponse = false;
      {
        const CHUNK = 100;
        const firstChunk = await getProductsPublicPaginated(
          { restaurantId, restaurantName, page: 1, limit: CHUNK }, token,
        );
        productsData = firstChunk.data;
        log(`server refetch: page 1 → ${firstChunk.data.length} products, total=${firstChunk.total}`);

        // No cached data yet — show the first page immediately so the screen isn't
        // blank while the remaining pages load.
        if (!cached && !hasDexieFallback) {
          setProducts([...productsData]);
          setIsLoading(false);
        }

        const totalPages = Math.ceil(firstChunk.total / CHUNK);
        for (let pg = 2; pg <= totalPages; pg++) {
          const chunk = await getProductsPublicPaginated(
            { restaurantId, restaurantName, page: pg, limit: CHUNK }, token,
          );
          productsData = [...productsData, ...chunk.data];
        }

        // پاسخ خالی وقتی لیست پر روی صفحه داریم = پاسخ مشکوک؛ نه state را
        // بازنویسی می‌کنیم، نه کش localStorage را، نه Dexie را — وگرنه یک پاسخ بد
        // یک‌بارمصرف تا راه‌اندازی بعدی هم صفحه را خالی نگه می‌دارد.
        emptyServerResponse = productsData.length === 0 && productsRef.current.length > 0;

        setProductsKeepingMedia([...productsData], 'server refetch (loadProducts)');
        setIsLoading(false);
      }

      // 7. Apply results
      const [categoriesResult, restaurantResult] = await Promise.all([categoriesPromise, restaurantPromise]);
      if (categoriesResult) setProductCategories(Array.isArray(categoriesResult) ? categoriesResult : []);

      let settings = {
        cartItemOptions: cached?.cartItemOptions ?? [],
        isMobileRequired: cached?.isMobileRequiredInElectronPanel ?? true,
        isScaleIntegrationEnabled: Boolean(cached?.isScaleIntegrationEnabled),
        restrictScaleAccess: cached?.restrictScaleAccessToElectronManagers !== false,
        isCardTerminalEnabled: Boolean(cached?.isCardTerminalEnabled),
        restrictCardTerminalAccess: cached?.restrictCardTerminalAccessToElectronManagers !== false,
        allowDirectSendAmountToCardTerminal: Boolean(cached?.allowDirectSendAmountToCardTerminal),
      };

      if (restaurantResult) {
        const raw = restaurantResult.cartItemOptions;
        const ps = restaurantResult.panelSettings;
        settings = {
          cartItemOptions: Array.isArray(raw) ? raw.filter((s: any) => s != null && String(s).trim()) : [],
          isMobileRequired: ps?.isMobileRequiredInElectronPanel ?? true,
          isScaleIntegrationEnabled: Boolean(ps?.isScaleIntegrationEnabled),
          restrictScaleAccess: ps?.restrictScaleAccessToElectronManagers !== false,
          isCardTerminalEnabled: Boolean(ps?.isCardTerminalEnabled),
          restrictCardTerminalAccess: ps?.restrictCardTerminalAccessToElectronManagers !== false,
          allowDirectSendAmountToCardTerminal: Boolean(ps?.allowDirectSendAmountToCardTerminal),
        };
      }
      applyRestaurantSettings(settings);

      // 8. Write fresh products to cache. Categories only recomputed when metadata changed.
      if (emptyServerResponse) {
        log('server refetch empty — SKIPPING menu-cache rewrite');
      } else {
        const uniqueCategories = productMetadataChanged
          ? Array.from(new Set(productsData.map((p) => p.category?.name_fa).filter(Boolean)))
          : (Array.isArray(cached?.categories) ? cached.categories : []) as string[];

        if (productMetadataChanged) setCategories(uniqueCategories);

        await cacheMenu(
          restaurantId || 0, restaurantName || '', productsData,
          uniqueCategories, settings.cartItemOptions,
          settings.isMobileRequired, settings.isScaleIntegrationEnabled,
          settings.restrictScaleAccess, settings.isCardTerminalEnabled,
          settings.restrictCardTerminalAccess, settings.allowDirectSendAmountToCardTerminal,
          serverLastUpdatedAt,
          productMetadataChanged
            ? (Array.isArray(categoriesResult) ? categoriesResult : [])
            : (Array.isArray(cached?.productCategories) ? cached.productCategories : []),
        );
      }

      // 9. Write fresh products to Dexie so CatalogSyncManager sees lastUpdatedAt
      //    matches and skips the admin-endpoint PULL — cuts 2 redundant requests per
      //    page of products on every order-page load.
      if (restaurantId && emptyServerResponse) {
        log('server refetch empty — SKIPPING Dexie write/reconcile');
      } else if (restaurantId) {
        try {
          await bulkUpsertProducts(productsData, restaurantId);
          await reconcileCatalogProducts(restaurantId, productsData);
          if (serverLastUpdatedAt) {
            const prodMetaKey = `catalog:products:lastUpdatedAt:${restaurantId}`;
            const lastFullKey = `catalog:lastFullSyncAt:${restaurantId}`;
            await setCatalogSyncMeta(prodMetaKey, serverLastUpdatedAt);
            await setCatalogSyncMeta(lastFullKey, new Date().toISOString());
          }
        } catch {}
      }
    } catch (err: any) {
      if (productsData.length === 0) setError(err.message || 'خطا در بارگذاری منو');
    } finally {
      isFetchingRef.current = false;
      setIsLoading(false);
    }
  };

  // NOTE: this used to also fire window.electronAPI.cacheImages(urls) here to
  // pre-download product photos to disk via the Electron main process. That result
  // was never read back anywhere for display (getCachedImage/getImageUrl are unused
  // in this page), so it was pure overhead — a burst of duplicate main-process HTTP
  // downloads to the same asset host the grid's own <img> tags are loading from,
  // firing every time `products` changes (at least twice per page load). Removed:
  // it was competing with the visible images for connections to the same host and
  // is the likely cause of intermittent real image-load failures in the grid.

  // Reload on catalog sync
  useEffect(() => {
    const restaurantId = user?.restaurants?.[0]?.id;
    if (!restaurantId) return;
    const handleCatalogSynced = async () => {
      if (isFetchingRef.current) {
        log('catalog:synced ignored — loadProducts fetch in flight');
        return;
      }
      try {
        const [{ data: localProds }, localCats] = await Promise.all([
          getLocalProducts(restaurantId),
          getLocalCategories(restaurantId),
        ]);
        const syncedProds = localProds.filter((p) => p._syncStatus === 'synced');
        const syncedCats = localCats.filter((c) => c._syncStatus === 'synced');
        log(`catalog:synced fired — Dexie: ${localProds.length} products (${syncedProds.length} synced), ${localCats.length} categories (${syncedCats.length} synced)`);
        if (syncedProds.length === 0) {
          log('catalog:synced: no synced Dexie products — keeping current list');
          return;
        }
        const catMap = new Map(syncedCats.map((c) => [c.id, c]));
        // Dexie's LocalProduct has no multiMedia field — setProductsKeepingMedia carries
        // over the image from the previously loaded (server/cache) product so a catalog
        // sync doesn't wipe photos.
        setProductsKeepingMedia(syncedProds.map((p) => ({
          ...p,
          category: catMap.get(p.category_id) || { id: p.category_id, name_fa: '' },
        })), 'catalog:synced');
        setProductCategories(syncedCats);
        setCategories(Array.from(new Set(syncedCats.map((c) => c.name_fa).filter(Boolean))));
      } catch (e) {
        log('catalog:synced handler error:', e);
      }
    };
    window.addEventListener('catalog:synced', handleCatalogSynced);
    return () => window.removeEventListener('catalog:synced', handleCatalogSynced);
  }, [user]);

  return {
    products, setProducts,
    categories,
    productCategories,
    cartItemOptions,
    isLoading, error,
    isMobileRequired,
    isScaleIntegrationEnabled, restrictScaleAccess,
    isCardTerminalEnabled, restrictCardTerminalAccess,
    allowDirectSendAmountToCardTerminal,
    loadProducts,
  };
}
