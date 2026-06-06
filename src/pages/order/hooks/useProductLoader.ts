import { useState, useEffect } from 'react';
import { useAuthStore } from '../../../store/authStore';
import {
  getCategories,
  getRestaurantByName,
  getRestaurantById,
  getAssetBaseUrl,
  getProductsLastUpdatedAt,
  getProductsPublicPaginated,
} from '../../../services/api';
import { getCachedMenu, cacheMenu } from '../../../services/cache';
import { getLocalProducts, getLocalCategories } from '../../../services/catalogLocalDb';

export function useProductLoader() {
  const { user, token } = useAuthStore();
  const [products, setProducts] = useState<any[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [productCategories, setProductCategories] = useState<any[]>([]);
  const [cartItemOptions, setCartItemOptions] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  // Restaurant settings
  const [isMobileRequired, setIsMobileRequired] = useState(true);
  const [isScaleIntegrationEnabled, setIsScaleIntegrationEnabled] = useState(false);
  const [restrictScaleAccess, setRestrictScaleAccess] = useState(true);
  const [isCardTerminalEnabled, setIsCardTerminalEnabled] = useState(false);
  const [restrictCardTerminalAccess, setRestrictCardTerminalAccess] = useState(true);
  const [allowDirectSendAmountToCardTerminal, setAllowDirectSendAmountToCardTerminal] = useState(false);

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
    setIsLoading(true);
    setError('');
    const restaurantName = user?.restaurants?.[0]?.name;
    const restaurantId = user?.restaurants?.[0]?.id;
    let productsData: any[] = [];

    try {
      // 1. Cache first
      const cached = await getCachedMenu(restaurantId, restaurantName);
      if (cached) {
        productsData = cached.products;
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

      // 4. Check if products changed
      let serverLastUpdatedAt: string | null = null;
      let shouldFetchProducts = true;
      if (restaurantId) {
        try {
          const { lastUpdatedAt } = await getProductsLastUpdatedAt(Number(restaurantId), token);
          serverLastUpdatedAt = lastUpdatedAt;
          if (lastUpdatedAt && lastUpdatedAt === cached?.lastUpdatedAt) shouldFetchProducts = false;
        } catch {}
      }

      // 5. Parallel fetch categories + restaurant
      const categoriesPromise = getCategories(restaurantName, restaurantId, token).catch(() => null);
      const restaurantPromise = (restaurantId
        ? getRestaurantById(Number(restaurantId), token)
        : getRestaurantByName(restaurantName || '', token)
      ).catch(() => null);

      // 6. Paginated product fetch
      if (shouldFetchProducts) {
        const CHUNK = 100;
        const firstChunk = await getProductsPublicPaginated(
          { restaurantId, restaurantName, page: 1, limit: CHUNK }, token,
        );
        productsData = firstChunk.data;
        setProducts([...productsData]);
        setIsLoading(false);
        const totalPages = Math.ceil(firstChunk.total / CHUNK);
        for (let pg = 2; pg <= totalPages; pg++) {
          const chunk = await getProductsPublicPaginated(
            { restaurantId, restaurantName, page: pg, limit: CHUNK }, token,
          );
          productsData = [...productsData, ...chunk.data];
          setProducts([...productsData]);
        }
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

      // 8. Update cache
      if (shouldFetchProducts) {
        const uniqueCategories = Array.from(new Set(productsData.map((p) => p.category?.name_fa).filter(Boolean)));
        setCategories(uniqueCategories as string[]);
        await cacheMenu(
          restaurantId || 0, restaurantName || '', productsData,
          uniqueCategories as string[], settings.cartItemOptions,
          settings.isMobileRequired, settings.isScaleIntegrationEnabled,
          settings.restrictScaleAccess, settings.isCardTerminalEnabled,
          settings.restrictCardTerminalAccess, settings.allowDirectSendAmountToCardTerminal,
          serverLastUpdatedAt, Array.isArray(categoriesResult) ? categoriesResult : [],
        );
      }
    } catch (err: any) {
      if (productsData.length === 0) setError(err.message || 'خطا در بارگذاری منو');
    } finally {
      setIsLoading(false);
    }
  };

  // Cache product images
  useEffect(() => {
    if (products.length === 0 || !window.electronAPI?.cacheImages) return;
    const cacheImages = async () => {
      const isOnline = window.electronAPI
        ? await window.electronAPI.checkOnline()
        : navigator.onLine;
      const assetBase = getAssetBaseUrl();
      if (isOnline) {
        const urls = products.map((p) => p.multiMedia?.url).filter(Boolean).map((u) => `${assetBase}${u}`);
        if (urls.length > 0) {
          try { await window.electronAPI!.cacheImages(urls); } catch {}
        }
      }
    };
    void cacheImages();
  }, [products]);

  // Reload on catalog sync
  useEffect(() => {
    const restaurantId = user?.restaurants?.[0]?.id;
    if (!restaurantId) return;
    const handleCatalogSynced = async () => {
      try {
        const [{ data: localProds }, localCats] = await Promise.all([
          getLocalProducts(restaurantId),
          getLocalCategories(restaurantId),
        ]);
        const syncedProds = localProds.filter((p) => p._syncStatus === 'synced');
        const syncedCats = localCats.filter((c) => c._syncStatus === 'synced');
        if (syncedProds.length === 0) return;
        const catMap = new Map(syncedCats.map((c) => [c.id, c]));
        setProducts(syncedProds.map((p) => ({ ...p, category: catMap.get(p.category_id) || { id: p.category_id, name_fa: '' } })));
        setProductCategories(syncedCats);
        setCategories(Array.from(new Set(syncedCats.map((c) => c.name_fa).filter(Boolean))));
      } catch {}
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
