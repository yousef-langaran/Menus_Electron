import { api, apiConfigReady } from './apiBase';

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
  const response = await api.get(`/restaurant/name/${encodeURIComponent(restaurantName)}`, {
    headers,
  });
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

export async function getCategories(
  restaurantName?: string,
  restaurantId?: number,
  token?: string,
) {
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

export interface PointsRewardOption {
  id: number;
  title: string;
  pointsCost: number;
  rewardType: 'percent_discount' | 'fixed_discount' | 'free_item_category' | 'free_specific_item';
  discountPercent: number | null;
  discountAmount: number | null;
  category: { id: number; name: string } | null;
  eligible: boolean;
  /** فقط برای free_item_category — محصولات همان دسته برای انتخاب صندوق‌دار */
  products?: Array<{ id: number; name: string; price: number }>;
  /** فقط برای free_specific_item — محصول از پیش‌مشخص‌شده، بدون انتخاب */
  product?: { id: number; name: string; price: number } | null;
}

/**
 * موجودی امتیاز و کاتالوگ جوایز قابل‌دریافت مشتری در همین رستوران — برای
 * جست‌وجوی صندوق‌دار هنگام ورود شماره مشتری (دقیقاً کنار کیف پول کش‌بک).
 */
export async function getPointsRewards(
  params: { restaurantId: number; phone: string },
  token?: string,
): Promise<{ balance: number; tiers: PointsRewardOption[] }> {
  await apiConfigReady;
  const headers: Record<string, string> = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  try {
    const response = await api.get(`/customer-club/points-rewards/${params.restaurantId}/lookup`, {
      params: { phone: params.phone },
      headers,
      skipGlobalErrorToast: true,
    } as any);
    return {
      balance: Math.max(0, Number(response.data?.balance) || 0),
      tiers: Array.isArray(response.data?.tiers) ? response.data.tiers : [],
    };
  } catch {
    return { balance: 0, tiers: [] };
  }
}

/**
 * مصرف یک جایزه از کاتالوگ برای مشتری — امتیاز کسر می‌شود. برای
 * percent_discount/fixed_discount یک کد تخفیف یک‌بارمصرف برمی‌گردد (مثل هر
 * کد تخفیف دیگر اعمال شود). برای free_item_category/free_specific_item
 * دیگر کد تخفیف صادر نمی‌شود — caller باید خودِ محصول را در سبد رایگان کند
 * (نگاه کنید OrderModal.tsx#handleRedeemReward).
 */
export type RedeemPointsRewardResult =
  | {
      rewardKind: 'discount_code';
      discountCode: string;
      discountType: 'percent' | 'fixed';
      discountValue: number;
      expiresAt: string;
      message: string;
    }
  | {
      rewardKind: 'free_item';
      /** برای لغو/بازگرداندن امتیاز اگر کاربر بعداً این آیتم رایگان را از سبد حذف کرد — نگاه کنید cancelPointsReward */
      redemptionId: number;
      productId: number;
      productName: string;
      price: number;
      message: string;
    };

export async function redeemPointsReward(
  params: { restaurantId: number; phone: string; tierId: number; productId?: number },
  token?: string,
): Promise<RedeemPointsRewardResult> {
  await apiConfigReady;
  const headers: Record<string, string> = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  const response = await api.post(
    `/customer-club/points-rewards/${params.restaurantId}/redeem-by-phone`,
    { phone: params.phone, tierId: params.tierId, productId: params.productId },
    { headers },
  );
  return response.data;
}

/**
 * لغو یک مصرفِ «آیتم رایگان» (بدون کد تخفیف) و بازگرداندن امتیازش —
 * وقتی صندوق‌دار اشتباهی آن را از سبد حذف می‌کند، قبل از ثبت نهایی سفارش.
 */
export async function cancelPointsReward(
  params: { restaurantId: number; phone: string; redemptionId: number },
  token?: string,
): Promise<{ pointsRefunded: number }> {
  await apiConfigReady;
  const headers: Record<string, string> = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  const response = await api.post(
    `/customer-club/points-rewards/${params.restaurantId}/cancel-by-phone`,
    { phone: params.phone, redemptionId: params.redemptionId },
    { headers },
  );
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
  params: {
    restaurantName?: string;
    status?: string;
    page?: number;
    limit?: number;
    offset?: number;
  } = {},
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
  const response = await api.post(
    '/settings/receipt-number',
    { ...settings, restaurantId },
    {
      headers: { Authorization: `Bearer ${token}` },
    },
  );
  return response.data;
}
