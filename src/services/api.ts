import axios from 'axios';

// مقدار پیش‌فرض از env ویترین (فقط در زمان build درج می‌شود)
const getDefaultBaseUrl = () => {
  const baseUrl = import.meta.env.VITE_API_BASE_URL ||
    import.meta.env.NEXT_PUBLIC_API_BASE_URL ||
    'https://api.hoshmenu.ir';
  const version = import.meta.env.VITE_API_BASE_VERSION ||
    import.meta.env.NEXT_PUBLIC_API_BASE_VERSION ||
    '/api/v1';
  const cleanBaseUrl = String(baseUrl).replace(/\/+$/, '');
  const cleanVersion = String(version).startsWith('/') ? version : `/${version}`;
  return `${cleanBaseUrl}${cleanVersion}`;
};

export const API_BASE_URL = getDefaultBaseUrl();

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

/** آدرس پایهٔ API (مثلاً برای درخواست‌ها) */
export function getApiBaseUrl(): string {
  return api.defaults.baseURL || API_BASE_URL;
}

/** آدرس پایهٔ سرور بدون مسیر /api/v1 (برای لینک عکس‌ها و آپلودها) */
export function getAssetBaseUrl(): string {
  const base = getApiBaseUrl();
  const withoutPath = base.replace(/\/api\/v\d+(\/)?$/i, '').replace(/\/+$/, '');
  return withoutPath || 'https://api.hoshmenu.ir';
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

// Add request interceptor for debugging
api.interceptors.request.use(
  (config) => {
    console.log('API Request:', {
      method: config.method,
      url: config.url,
      baseURL: config.baseURL,
      fullURL: `${config.baseURL}${config.url}`,
    });
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

// Add response interceptor for debugging
api.interceptors.response.use(
  (response) => {
    console.log('API Response:', {
      status: response.status,
      url: response.config.url,
      data: response.data,
    });
    return response;
  },
  (error) => {
    console.error('Response error:', {
      status: error.response?.status,
      statusText: error.response?.statusText,
      data: error.response?.data,
      url: error.config?.url,
    });
    const status = error?.response?.status;
    const requestUrl: string = error?.config?.url || '';
    const normalizedPath = normalizeRequestPath(requestUrl);
    const skipGlobal401 =
      Boolean(error?.config?.skipGlobal401Handler) ||
      AUTH_WHITELIST_ENDPOINTS.some((endpoint) => normalizedPath.includes(endpoint));

    if (status === 401 && !skipGlobal401 && !isHandlingUnauthorized) {
      isHandlingUnauthorized = true;
      try {
        dispatchUnauthorized();
      } finally {
        setTimeout(() => {
          isHandlingUnauthorized = false;
        }, 1500);
      }
    }
    return Promise.reject(error);
  }
);

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
  if (token) {
    body.includeStaffInventoryOrderPrice = true;
  }

  const response = await api.post('/products/filter/public', body, { headers });
  return Array.isArray(response.data) ? response.data : [];
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
    };
  };
}

export async function createPurchaseInvoiceAccounting(
  payload: {
    restaurantId: number;
    supplierId: number;
    invoiceNumber: string;
    purchaseDate: string;
    items: Array<{ rawMaterialId: number; quantity: number; unitPrice: number }>;
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
