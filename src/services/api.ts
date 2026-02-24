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

export async function fetchOrders(
  params: { restaurantName?: string; status?: string } = {},
  token?: string,
) {
  await apiConfigReady;
  const headers: any = {};
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  const response = await api.get('/orders', { params, headers });
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
