import axios from 'axios';
import { toast } from '../utils/toast';

// مقدار پیش‌فرض از env ویترین (فقط در زمان build درج می‌شود)
const getDefaultBaseUrl = () => {
  const baseUrl = import.meta.env.VITE_API_BASE_URL ||
    import.meta.env.NEXT_PUBLIC_API_BASE_URL ||
    'https://api.secoin.ir';
  const version = import.meta.env.VITE_API_BASE_VERSION ||
    import.meta.env.NEXT_PUBLIC_API_BASE_VERSION ||
    '/api/v1';
  const cleanBaseUrl = String(baseUrl).replace(/\/+$/, '');
  const cleanVersion = String(version).startsWith('/') ? version : `/${version}`;
  return `${cleanBaseUrl}${cleanVersion}`;
};

export const API_BASE_URL = getDefaultBaseUrl();

// آدرس پنل مدیریت وب (Menus_FE) — برای دکمه «پنل وب» در دسکتاپ
export const WEB_PANEL_URL = (
  import.meta.env.VITE_WEB_PANEL_URL ||
  import.meta.env.NEXT_PUBLIC_WEB_PANEL_URL ||
  'https://secoin.ir/admin/dashboard'
).replace(/\/+$/, '');

const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
  },
});

/** برای به‌روزرسانی baseURL از پنل الکترون (خوانده‌شده از .env یا api-config.json) */
export function setApiBaseUrl(baseURL: string) {
  api.defaults.baseURL = baseURL.replace(/\/+$/, '');
}

// ─── Live token (module-scoped, never exposed to window) ─────────────────────
let _liveToken: string | null = null;

export function setLiveToken(token: string | null) {
  _liveToken = token;
}

export function getLiveToken(): string | null {
  return _liveToken;
}

/** آدرس پایهٔ API (مثلاً برای درخواست‌ها) */
export function getApiBaseUrl(): string {
  return api.defaults.baseURL || API_BASE_URL;
}

/** آدرس پایهٔ سرور بدون مسیر /api/v1 (برای لینک عکس‌ها و آپلودها) */
export function getAssetBaseUrl(): string {
  const base = getApiBaseUrl();
  const withoutPath = base.replace(/\/api\/v\d+(\/)?$/i, '').replace(/\/+$/, '');
  return withoutPath || 'https://api.secoin.ir';
}

/**
 * در الکترون از main process خوانده می‌شود (از .env یا api-config.json).
 * اولین درخواست این پرامیس را await می‌کند.
 */
export const apiConfigReady: Promise<void> =
  typeof window !== 'undefined' && (window as any).electronAPI?.getApiConfig
    ? (window as any).electronAPI
        .getApiConfig()
        .then((c: { baseURL?: string }) => {
          if (c?.baseURL) setApiBaseUrl(c.baseURL);
        })
        .catch(() => {})
    : Promise.resolve();

// نسخه‌ی نصب‌شده‌ی برنامه — به هر درخواست به‌صورت هدر ضمیمه می‌شود تا سرور
// بتواند کلاینت‌های قدیمی را تشخیص دهد (پاسخ 426).
let cachedClientVersion =
  (typeof window !== 'undefined' && (window as any).electronAPI?.appVersion) || '';
export const appVersionReady: Promise<void> =
  typeof window !== 'undefined' && (window as any).electronAPI?.getAppVersion
    ? (window as any).electronAPI
        .getAppVersion()
        .then((v: string) => {
          if (v) cachedClientVersion = String(v);
        })
        .catch(() => {})
    : Promise.resolve();

export function getCachedClientVersion(): string {
  return cachedClientVersion;
}

// Add request interceptor for debugging
api.interceptors.request.use(
  (config) => {
    // شناسه و نسخه‌ی کلاینت دسکتاپ برای گیت نسخه در سرور
    const clientHeaders: any = config.headers || {};
    clientHeaders['x-client'] = 'electron';
    if (cachedClientVersion) {
      clientHeaders['x-client-version'] = cachedClientVersion;
    }
    config.headers = clientHeaders;

    const requestUrl = String(config.url || '');
    const isAuthRequest = requestUrl.includes('/auth/');
    if (!isAuthRequest && _liveToken) {
      const headers: any = config.headers || {};
      headers.Authorization = `Bearer ${_liveToken}`;
      config.headers = headers;
    }
    // console.log('API Request:', {
    //   method: config.method,
    //   url: config.url,
    //   baseURL: config.baseURL,
    //   fullURL: `${config.baseURL}${config.url}`,
    // });
    return config;
  },
  (error) => {
    console.error('Request error:', error);
    return Promise.reject(error);
  }
);

const AUTH_WHITELIST_ENDPOINTS = [
  '/auth/login',
  '/auth/login-with-mobile',
  '/auth/verify-login',
  '/auth/check-user',
  '/auth/register-with-otp',
  '/auth/register',
  '/auth/forgot-password',
  '/auth/reset-password',
];

function normalizeRequestPath(requestUrl: string | undefined): string {
  if (!requestUrl) return '';
  if (requestUrl.startsWith('http')) {
    try {
      return new URL(requestUrl).pathname;
    } catch {
      return requestUrl;
    }
  }
  return requestUrl;
}

let isHandlingUnauthorized = false;

function dispatchUnauthorized(): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new Event('menus-electron:unauthorized'));
}

/** نسخه‌ی کلاینت قدیمی است و سرور درخواست را رد کرده (426). */
function dispatchOutdated(minVersion?: string): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(
    new CustomEvent('menus-electron:outdated', { detail: { minVersion } }),
  );
}

function extractApiErrorMessage(error: unknown): string | null {
  const err = error as { response?: { data?: unknown } };
  const data = err?.response?.data as Record<string, unknown> | undefined;
  if (!data || typeof data !== 'object') return null;
  const m = data.message;
  if (Array.isArray(m)) {
    const parts = m.map((x) => (typeof x === 'string' ? x : String(x ?? ''))).filter(Boolean);
    return parts.length ? parts.join(' — ') : null;
  }
  if (typeof m === 'string' && m.trim()) return m.trim();
  const e = data.error;
  if (typeof e === 'string' && e.trim()) return e.trim();
  return null;
}

const DEDUP_MS = 1200;
const dedup = { key: '', at: 0 };

function showApiErrorToast(error: unknown, normalizedPath: string): void {
  const err = error as { config?: { skipGlobalErrorToast?: boolean }; response?: { status?: number }; request?: unknown };
  if (err?.config?.skipGlobalErrorToast === true) return;

  const status = err?.response?.status;
  const hasResponse = !!err?.response;
  const isNetworkError = !hasResponse && !!err?.request;

  if (status === 401) return;

  let title: string;
  let description: string | undefined;
  let dedupKey: string;

  if (status === 403) {
    title = 'دسترسی غیرمجاز';
    description = extractApiErrorMessage(error) || 'دسترسی به این بخش یا عملیات مجاز نیست.';
    dedupKey = `403:${normalizedPath}:${description}`;
  } else if (isNetworkError) {
    title = 'خطای اتصال';
    description = 'امکان برقراری ارتباط با سرور نیست. اتصال اینترنت یا وضعیت سرویس را بررسی کنید.';
    dedupKey = `net:${normalizedPath}`;
  } else if (typeof status === 'number' && status >= 500) {
    title = 'خطای سرور';
    description = extractApiErrorMessage(error) || 'لطفاً بعداً دوباره تلاش کنید.';
    dedupKey = `5xx:${normalizedPath}:${status}:${description}`;
  } else if (status === 404) {
    title = 'یافت نشد';
    description = extractApiErrorMessage(error) || undefined;
    dedupKey = `404:${normalizedPath}:${description ?? ''}`;
  } else if (typeof status === 'number' && status >= 400 && status < 500) {
    const extracted = extractApiErrorMessage(error);
    if (!extracted) return;
    title = extracted;
    dedupKey = `4xx:${status}:${normalizedPath}:${title}`;
  } else {
    return;
  }

  const now = Date.now();
  if (dedupKey === dedup.key && now - dedup.at < DEDUP_MS) return;
  dedup.key = dedupKey;
  dedup.at = now;

  try {
    toast.error(title, description ? { description } : undefined);
  } catch { /* noop */ }
}

api.interceptors.response.use(
  (response) => response,
  (error) => {
    console.error('Response error:', {
      status: error.response?.status,
      data: error.response?.data,
      url: error.config?.url,
    });
    const status = error?.response?.status;
    const normalizedPath = normalizeRequestPath(error?.config?.url || '');
    const skipGlobal401 =
      Boolean(error?.config?.skipGlobal401Handler) ||
      AUTH_WHITELIST_ENDPOINTS.some((endpoint) => normalizedPath.includes(endpoint));

    if (status === 401 && !skipGlobal401 && !isHandlingUnauthorized) {
      isHandlingUnauthorized = true;
      try {
        toast.error('انقضای نشست', { description: 'لطفاً دوباره وارد شوید.' });
        dispatchUnauthorized();
      } finally {
        setTimeout(() => { isHandlingUnauthorized = false; }, 1500);
      }
    }

    // نسخه‌ی نرم‌افزار قدیمی است — سرور درخواست را رد کرده است
    if (status === 426) {
      const data = error?.response?.data as { message?: string; minVersion?: string } | undefined;
      toast.error('نیاز به به‌روزرسانی', {
        description: data?.message || 'نسخه نرم‌افزار شما قدیمی است. لطفاً برنامه را به‌روزرسانی کنید.',
      });
      dispatchOutdated(data?.minVersion);
      return Promise.reject(error);
    }

    showApiErrorToast(error, normalizedPath);
    return Promise.reject(error);
  }
);

/** حداقل نسخه‌ی مجاز کلاینت دسکتاپ از سرور (برای گیت ورود). */
export async function getClientRequirements(): Promise<{ minElectronVersion: string }> {
  await apiConfigReady;
  const response = await api.get('/app/client-requirements', {
    skipGlobalErrorToast: true,
  } as any);
  return response.data;
}

export async function login(mobile: string, password: string) {
  await apiConfigReady;
  const response = await api.post('/auth/login', { mobile, password });
  return response.data;
}

export async function checkUser(mobile: string) {
  await apiConfigReady;
  const response = await api.post('/auth/check-user', { mobile });
  return response.data;
}

export async function getRestaurantByName(restaurantName: string, token?: string) {
  await apiConfigReady;
  const headers: Record<string, string> = {};
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  const response = await api.get(`/restaurant/name/${encodeURIComponent(restaurantName)}`, { headers });
  return response.data;
}

export async function getRestaurantById(restaurantId: number, token?: string) {
  await apiConfigReady;
  const headers: Record<string, string> = {};
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  const response = await api.get(`/restaurant/${restaurantId}`, { headers });
  return response.data;
}

export async function getProducts(restaurantName?: string, restaurantId?: number, token?: string) {
  await apiConfigReady;
  const headers: any = {};
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  if (restaurantName) {
    headers['x-restaurant-name'] = restaurantName;
  }
  if (restaurantId) {
    headers['x-selected-restaurant-id'] = String(restaurantId);
  }

  const body: any = {};
  if (restaurantName) {
    body.restaurantName = restaurantName;
  }
  if (restaurantId) {
    body.restaurantId = restaurantId;
  }
  const response = await api.post('/products/filter/public', body, { headers });
  return Array.isArray(response.data) ? response.data : [];
}

export async function getCategories(restaurantName?: string, restaurantId?: number, token?: string) {
  await apiConfigReady;
  const headers: Record<string, string> = {};
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  const body: any = {};
  if (restaurantName) body.restaurantName = restaurantName;
  if (restaurantId) body.restaurantId = restaurantId;
  const response = await api.post('/categories/findAll', body, { headers });
  return Array.isArray(response.data) ? response.data : [];
}

export async function createCategory(
  body: {
    name_fa: string;
    name?: string;
    description?: string;
    hasVat?: boolean;
    restaurantId?: number;
  },
  token: string,
) {
  await apiConfigReady;
  const response = await api.post('/categories', body, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return response.data;
}

export async function updateCategoryById(
  categoryId: number,
  body: Partial<{
    name_fa: string;
    name?: string;
    description?: string;
    hasVat?: boolean;
  }>,
  token: string,
) {
  await apiConfigReady;
  const response = await api.patch(`/categories/${categoryId}`, body, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return response.data;
}

export async function createProduct(
  body: {
    name_fa: string;
    name?: string;
    price: number;
    category_id: number;
    barcode?: string;
    isAvailable?: boolean;
    restaurantId?: number;
    unit?: string;
  },
  token: string,
) {
  await apiConfigReady;
  const response = await api.post('/products', body, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return response.data;
}

export async function updateProductById(
  productId: number,
  body: Partial<{
    name_fa: string;
    name?: string;
    price: number;
    category_id: number;
    barcode?: string;
    isAvailable?: boolean;
    unit?: string;
  }>,
  token: string,
) {
  await apiConfigReady;
  const response = await api.patch(`/products/${productId}`, body, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return response.data;
}

export async function createOrder(orderData: any, token: string) {
  await apiConfigReady;
  const response = await api.post('/orders', orderData, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
  return response.data;
}

export interface DiscountCodeSummary {
  id: number;
  code: string;
  type: 'percentage' | 'fixed';
  value: number;
  description?: string | null;
  expiresAt?: string | null;
  minimumOrderAmount?: number | null;
  firstPurchaseOnly?: boolean;
}

/** کدهای تخفیف قابل استفاده برای مشتری (عمومی + اختصاصی) */
export async function getApplicableDiscountCodes(
  params: { restaurantName: string; phone?: string },
  token?: string,
): Promise<DiscountCodeSummary[]> {
  await apiConfigReady;
  const headers: Record<string, string> = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  try {
    const response = await api.get('/discount-codes/applicable-for-customer', {
      params: { restaurantName: params.restaurantName, phone: params.phone },
      headers,
      skipGlobalErrorToast: true,
    } as any);
    return Array.isArray(response.data) ? response.data : [];
  } catch {
    return [];
  }
}

/**
 * موجودی کیف پول کش‌بک مشتری در همین رستوران — برای جست‌وجوی صندوق‌دار
 * هنگام ورود شماره مشتری. کیف پول رستوران دیگر هرگز برنمی‌گردد.
 */
export async function getCashbackWallet(
  params: { restaurantId: number; phone: string },
  token?: string,
): Promise<{ balance: number }> {
  await apiConfigReady;
  const headers: Record<string, string> = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  try {
    const response = await api.get(`/customer-club/cashback/${params.restaurantId}`, {
      params: { phone: params.phone },
      headers,
      skipGlobalErrorToast: true,
    } as any);
    return { balance: Math.max(0, Number(response.data?.balance) || 0) };
  } catch {
    return { balance: 0 };
  }
}

/** اعتبارسنجی کد تخفیف و دریافت مبلغ تخفیف */
export async function validateDiscountCode(
  params: { code: string; restaurantName: string; totalAmount: number; userPhone?: string },
  token?: string,
) {
  await apiConfigReady;
  const headers: Record<string, string> = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  const response = await api.post('/discount-codes/validate', params, { headers });
  return response.data as { valid: boolean; discountAmount?: number; message?: string };
}

// ─── گردونه شانس — ووچرهای جایزه ────────────────────────────────────────────
//
// گردونهٔ شانس در بک‌اند به ماژول یکپارچهٔ گیمیفیکیشن ادغام شده
// (`/gamification/...` به‌جای `/lucky-wheel/...`) و اسمش الان «بازی‌ها»ست —
// نه فقط گردونه (کارت خراشی، کارت مهر و... هم همین مسیر را استفاده می‌کنند.
// نام‌ها و شکل تایپ‌ها عمداً همین‌جا (سازگاری با سرور) نگه داشته شده‌اند تا
// OrderModal.tsx و بقیهٔ کد صندوق نیازی به تغییر نداشته باشند؛ سرور پاسخ را
// به همین شکل قدیمی ترجمه می‌کند (نگاه کنید toLegacyVoucherShape در
// Menus_BE/src/gamification/game-play.service.ts).

export interface WheelPrizeVoucher {
  id: number;
  restaurant_id: number;
  wheel_id: number;
  spin_id: number;
  phone: string;
  prizeType: 'discount_percent' | 'discount_amount' | 'points' | 'free_product' | 'custom';
  prizeData: Record<string, any> | null;
  expiresAt: string | null;
  isRedeemed: boolean;
  redeemedAt: string | null;
  redeemedOrderId: number | null;
  createdAt: string;
}

/**
 * بررسی ووچرهای فعال گردونه شانس برای یک شماره موبایل
 * در پنل الکترون، هنگام ورود شماره مشتری فراخوانی می‌شود
 */
export async function getWheelPrizeVouchers(
  params: { restaurantId: number; phone: string },
  token?: string,
): Promise<WheelPrizeVoucher[]> {
  await apiConfigReady;
  const headers: Record<string, string> = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  try {
    const response = await api.get(`/gamification/restaurants/${params.restaurantId}/vouchers`, {
      params: { phone: params.phone },
      headers,
      skipGlobalErrorToast: true,
    } as any);
    return Array.isArray(response.data) ? response.data : [];
  } catch {
    return [];
  }
}

/**
 * اعمال ووچر گردونه شانس روی سفارش
 */
export async function redeemWheelPrizeVoucher(
  params: { restaurantId: number; voucherId: number; orderId?: number },
  token?: string,
): Promise<WheelPrizeVoucher> {
  await apiConfigReady;
  const headers: Record<string, string> = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  const response = await api.post(
    `/gamification/restaurants/${params.restaurantId}/vouchers/${params.voucherId}/redeem`,
    { orderId: params.orderId },
    { headers },
  );
  return response.data as WheelPrizeVoucher;
}

const DEFAULT_ORDERS_PAGE_SIZE = 50;

export async function fetchOrders(
  params: { restaurantName?: string; status?: string; page?: number; limit?: number; offset?: number } = {},
  token?: string,
) {
  await apiConfigReady;
  const headers: any = {};
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  const query = { ...params };
  if (query.limit == null) query.limit = DEFAULT_ORDERS_PAGE_SIZE;
  const response = await api.get('/orders', { params: query, headers });
  return response.data;
}

export async function updateOrderStatus(orderId: number, status: string, token?: string) {
  await apiConfigReady;
  const headers: any = {};
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  const response = await api.patch(`/orders/${orderId}/status`, { status }, { headers });
  return response.data;
}

export async function fetchOrderById(orderId: number, token: string) {
  await apiConfigReady;
  const response = await api.get(`/orders/${orderId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return response.data;
}

export async function updateOrder(orderId: number, body: Record<string, unknown>, token: string) {
  await apiConfigReady;
  const response = await api.patch(`/orders/${orderId}`, body, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return response.data;
}

export async function fetchProfile(token: string) {
  await apiConfigReady;
  const response = await api.get('/auth/profile', {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
  return response.data;
}

export async function getActiveSubscription(restaurantId: number, token: string) {
  await apiConfigReady;
  const response = await api.get(`/subscriptions/restaurant/${restaurantId}/active`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
    timeout: 12000,
  });
  return response.data;
}

export type ReceiptNumberSettings = {
  nextNumber: number;
  resetPolicy: string;
  startNumber: number;
  lastResetDate: string;
  dailyResetTime: string;
};

export async function getReceiptNumberSettingsFromServer(
  restaurantId: number,
  token: string,
): Promise<ReceiptNumberSettings | null> {
  await apiConfigReady;
  const response = await api.get('/settings/receipt-number', {
    params: { restaurantId },
    headers: { Authorization: `Bearer ${token}` },
  });
  return response.data ?? null;
}

export async function saveReceiptNumberSettingsToServer(
  restaurantId: number,
  settings: ReceiptNumberSettings,
  token: string,
): Promise<{ message: string }> {
  await apiConfigReady;
  const response = await api.post('/settings/receipt-number', { ...settings, restaurantId }, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return response.data;
}

// ——— مشتریان و آدرس‌ها (برای پنل الکترون) ———

export interface CustomerAddressItem {
  id: number;
  restaurantId: number;
  customerPhone: string;
  label?: string;
  address: string;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
}

export async function getCustomerAddresses(
  params: { restaurantId?: number; restaurantName?: string; phone: string },
  token: string,
): Promise<CustomerAddressItem[]> {
  await apiConfigReady;
  const response = await api.get('/customers/addresses', {
    params: { restaurantId: params.restaurantId, restaurantName: params.restaurantName, phone: params.phone },
    headers: { Authorization: `Bearer ${token}` },
  });
  return Array.isArray(response.data) ? response.data : [];
}

// ─── میزها ─────────────────────────────────────────────────────────────────

export type PosTableStatus = 'available' | 'occupied' | 'reserved' | 'out_of_service';

export interface PosTable {
  id: number;
  name: string;
  zone: string | null;
  capacity: number;
  status: PosTableStatus;
  isActive: boolean;
  sortOrder: number;
  currentOrder?: { id: number; orderNumber: string; finalAmount: number } | null;
}

/**
 * میزهای فعال رستوران برای انتخاب در سفارش سالنی. صندوق نتیجه را کش می‌کند
 * تا در حالت آفلاین هم بتوان میز انتخاب کرد (وضعیت لحظه‌ای میز در آفلاین
 * قدیمی است، ولی خودِ فهرست میزها به‌ندرت تغییر می‌کند).
 */
export async function getTables(restaurantId: number, token: string): Promise<PosTable[]> {
  await apiConfigReady;
  const response = await api.get('/tables', {
    params: { restaurantId },
    headers: { Authorization: `Bearer ${token}` },
  });
  return Array.isArray(response.data) ? response.data : [];
}

// ─── ارسال با پیک ──────────────────────────────────────────────────────────

export interface NeshanSearchItem {
  title: string;
  address: string;
  location: { x: number; y: number };
}

/** جست‌وجوی آدرس. فقط آنلاین معنا دارد — فراخوان باید خودش چک کند. */
export async function searchAddress(
  term: string,
  token: string,
): Promise<NeshanSearchItem[]> {
  await apiConfigReady;
  const response = await api.get('/neshan/search', {
    params: { term },
    headers: { Authorization: `Bearer ${token}` },
  });
  return Array.isArray(response.data?.items) ? response.data.items : [];
}

export interface DeliveryQuoteResult {
  serviceable: boolean;
  reason?: string;
  fee: number;
  distanceM: number;
  durationS: number;
  isFallback: boolean;
}

/** استعلام کرایه. بک‌اند روی قطعی نشان خطا نمی‌دهد و تخمین برمی‌گرداند. */
export async function quoteDeliveryFee(
  params: {
    restaurantId: number;
    dropoff: { lat: number; lng: number };
    cartSubtotal: number;
  },
  token: string,
): Promise<DeliveryQuoteResult> {
  await apiConfigReady;
  const response = await api.post(
    `/delivery/quote/${params.restaurantId}`,
    { dropoff: params.dropoff, cartSubtotal: params.cartSubtotal },
    { headers: { Authorization: `Bearer ${token}` } },
  );
  return response.data;
}

export interface CallerLookupResult {
  isKnown: boolean;
  phone: string;
  customer: {
    id: number;
    firstName: string;
    lastName: string;
    mobile: string;
    email: string | null;
  } | null;
  totalOrders: number;
  totalSpent: number;
  lastOrderDate: string | null;
  recentOrders: {
    id: number;
    orderNumber: string;
    /** جمع خام اقلام — پیش از تخفیف و ارزش افزوده */
    totalAmount: number;
    discountAmount?: number | null;
    /** مالیات بر ارزش افزوده — در `finalAmount` لحاظ شده است */
    vatAmount?: number | null;
    /** مبلغ قابل پرداخت = جمع اقلام − تخفیف + ارزش افزوده */
    finalAmount?: number | null;
    status: string;
    createdAt: string;
    items: any[];
  }[];
  addresses: {
    id: number;
    label: string | null;
    address: string;
    isDefault: boolean;
  }[];
}

export async function callerLookup(
  params: { restaurantId?: number; restaurantName?: string; phone: string },
  token: string,
): Promise<CallerLookupResult> {
  await apiConfigReady;
  const response = await api.get('/customers/caller-lookup', {
    params: { restaurantId: params.restaurantId, restaurantName: params.restaurantName, phone: params.phone },
    headers: { Authorization: `Bearer ${token}` },
  });
  return response.data;
}

export async function addCustomer(
  params: { restaurantId?: number; restaurantName?: string },
  body: { mobile: string; firstName?: string; lastName?: string },
  token: string,
): Promise<{ user: { id: number; mobile: string; firstName: string; lastName: string }; added: boolean }> {
  await apiConfigReady;
  const response = await api.post('/customers/add', body, {
    params: { restaurantId: params.restaurantId, restaurantName: params.restaurantName },
    headers: { Authorization: `Bearer ${token}` },
  });
  return response.data;
}

export async function updateCustomerProfile(
  params: { restaurantId?: number; restaurantName?: string; phone: string },
  body: { firstName?: string; lastName?: string },
  token: string,
): Promise<{ id: number; firstName: string; lastName: string; mobile: string }> {
  await apiConfigReady;
  const response = await api.patch('/customers/profile', body, {
    params: {
      restaurantId: params.restaurantId,
      restaurantName: params.restaurantName,
      phone: params.phone,
    },
    headers: { Authorization: `Bearer ${token}` },
  });
  return response.data;
}

export async function createCustomerAddress(
  params: { restaurantId?: number; restaurantName?: string },
  body: { customerPhone: string; label?: string; address: string; isDefault?: boolean },
  token: string,
): Promise<CustomerAddressItem> {
  await apiConfigReady;
  const response = await api.post('/customers/addresses', body, {
    params: { restaurantId: params.restaurantId, restaurantName: params.restaurantName },
    headers: { Authorization: `Bearer ${token}` },
  });
  return response.data;
}

// ——— قالب‌های چاپ (از پنل ادمین رستوران) ———

export interface PrintTemplateItem {
  id: number;
  restaurantId: number;
  name: string;
  receiptType: 'full' | 'kitchen';
  paperWidth: number;
  paperLength: number;
  margin: number;
  contentWidthMm: number | null;
  shiftLeftMm: number | null;
  layout: any[] | null;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
}

export async function getPrintTemplates(
  restaurantId: number,
  token: string,
): Promise<PrintTemplateItem[]> {
  await apiConfigReady;
  const response = await api.get('/print-templates', {
    params: { restaurantId },
    headers: { Authorization: `Bearer ${token}` },
  });
  return Array.isArray(response.data) ? response.data : [];
}

export type AccountingPushOperation = {
  localOpId: string;
  entityType: string;
  operationType: 'create' | 'update' | 'delete';
  entityId: string;
  payload: Record<string, any>;
  version?: number;
  clientUpdatedAt?: string;
};

export async function syncAccountingPush(
  restaurantId: number,
  operations: AccountingPushOperation[],
  token: string,
) {
  await apiConfigReady;
  const response = await api.post(
    '/accounting/sync/push',
    { restaurantId, operations },
    { headers: { Authorization: `Bearer ${token}` } },
  );
  return response.data as {
    syncedAt: string;
    results: Array<{
      localOpId: string;
      status: 'synced' | 'failed';
      applied?: boolean;
      error?: string;
      entityType: string;
      entityId: string;
    }>;
  };
}

export async function syncAccountingPull(
  restaurantId: number,
  token: string,
  since?: string,
  limit = 500,
) {
  await apiConfigReady;
  const response = await api.post(
    '/accounting/sync/pull',
    { restaurantId, since, limit },
    { headers: { Authorization: `Bearer ${token}` } },
  );
  return response.data as {
    syncedAt: string;
    strategy: 'last-write-wins';
    since: string | null;
    data: {
      rawMaterials: any[];
      suppliers: any[];
      finalProducts: any[];
      recipes: any[];
      cashBankAccounts: any[];
      operationalExpenses: any[];
      purchaseInvoices: any[];
      purchaseInvoiceItems: any[];
      cheques: any[];
      customerReceivables: any[];
      warehouses: any[];
      purchaseReturns?: any[];
      purchaseReturnItems?: any[];
    };
  };
}

export async function createPurchaseInvoiceAccounting(
  payload: {
    restaurantId: number;
    supplierId: number;
    invoiceNumber: string;
    purchaseDate: string;
    items: Array<{ rawMaterialId?: number; finalProductId?: number; quantity: number; unitPrice: number; salePrice?: number; warehouseId?: number }>;
    extraCosts?: number;
    status?: 'draft' | 'pending_approval' | 'approved' | 'rejected';
    notes?: string;
  },
  token: string,
) {
  await apiConfigReady;
  const response = await api.post('/accounting/purchases/invoices', payload, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return response.data as {
    invoiceId: number;
    status: string;
    totalAmount: number;
    paidAmount: number;
    debtAmount: number;
    items: number;
    payments: number;
  };
}

/**
 * Updates a DRAFT/PENDING_APPROVAL purchase invoice already on the server.
 * Used by the offline sync push loop when a local draft that was already
 * synced once (has a serverInvoiceId) gets edited again locally, so the
 * re-push updates the same server record instead of creating a duplicate.
 * The server rejects this (400) if the invoice has since been approved —
 * that case must go through editApprovedPurchaseInvoice instead.
 */
export async function updatePurchaseInvoiceAccounting(
  invoiceId: number,
  payload: {
    restaurantId: number;
    supplierId?: number;
    invoiceNumber?: string;
    purchaseDate?: string;
    items?: Array<{ rawMaterialId?: number; finalProductId?: number; quantity: number; unitPrice: number; salePrice?: number }>;
    extraCosts?: number;
    notes?: string;
  },
  token: string,
) {
  await apiConfigReady;
  const response = await api.patch(
    `/accounting/purchases/invoices/${invoiceId}`,
    payload,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  return response.data;
}

export async function fetchAccountingPurchaseReport(
  params: { restaurantId: number; from?: string; to?: string; supplierId?: number; fiscalYearId?: number },
  token: string,
) {
  await apiConfigReady;
  const response = await api.get('/accounting/reports/purchases', {
    params,
    headers: { Authorization: `Bearer ${token}` },
  });
  return response.data as {
    rows: Array<{
      id: number;
      invoiceNumber: string;
      purchaseDate: string;
      status: string;
      totalAmount: number;
      supplierId: number;
      supplierName: string;
      paidAmount: number;
      debtAmount: number;
    }>;
    summary: { total: number; paid: number; debt: number };
  };
}

export type FiscalYearRow = {
  id: number;
  name: string;
  startDate: string;
  endDate: string;
  status: 'open' | 'closed';
  isActive: boolean;
};

export async function listFiscalYears(restaurantId: number, token: string): Promise<FiscalYearRow[]> {
  await apiConfigReady;
  const response = await api.get('/accounting/fiscal-years', {
    params: { restaurantId },
    headers: { Authorization: `Bearer ${token}` },
  });
  return Array.isArray(response.data) ? response.data : [];
}

export async function setActiveFiscalYear(
  fiscalYearId: number,
  restaurantId: number,
  token: string,
): Promise<FiscalYearRow> {
  await apiConfigReady;
  const response = await api.post(
    `/accounting/fiscal-years/${fiscalYearId}/set-active`,
    { restaurantId },
    { headers: { Authorization: `Bearer ${token}` } },
  );
  return response.data;
}

export async function closeFiscalYear(
  fiscalYearId: number,
  restaurantId: number,
  token: string,
): Promise<FiscalYearRow> {
  await apiConfigReady;
  const response = await api.post(
    `/accounting/fiscal-years/${fiscalYearId}/close`,
    { restaurantId },
    { headers: { Authorization: `Bearer ${token}` } },
  );
  return response.data;
}

export interface MasterProduct {
  id: number;
  name: string;
  barcode: string;
  category?: string;
}

/** جستجوی محصولات پایه بر اساس نام — حداکثر ۸ نتیجه برمی‌گرداند */
export async function searchMasterProducts(
  query: string,
  token?: string,
): Promise<MasterProduct[]> {
  await apiConfigReady;
  if (!query.trim()) return [];
  const headers: Record<string, string> = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  try {
    const response = await api.get('/master-products', { headers, params: { search: query.trim(), limit: 8 } });
    return response.data?.data ?? [];
  } catch {
    return [];
  }
}

/** جستجوی محصول پایه بر اساس بارکد — در صورت عدم یافتن یا خطا، null برمی‌گرداند */
export async function getMasterProductByBarcode(
  barcode: string,
  token?: string,
): Promise<MasterProduct | null> {
  await apiConfigReady;
  const headers: Record<string, string> = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  try {
    const response = await api.get(`/master-products/barcode/${encodeURIComponent(barcode)}`, { headers });
    return response.data ?? null;
  } catch {
    return null;
  }
}

export async function updateAccountingPurchaseInvoiceStatus(
  invoiceId: number,
  payload: { restaurantId: number; status: 'pending_approval' | 'approved' | 'rejected' },
  token: string,
) {
  await apiConfigReady;
  const response = await api.post(
    `/accounting/purchases/invoices/${invoiceId}/status`,
    payload,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  return response.data as { invoiceId: number; status: string };
}

/**
 * Edits an APPROVED purchase invoice. Server-only — never queued offline,
 * since it must reach the same restaurant-wide accounting state the web
 * admin sees. The server never mutates the original invoice in place: it
 * reverses it via a full purchase return and reissues a new APPROVED
 * invoice (see Menus_BE AccountingService.editApprovedPurchaseInvoice).
 * Only allowed when the original invoice has zero payments recorded.
 */
export async function editApprovedPurchaseInvoice(
  invoiceId: number,
  payload: {
    restaurantId: number;
    supplierId?: number;
    invoiceNumber?: string;
    purchaseDate?: string;
    items: Array<{ rawMaterialId?: number; finalProductId?: number; quantity: number; unitPrice: number; salePrice?: number; warehouseId?: number }>;
    extraCosts?: number;
    vatRate?: number;
    notes?: string;
  },
  token: string,
) {
  await apiConfigReady;
  const response = await api.post(
    `/accounting/purchases/invoices/${invoiceId}/edit`,
    payload,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  return response.data as {
    originalInvoiceId: number;
    purchaseReturnId: number;
    newInvoiceId: number;
    status: string;
    totalAmount: number;
  };
}

// ─── دسته‌بندی هزینه ─────────────────────────────────────────────────────

export type ExpenseCategoryRow = {
  id: number;
  name: string;
  isActive: boolean;
  parentCategoryId?: number | null;
};

export async function listExpenseCategories(
  restaurantId: number,
  token: string,
): Promise<ExpenseCategoryRow[]> {
  await apiConfigReady;
  const response = await api.get('/accounting/financial/expense-categories', {
    params: { restaurantId },
    headers: { Authorization: `Bearer ${token}` },
  });
  return Array.isArray(response.data) ? response.data : [];
}

export async function createExpenseCategory(
  payload: { restaurantId: number; name: string; parentCategoryId?: number | null },
  token: string,
): Promise<ExpenseCategoryRow> {
  await apiConfigReady;
  const response = await api.post('/accounting/financial/expense-categories', payload, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return response.data;
}

export async function updateExpenseCategory(
  id: number,
  // restaurantId اجباری است — DTO سمت سرور بدون آن با 400 رد می‌شود و همیشه silently
  // در .catch(() => {}) صداهای caller گم می‌شد (تغییرات هرگز واقعاً sync نمی‌شدند).
  payload: { restaurantId: number; name?: string; isActive?: boolean; parentCategoryId?: number | null },
  token: string,
): Promise<ExpenseCategoryRow> {
  await apiConfigReady;
  const response = await api.patch(
    `/accounting/financial/expense-categories/${id}`,
    payload,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  return response.data;
}

export async function deleteExpenseCategory(
  id: number,
  restaurantId: number,
  token: string,
): Promise<void> {
  await apiConfigReady;
  await api.delete(`/accounting/financial/expense-categories/${id}`, {
    params: { restaurantId },
    headers: { Authorization: `Bearer ${token}` },
  });
}

// ─── هزینه‌های عملیاتی آنلاین ────────────────────────────────────────────────

export async function listOperationalExpensesOnline(
  restaurantId: number,
  token: string,
  fiscalYearId?: number,
): Promise<any[]> {
  await apiConfigReady;
  const response = await api.get('/accounting/financial/operational-expenses', {
    params: { restaurantId, ...(fiscalYearId ? { fiscalYearId } : {}) },
    headers: { Authorization: `Bearer ${token}` },
  });
  const payload = response.data;
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.data)) return payload.data;
  return [];
}

export async function createOperationalExpenseOnline(
  payload: {
    restaurantId: number;
    expenseCategoryId: number;
    expenseDate: string;
    amount: number;
    description?: string;
  },
  token: string,
): Promise<any> {
  await apiConfigReady;
  const response = await api.post('/accounting/financial/operational-expenses', payload, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return response.data;
}

export async function updateOperationalExpenseOnline(
  id: number,
  payload: {
    restaurantId: number;
    expenseCategoryId?: number;
    expenseDate?: string;
    amount?: number;
    description?: string;
  },
  token: string,
): Promise<any> {
  await apiConfigReady;
  const response = await api.patch(
    `/accounting/financial/operational-expenses/${id}`,
    payload,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  return response.data;
}

export async function deleteOperationalExpenseOnline(
  id: number,
  restaurantId: number,
  token: string,
): Promise<void> {
  await apiConfigReady;
  await api.delete(`/accounting/financial/operational-expenses/${id}`, {
    params: { restaurantId },
    headers: { Authorization: `Bearer ${token}` },
  });
}

// ─── دسته‌بندی مواد اولیه ────────────────────────────────────────────────────

export type RawMaterialCategoryRow = {
  id: number;
  name: string;
  isActive: boolean;
};

export type UnitRow = { id: number; name: string };

export async function listUnits(): Promise<UnitRow[]> {
  await apiConfigReady;
  const response = await api.get('/units');
  return Array.isArray(response.data) ? response.data : [];
}

export async function listRawMaterialCategories(
  restaurantId: number,
  token: string,
): Promise<RawMaterialCategoryRow[]> {
  await apiConfigReady;
  const response = await api.get('/accounting/inventory/raw-material-categories', {
    params: { restaurantId },
    headers: { Authorization: `Bearer ${token}` },
  });
  return Array.isArray(response.data) ? response.data : [];
}

export async function createRawMaterialCategory(
  payload: { restaurantId: number; name: string },
  token: string,
): Promise<RawMaterialCategoryRow> {
  await apiConfigReady;
  const response = await api.post('/accounting/inventory/raw-material-categories', payload, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return response.data;
}

export async function updateRawMaterialCategory(
  id: number,
  payload: { name?: string; isActive?: boolean },
  token: string,
): Promise<RawMaterialCategoryRow> {
  await apiConfigReady;
  const response = await api.patch(
    `/accounting/inventory/raw-material-categories/${id}`,
    payload,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  return response.data;
}

export async function deleteRawMaterialCategory(
  id: number,
  restaurantId: number,
  token: string,
): Promise<void> {
  await apiConfigReady;
  await api.delete(`/accounting/inventory/raw-material-categories/${id}`, {
    params: { restaurantId },
    headers: { Authorization: `Bearer ${token}` },
  });
}

// Order Returns API
export async function createOrderReturn(returnData: any, token: string) {
  await apiConfigReady;
  const response = await api.post('/order-returns', returnData, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return response.data;
}

export async function fetchOrderReturns(
  params: {
    restaurantName?: string;
    restaurantId?: number;
    orderId?: number;
    status?: string;
    page?: number;
    limit?: number;
  },
  token: string,
) {
  await apiConfigReady;
  const response = await api.get('/order-returns', {
    params,
    headers: { Authorization: `Bearer ${token}` },
  });
  return response.data;
}

export async function fetchOrderReturnById(returnId: number, token: string) {
  await apiConfigReady;
  const response = await api.get(`/order-returns/${returnId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return response.data;
}

export async function updateOrderReturn(
  returnId: number,
  updateData: { status?: string; notes?: string },
  token: string,
) {
  await apiConfigReady;
  const response = await api.patch(`/order-returns/${returnId}`, updateData, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return response.data;
}

export async function deleteOrderReturn(returnId: number, token: string) {
  await apiConfigReady;
  const response = await api.delete(`/order-returns/${returnId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return response.data;
}

export async function fetchOrderReturnStats(
  params: { restaurantName?: string; restaurantId?: number },
  token: string,
) {
  await apiConfigReady;
  const response = await api.get('/order-returns/stats', {
    params,
    headers: { Authorization: `Bearer ${token}` },
  });
  return response.data;
}

/** آخرین زمان به‌روزرسانی محصولات رستوران — برای بررسی تغییر بدون دریافت کل لیست */
export async function getProductsLastUpdatedAt(
  restaurantId: number,
  token?: string,
): Promise<{ lastUpdatedAt: string | null }> {
  await apiConfigReady;
  const headers: any = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  try {
    const response = await api.get('/products/last-updated-at', {
      headers,
      params: { restaurantId },
    });
    return response.data;
  } catch {
    return { lastUpdatedAt: null };
  }
}

/** دریافت محصولات به‌صورت صفحه‌بندی‌شده — عمومی، برای ثبت سفارش */
export async function getProductsPublicPaginated(
  params: {
    restaurantId?: number;
    restaurantName?: string;
    page: number;
    limit: number;
  },
  token?: string,
): Promise<{ data: any[]; total: number; page: number; limit: number }> {
  await apiConfigReady;
  const headers: any = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (params.restaurantName) headers['x-restaurant-name'] = params.restaurantName;
  if (params.restaurantId) headers['x-selected-restaurant-id'] = String(params.restaurantId);
  const body: any = {
    restaurantId: params.restaurantId,
    restaurantName: params.restaurantName,
    page: params.page,
    limit: params.limit,
  };
  const response = await api.post('/products/filter/public/paginated', body, { headers });
  return response.data;
}

/** آخرین زمان به‌روزرسانی دسته‌بندی‌های رستوران — برای بررسی تغییر بدون دریافت کل لیست */
export async function getCategoriesLastUpdatedAt(
  restaurantId: number,
  token?: string,
): Promise<{ lastUpdatedAt: string | null }> {
  await apiConfigReady;
  const headers: any = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  try {
    const response = await api.get('/categories/last-updated-at', {
      headers,
      params: { restaurantId },
    });
    return response.data;
  } catch {
    return { lastUpdatedAt: null };
  }
}

/** دریافت محصولات با صفحه‌بندی و جستجو — برای پنل مدیریت ادمین */
export async function getProductsAdmin(
  params: {
    restaurantId?: number;
    restaurantName?: string;
    page: number;
    limit: number;
    search?: string;
  },
  token: string,
): Promise<{ data: any[]; total: number; page: number; limit: number }> {
  await apiConfigReady;
  const body: any = {
    restaurantId: params.restaurantId,
    restaurantName: params.restaurantName,
    page: params.page,
    limit: params.limit,
    search: params.search,
  };
  const response = await api.post('/products/filter/admin', body, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return response.data;
}

export async function createCreditPayment(
  orderId: number,
  payload: {
    amount: number;
    restaurantName: string;
    notes?: string;
    cashBankAccountId?: number;
    paymentMethod?: string;
  },
  token: string,
) {
  await apiConfigReady;
  const response = await api.post(
    `/orders/${orderId}/credit-payment`,
    payload,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  return response.data;
}

export async function getCreditPaymentHistory(orderId: number, token: string) {
  await apiConfigReady;
  const response = await api.get(
    `/orders/${orderId}/credit-payments`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  return response.data;
}

// ─── برگشت از خرید ───────────────────────────────────────────────────────────

export async function createPurchaseReturn(
  payload: {
    restaurantId: number;
    purchaseInvoiceId: number;
    returnDate: string;
    items: Array<{ rawMaterialId?: number; finalProductId?: number; quantity: number; unitPrice: number }>;
    notes?: string;
  },
  token: string,
) {
  await apiConfigReady;
  const response = await api.post('/accounting/purchases/returns', payload, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return response.data as { id: number; returnNumber: string; status: string; totalAmount: number };
}

export async function listPurchaseReturns(
  params: { restaurantId: number; fiscalYearId?: number; purchaseInvoiceId?: number },
  token: string,
) {
  await apiConfigReady;
  const response = await api.get('/accounting/purchases/returns', {
    params,
    headers: { Authorization: `Bearer ${token}` },
  });
  return Array.isArray(response.data) ? response.data : [];
}

export async function approvePurchaseReturn(
  returnId: number,
  restaurantId: number,
  token: string,
) {
  await apiConfigReady;
  const response = await api.post(
    `/accounting/purchases/returns/${returnId}/approve`,
    { restaurantId },
    { headers: { Authorization: `Bearer ${token}` } },
  );
  return response.data;
}

export interface KardexRow {
  id: number;
  date: string;
  movementType: string;
  isIncrease: boolean;
  quantity: number;
  balanceAfter: number;
  referenceType: string | null;
  referenceId: number | null;
  invoiceNumber: string | null;
  unitPrice: number | null;
  salePrice: number | null;
  warehouseName: string | null;
  description: string | null;
}

export interface KardexReport {
  item: {
    id: number;
    type: 'final_product' | 'raw_material';
    name: string;
    unit: string | null;
    currentStock: number;
  };
  rows: KardexRow[];
}

/** گزارش کاردکس کالا — تاریخچهٔ کامل ورود/خروج + قیمت خرید/فروش هر رویداد */
export async function getInventoryKardex(
  params: { restaurantId: number; rawMaterialId?: number; finalProductId?: number; fiscalYearId?: number },
  token: string,
): Promise<KardexReport> {
  await apiConfigReady;
  const response = await api.get('/accounting/inventory/kardex', {
    params,
    headers: { Authorization: `Bearer ${token}` },
  });
  return response.data;
}

export async function cancelPurchaseReturn(returnId: number, restaurantId: number, token: string) {
  await apiConfigReady;
  const response = await api.delete(`/accounting/purchases/returns/${returnId}`, {
    params: { restaurantId },
    headers: { Authorization: `Bearer ${token}` },
  });
  return response.data;
}

// ─── Service Jobs ─────────────────────────────────────────────────────────────

export async function getServiceBoards(restaurantId: number, token: string): Promise<any[]> {
  await apiConfigReady;
  const response = await api.get('/service-jobs/boards', {
    params: { restaurantId },
    headers: { Authorization: `Bearer ${token}` },
  });
  return Array.isArray(response.data) ? response.data : [];
}

export interface CreateServiceJobElectronDto {
  restaurantId: number;
  boardId: number;
  statusId: number;
  title: string;
  customerName?: string;
  customerPhone?: string;
  customerId?: number | null;
  assigneeId?: number | null;
  priority?: 'low' | 'normal' | 'high' | 'urgent';
  dueDate?: string | null;
  estimatedAmount?: number;
  formData?: Record<string, any>;
}

export async function createServiceJobRemote(dto: CreateServiceJobElectronDto, token: string): Promise<any> {
  await apiConfigReady;
  const { restaurantId, ...body } = dto;
  const response = await api.post('/service-jobs/jobs', body, {
    params: { restaurantId },
    headers: { Authorization: `Bearer ${token}` },
  });
  return response.data;
}

export async function listServiceJobsRemote(
  params: { restaurantId: number; boardId?: number; page?: number; limit?: number },
  token: string,
): Promise<{ data: any[]; total: number }> {
  await apiConfigReady;
  const response = await api.get('/service-jobs/jobs', {
    params,
    headers: { Authorization: `Bearer ${token}` },
  });
  return response.data;
}

export async function getServiceJobRemote(jobId: number, restaurantId: number, token: string): Promise<any> {
  await apiConfigReady;
  const response = await api.get(`/service-jobs/jobs/${jobId}`, {
    params: { restaurantId },
    headers: { Authorization: `Bearer ${token}` },
  });
  return response.data;
}

export interface UpdateServiceJobElectronDto {
  title?: string;
  customerName?: string | null;
  customerPhone?: string | null;
  priority?: 'low' | 'normal' | 'high' | 'urgent';
  dueDate?: string | null;
  estimatedAmount?: number;
  assigneeId?: number | null;
}

export async function updateServiceJobRemote(
  jobId: number,
  restaurantId: number,
  body: UpdateServiceJobElectronDto,
  token: string,
): Promise<any> {
  await apiConfigReady;
  const response = await api.patch(`/service-jobs/jobs/${jobId}`, body, {
    params: { restaurantId },
    headers: { Authorization: `Bearer ${token}` },
  });
  return response.data;
}

export async function moveServiceJobStatusRemote(
  jobId: number,
  restaurantId: number,
  statusId: number,
  token: string,
): Promise<any> {
  await apiConfigReady;
  const response = await api.patch(`/service-jobs/jobs/${jobId}/move`, { statusId }, {
    params: { restaurantId },
    headers: { Authorization: `Bearer ${token}` },
  });
  return response.data;
}

export interface ServiceJobItemElectronDto {
  itemType: 'product' | 'service' | 'labor';
  description: string;
  quantity: number;
  unitPrice: number;
  deductFromInventory?: boolean;
}

export async function addServiceJobItemRemote(
  jobId: number,
  restaurantId: number,
  item: ServiceJobItemElectronDto,
  token: string,
): Promise<any> {
  await apiConfigReady;
  const response = await api.post(`/service-jobs/jobs/${jobId}/items`, item, {
    params: { restaurantId },
    headers: { Authorization: `Bearer ${token}` },
  });
  return response.data;
}

export async function updateServiceJobItemRemote(
  jobId: number,
  itemId: number,
  restaurantId: number,
  item: ServiceJobItemElectronDto,
  token: string,
): Promise<any> {
  await apiConfigReady;
  const response = await api.patch(`/service-jobs/jobs/${jobId}/items/${itemId}`, item, {
    params: { restaurantId },
    headers: { Authorization: `Bearer ${token}` },
  });
  return response.data;
}

export async function removeServiceJobItemRemote(
  jobId: number,
  itemId: number,
  restaurantId: number,
  token: string,
): Promise<any> {
  await apiConfigReady;
  const response = await api.delete(`/service-jobs/jobs/${jobId}/items/${itemId}`, {
    params: { restaurantId },
    headers: { Authorization: `Bearer ${token}` },
  });
  return response.data;
}

export async function issueServiceJobInvoiceRemote(
  jobId: number,
  restaurantId: number,
  opts: { warehouseId?: number; vatRate?: number; saleDate?: string },
  token: string,
): Promise<any> {
  await apiConfigReady;
  const response = await api.post(`/service-jobs/jobs/${jobId}/issue-invoice`, opts, {
    params: { restaurantId },
    headers: { Authorization: `Bearer ${token}` },
  });
  return response.data;
}

export async function addServiceJobAttachmentRemote(
  jobId: number,
  restaurantId: number,
  file: File,
  token: string,
  visibleToCustomer = false,
): Promise<any> {
  await apiConfigReady;
  const form = new FormData();
  form.append('file', file);
  const response = await api.post(
    `/service-jobs/jobs/${jobId}/attachments`,
    form,
    {
      params: { restaurantId, visibleToCustomer },
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'multipart/form-data' },
    },
  );
  return response.data;
}

export async function getServiceJobStaffRemote(restaurantId: number, token: string): Promise<{ id: number; name: string; mobile: string }[]> {
  await apiConfigReady;
  const response = await api.get('/service-jobs/staff', {
    params: { restaurantId },
    headers: { Authorization: `Bearer ${token}` },
  });
  return Array.isArray(response.data) ? response.data : [];
}

export async function phoneLookupServiceJobRemote(phone: string, token: string): Promise<{ found: boolean; customerId?: number; name?: string }> {
  await apiConfigReady;
  const response = await api.get('/service-jobs/phone-lookup', {
    params: { phone },
    headers: { Authorization: `Bearer ${token}` },
  });
  return response.data;
}

export async function registerServiceCustomerRemote(
  restaurantId: number,
  data: { phone: string; firstName?: string; lastName?: string },
  token: string,
): Promise<{ customerId: number; name: string }> {
  await apiConfigReady;
  const response = await api.post('/service-jobs/customers', data, {
    params: { restaurantId },
    headers: { Authorization: `Bearer ${token}` },
  });
  return response.data;
}

// ─── فراخوان گارسون (پیجر نرم‌افزاری) ────────────────────────────────────────

export type WaiterCallType = 'waiter' | 'bill' | 'water' | 'cleaning' | 'order' | 'other';

export type WaiterCallStatus = 'pending' | 'accepted' | 'done' | 'cancelled' | 'expired';

export const WAITER_CALL_TYPE_LABELS: Record<WaiterCallType, string> = {
  waiter: 'صدا زدن گارسون',
  bill: 'درخواست صورتحساب',
  water: 'آب / نوشیدنی',
  cleaning: 'جمع‌آوری میز',
  order: 'آماده‌ام سفارش بدهم',
  other: 'درخواست دیگر',
};

export const WAITER_CALL_STATUS_LABELS: Record<WaiterCallStatus, string> = {
  pending: 'در انتظار پذیرش',
  accepted: 'پذیرفته شد',
  done: 'انجام شد',
  cancelled: 'لغو شد',
  expired: 'بی‌پاسخ ماند',
};

export interface WaiterCallRow {
  id: number;
  restaurant_id: number;
  tableName: string;
  type: WaiterCallType;
  typeLabel?: string;
  note: string | null;
  status: WaiterCallStatus;
  acceptedByName: string | null;
  acceptedAt: string | null;
  responseSeconds: number | null;
  createdAt: string;
}

/** فراخوان‌های باز (در انتظار یا پذیرفته‌شده) — قدیمی‌ترین اول */
export async function listActiveWaiterCalls(
  restaurantId: number,
  token: string,
): Promise<WaiterCallRow[]> {
  await apiConfigReady;
  const response = await api.get('/waiter-calls/active', {
    params: { restaurantId },
    headers: { Authorization: `Bearer ${token}` },
  });
  return Array.isArray(response.data) ? response.data : [];
}

export async function listWaiterCallHistory(
  restaurantId: number,
  token: string,
  limit = 50,
): Promise<WaiterCallRow[]> {
  await apiConfigReady;
  const response = await api.get('/waiter-calls', {
    params: { restaurantId, limit },
    headers: { Authorization: `Bearer ${token}` },
  });
  return Array.isArray(response.data) ? response.data : [];
}

/** پذیرش فراخوان — اولین نفر برنده است؛ نفر دوم خطای ۴۰۹ می‌گیرد */
export async function acceptWaiterCall(
  callId: number,
  restaurantId: number,
  token: string,
): Promise<WaiterCallRow> {
  await apiConfigReady;
  const response = await api.patch(
    `/waiter-calls/${callId}/accept`,
    {},
    { params: { restaurantId }, headers: { Authorization: `Bearer ${token}` } },
  );
  return response.data;
}

export async function completeWaiterCall(
  callId: number,
  restaurantId: number,
  token: string,
): Promise<WaiterCallRow> {
  await apiConfigReady;
  const response = await api.patch(
    `/waiter-calls/${callId}/complete`,
    {},
    { params: { restaurantId }, headers: { Authorization: `Bearer ${token}` } },
  );
  return response.data;
}

// ─── شیفت صندوق (باز/بستن، گزارش X/Z) ──────────────────────────────────────

export type PosShiftStatus = 'open' | 'closed';

export interface PosShiftRow {
  id: number;
  restaurantId: number;
  clientShiftKey: string | null;
  openedByUserId: number | null;
  closedByUserId: number | null;
  openingFloatAmount: number;
  countedCashAmount: number | null;
  expectedCashAmount: number | null;
  varianceAmount: number | null;
  status: PosShiftStatus;
  openingNotes: string | null;
  closingNotes: string | null;
  openedAt: string;
  closedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface OpenPosShiftPayload {
  restaurantId: number;
  openingFloatAmount: number;
  openingNotes?: string;
  /** کلید idempotency برای صف آفلاین — رجوع کنید به OpenShiftDto در Menus_BE */
  clientShiftKey?: string;
}

export interface ClosePosShiftPayload {
  countedCashAmount: number;
  closingNotes?: string;
}

export interface PosShiftPaymentMethodBreakdownRow {
  paymentMethod: string;
  salesCount: number;
  salesAmount: number;
  refundsCount: number;
  refundsAmount: number;
  netAmount: number;
}

export interface PosShiftReport {
  shiftId: number;
  restaurantId: number;
  type: 'x' | 'z';
  status: PosShiftStatus;
  openedAt: string;
  reportedThrough: string;
  openingFloatAmount: number;
  countedCashAmount: number | null;
  expectedCashAmount: number | null;
  varianceAmount: number | null;
  totals: {
    salesCount: number;
    salesAmount: number;
    refundsCount: number;
    refundsAmount: number;
    netAmount: number;
  };
  paymentMethodBreakdown: PosShiftPaymentMethodBreakdownRow[];
}

export async function openPosShift(payload: OpenPosShiftPayload, token: string): Promise<PosShiftRow> {
  await apiConfigReady;
  const response = await api.post('/pos-shifts/open', payload, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return response.data;
}

export async function closePosShift(
  shiftId: number,
  restaurantId: number,
  payload: ClosePosShiftPayload,
  token: string,
): Promise<PosShiftRow> {
  await apiConfigReady;
  const response = await api.post(`/pos-shifts/${shiftId}/close`, payload, {
    params: { restaurantId },
    headers: { Authorization: `Bearer ${token}` },
  });
  return response.data;
}

export async function getCurrentPosShift(restaurantId: number, token: string): Promise<PosShiftRow | null> {
  await apiConfigReady;
  const response = await api.get('/pos-shifts/current', {
    params: { restaurantId },
    headers: { Authorization: `Bearer ${token}` },
  });
  return response.data ?? null;
}

export async function listPosShifts(restaurantId: number, token: string): Promise<PosShiftRow[]> {
  await apiConfigReady;
  const response = await api.get('/pos-shifts', {
    params: { restaurantId },
    headers: { Authorization: `Bearer ${token}` },
  });
  return Array.isArray(response.data) ? response.data : [];
}

export async function getPosShiftReport(
  shiftId: number,
  restaurantId: number,
  type: 'x' | 'z',
  token: string,
): Promise<PosShiftReport> {
  await apiConfigReady;
  const response = await api.get(`/pos-shifts/${shiftId}/report`, {
    params: { restaurantId, type },
    headers: { Authorization: `Bearer ${token}` },
  });
  return response.data;
}

export async function cancelWaiterCall(
  callId: number,
  restaurantId: number,
  token: string,
  reason?: string,
): Promise<WaiterCallRow> {
  await apiConfigReady;
  const response = await api.patch(
    `/waiter-calls/${callId}/cancel`,
    { reason },
    { params: { restaurantId }, headers: { Authorization: `Bearer ${token}` } },
  );
  return response.data;
}
