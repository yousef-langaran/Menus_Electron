import { api, apiConfigReady } from './apiBase';

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
  const response = await api.post(`/orders/${orderId}/credit-payment`, payload, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return response.data;
}

export async function getCreditPaymentHistory(orderId: number, token: string) {
  await apiConfigReady;
  const response = await api.get(`/orders/${orderId}/credit-payments`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return response.data;
}

// ─── برگشت از خرید ───────────────────────────────────────────────────────────

export async function createPurchaseReturn(
  payload: {
    restaurantId: number;
    purchaseInvoiceId: number;
    returnDate: string;
    items: Array<{
      rawMaterialId?: number;
      finalProductId?: number;
      quantity: number;
      unitPrice: number;
    }>;
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

export async function approvePurchaseReturn(returnId: number, restaurantId: number, token: string) {
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
  params: {
    restaurantId: number;
    rawMaterialId?: number;
    finalProductId?: number;
    fiscalYearId?: number;
  },
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
