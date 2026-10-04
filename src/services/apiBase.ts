import axios from 'axios';
import { toast } from '../utils/toast';

// مقدار پیش‌فرض از env ویترین (فقط در زمان build درج می‌شود)
const getDefaultBaseUrl = () => {
  const baseUrl =
    import.meta.env.VITE_API_BASE_URL ||
    import.meta.env.NEXT_PUBLIC_API_BASE_URL ||
    'https://api.secoin.ir';
  const version =
    import.meta.env.VITE_API_BASE_VERSION ||
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

export const api = axios.create({
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
  },
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
  window.dispatchEvent(new CustomEvent('menus-electron:outdated', { detail: { minVersion } }));
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
  const err = error as {
    config?: { skipGlobalErrorToast?: boolean };
    response?: { status?: number };
    request?: unknown;
  };
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
  } catch {
    /* noop */
  }
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
        setTimeout(() => {
          isHandlingUnauthorized = false;
        }, 1500);
      }
    }

    // نسخه‌ی نرم‌افزار قدیمی است — سرور درخواست را رد کرده است
    if (status === 426) {
      const data = error?.response?.data as { message?: string; minVersion?: string } | undefined;
      toast.error('نیاز به به‌روزرسانی', {
        description:
          data?.message || 'نسخه نرم‌افزار شما قدیمی است. لطفاً برنامه را به‌روزرسانی کنید.',
      });
      dispatchOutdated(data?.minVersion);
      return Promise.reject(error);
    }

    showApiErrorToast(error, normalizedPath);
    return Promise.reject(error);
  },
);
