import { api, apiConfigReady } from './apiBase';

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
    // Entity keys whose server-side query failed this round (fell back to []).
    // Reconcile-delete must be skipped for any entity listed here — an empty
    // result here does not mean "nothing exists", it means "couldn't check".
    incompleteEntities?: string[];
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
      warehouseTransfers?: any[];
      warehouseStocks?: any[];
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
    items: Array<{
      rawMaterialId?: number;
      finalProductId?: number;
      quantity: number;
      unitPrice: number;
      salePrice?: number;
      warehouseId?: number;
    }>;
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
    items?: Array<{
      rawMaterialId?: number;
      finalProductId?: number;
      quantity: number;
      unitPrice: number;
      salePrice?: number;
    }>;
    extraCosts?: number;
    notes?: string;
  },
  token: string,
) {
  await apiConfigReady;
  const response = await api.patch(`/accounting/purchases/invoices/${invoiceId}`, payload, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return response.data;
}

export async function fetchAccountingPurchaseReport(
  params: {
    restaurantId: number;
    from?: string;
    to?: string;
    supplierId?: number;
    fiscalYearId?: number;
  },
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

export async function listFiscalYears(
  restaurantId: number,
  token: string,
): Promise<FiscalYearRow[]> {
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
    const response = await api.get('/master-products', {
      headers,
      params: { search: query.trim(), limit: 8 },
    });
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
    const response = await api.get(`/master-products/barcode/${encodeURIComponent(barcode)}`, {
      headers,
    });
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
  const response = await api.post(`/accounting/purchases/invoices/${invoiceId}/status`, payload, {
    headers: { Authorization: `Bearer ${token}` },
  });
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
    items: Array<{
      rawMaterialId?: number;
      finalProductId?: number;
      quantity: number;
      unitPrice: number;
      salePrice?: number;
      warehouseId?: number;
    }>;
    extraCosts?: number;
    vatRate?: number;
    notes?: string;
  },
  token: string,
) {
  await apiConfigReady;
  const response = await api.post(`/accounting/purchases/invoices/${invoiceId}/edit`, payload, {
    headers: { Authorization: `Bearer ${token}` },
  });
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
  payload: {
    restaurantId: number;
    name?: string;
    isActive?: boolean;
    parentCategoryId?: number | null;
  },
  token: string,
): Promise<ExpenseCategoryRow> {
  await apiConfigReady;
  const response = await api.patch(`/accounting/financial/expense-categories/${id}`, payload, {
    headers: { Authorization: `Bearer ${token}` },
  });
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
  const response = await api.patch(`/accounting/financial/operational-expenses/${id}`, payload, {
    headers: { Authorization: `Bearer ${token}` },
  });
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
  const response = await api.patch(`/accounting/inventory/raw-material-categories/${id}`, payload, {
    headers: { Authorization: `Bearer ${token}` },
  });
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
