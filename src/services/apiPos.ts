import { api, apiConfigReady } from './apiBase';

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
    params: {
      restaurantId: params.restaurantId,
      restaurantName: params.restaurantName,
      phone: params.phone,
    },
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
export async function searchAddress(term: string, token: string): Promise<NeshanSearchItem[]> {
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
    params: {
      restaurantId: params.restaurantId,
      restaurantName: params.restaurantName,
      phone: params.phone,
    },
    headers: { Authorization: `Bearer ${token}` },
  });
  return response.data;
}

export async function addCustomer(
  params: { restaurantId?: number; restaurantName?: string },
  body: { mobile: string; firstName?: string; lastName?: string },
  token: string,
): Promise<{
  user: { id: number; mobile: string; firstName: string; lastName: string };
  added: boolean;
}> {
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

/**
 * تنظیمات کد معرف رستوران. این تماس با گارد دسترسی رستوران محافظت می‌شود
 * (ماژول REFERRAL/READ) — پس هم فعال‌بودن سامانه و هم دسترسی اپراتور را
 * یک‌جا نتیجه می‌دهد: اگر ۴۰۳ برگرداند یعنی این کاربر اجازه ندارد.
 */
export async function getReferralSettings(
  restaurantId: number,
  token: string,
): Promise<{ isEnabled: boolean }> {
  await apiConfigReady;
  const response = await api.get(`/referral/settings/${restaurantId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return response.data;
}

/**
 * ثبت کد معرف برای مشتری تازه‌ساخته‌شده از صندوق حضوری. باید پیش از ثبت
 * اولین سفارش این مشتری فراخوانی شود — سرور با شمارش سفارش‌های قبلی همین
 * رستوران تشخیص می‌دهد مشتری جدید است یا نه.
 */
export async function applyReferralCodePos(
  restaurantId: number,
  body: { code: string; customerId: number },
  token: string,
): Promise<{ applied: boolean; reason?: string }> {
  await apiConfigReady;
  const response = await api.post(
    `/referral/pos/${restaurantId}/apply`,
    { code: body.code, customerId: body.customerId, source: 'pos' },
    { headers: { Authorization: `Bearer ${token}` } },
  );
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
