import { accountingDb } from './accountingDbCore';
import { enqueueAccountingOperation } from './accountingDbSyncOps';
import { nextLocalEntityId, nextOpId } from './accountingDbIds';

// ─── دسته‌بندی هزینه (آفلاین) ────────────────────────────────────────────────

export async function listExpenseCategoriesLocal(restaurantId: number): Promise<any[]> {
  return accountingDb.expenseCategories.where('restaurantId').equals(restaurantId).toArray();
}

export async function upsertPulledExpenseCategories(categories: any[]): Promise<void> {
  if (!categories?.length) return;
  await accountingDb.expenseCategories.bulkPut(categories);
}

export async function createExpenseCategoryLocal(input: {
  restaurantId: number;
  name: string;
  parentCategoryId?: number | null;
}) {
  const id = nextLocalEntityId();
  const now = new Date().toISOString();
  const row = {
    id,
    restaurantId: input.restaurantId,
    name: input.name.trim(),
    isActive: true,
    parentCategoryId: input.parentCategoryId ?? null,
    createdAt: now,
    updatedAt: now,
  };
  await accountingDb.expenseCategories.put(row);
  await enqueueAccountingOperation({
    localOpId: nextOpId(),
    restaurantId: input.restaurantId,
    entityType: 'expense_category',
    entityId: String(id),
    operationType: 'create',
    payload: row,
    version: 1,
    clientUpdatedAt: now,
  });
  return row;
}

export async function updateExpenseCategoryLocal(input: {
  id: number;
  restaurantId: number;
  patch: Partial<{ name: string; isActive: boolean; parentCategoryId: number | null }>;
}) {
  const existing = await accountingDb.expenseCategories.get(input.id);
  if (!existing) return null;
  const now = new Date().toISOString();
  const next = { ...existing, ...input.patch, updatedAt: now };
  await accountingDb.expenseCategories.put(next);
  await enqueueAccountingOperation({
    localOpId: nextOpId(),
    restaurantId: input.restaurantId,
    entityType: 'expense_category',
    entityId: String(input.id),
    operationType: 'update',
    payload: next,
    version: Number(existing.version || 1) + 1,
    clientUpdatedAt: now,
  });
  return next;
}

export async function deleteExpenseCategoryLocal(input: { id: number; restaurantId: number }) {
  const existing = await accountingDb.expenseCategories.get(input.id);
  if (!existing) return false;
  await accountingDb.expenseCategories.delete(input.id);
  await enqueueAccountingOperation({
    localOpId: nextOpId(),
    restaurantId: input.restaurantId,
    entityType: 'expense_category',
    entityId: String(input.id),
    operationType: 'delete',
    payload: { id: input.id },
    version: Number(existing.version || 1) + 1,
    clientUpdatedAt: new Date().toISOString(),
  });
  return true;
}

export async function createOperationalExpenseLocal(input: {
  restaurantId: number;
  expenseCategoryId: number;
  fiscalYearId?: number | null;
  expenseDate: string; // YYYY-MM-DD
  amount: number;
  description?: string;
}) {
  const id = nextLocalEntityId();
  const now = new Date().toISOString();
  const row = {
    id,
    restaurantId: input.restaurantId,
    expenseCategoryId: input.expenseCategoryId,
    fiscalYearId: input.fiscalYearId ?? null,
    expenseDate: input.expenseDate,
    amount: Number(input.amount),
    description: input.description?.trim() || null,
    createdAt: now,
    updatedAt: now,
  };
  await accountingDb.operationalExpenses.put(row);
  await enqueueAccountingOperation({
    localOpId: nextOpId(),
    restaurantId: input.restaurantId,
    entityType: 'operational_expense',
    entityId: String(id),
    operationType: 'create',
    payload: row,
    version: 1,
    clientUpdatedAt: now,
  });
  return row;
}

/**
 * حذف بهینه‌بینانه‌ی محلی + صف‌کردن حذف برای سینک پس‌زمینه — بدون این صف، یک حذفِ
 * آفلاین یا یک درخواست مستقیمِ ناموفق برای همیشه گم می‌شد و pull بعدی همان هزینه
 * را دوباره از سرور برمی‌گرداند (رفع باگ «حذف می‌کنم ولی تا رفرش نکنم از لیست نمی‌رود»).
 */
export async function deleteOperationalExpenseLocal(input: {
  // ممکن است رکورد قبل از فیکس bigint-as-string با id رشته‌ای در Dexie ذخیره شده
  // باشد (سرور id ستون bigint را به صورت رشته برمی‌گرداند) — هر دو نوع را می‌پذیریم.
  id: number | string;
  restaurantId: number;
}): Promise<void> {
  const numericId = Number(input.id);
  const entityId = String(numericId);

  // primary key واقعیِ رکورد ممکن است number (نرمالایز‌شده) یا رشته (داده‌ی قدیمی)
  // باشد — چون IndexedDB بین کلید عددی و رشته‌ای فرق می‌گذارد، هر دو را حذف کن؛
  // حذفِ کلیدی که وجود ندارد بی‌خطر است (no-op). جدول تایپش number است ولی
  // IndexedDB واقعاً هر مقداری را به‌عنوان کلید می‌پذیرد، پس cast به any لازم است.
  await accountingDb.operationalExpenses.delete(input.id as any);
  await accountingDb.operationalExpenses.delete(numericId);
  await accountingDb.operationalExpenses.delete(entityId as any);

  // اگر رکورد هنوز یک عملیات 'create' سینک‌نشده دارد (id موقت — هیچ‌وقت روی سرور
  // وجود نداشته)، همان را لغو کن؛ نیازی به فرستادن یک 'delete' جداگانه نیست.
  const pendingCreate = await accountingDb.syncOperations
    .where('entityType')
    .equals('operational_expense')
    .filter(
      (op) => op.entityId === entityId && op.operationType === 'create' && op.status !== 'synced',
    )
    .toArray();
  if (pendingCreate.length) {
    await accountingDb.syncOperations.bulkDelete(
      pendingCreate.map((op) => op.id!).filter((id) => id !== undefined),
    );
    return;
  }

  await enqueueAccountingOperation({
    localOpId: nextOpId(),
    restaurantId: input.restaurantId,
    entityType: 'operational_expense',
    entityId,
    operationType: 'delete',
    payload: { id: numericId },
    version: 1,
    clientUpdatedAt: new Date().toISOString(),
  });
}

export async function createPurchaseInvoiceLocal(input: {
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
}) {
  const id = nextLocalEntityId();
  const now = new Date().toISOString();
  const items = input.items.map((x) => ({
    id: nextLocalEntityId(),
    purchaseInvoiceId: id,
    rawMaterialId: x.rawMaterialId ?? null,
    finalProductId: x.finalProductId ?? null,
    quantity: Number(x.quantity),
    unitPrice: Number(x.unitPrice),
    salePrice: x.salePrice != null ? Number(x.salePrice) : null,
    warehouseId: x.warehouseId ?? null,
    lineTotal: Number((Number(x.quantity) * Number(x.unitPrice)).toFixed(2)),
  }));
  const totalAmount = Number(
    (
      items.reduce((acc, x) => acc + Number(x.lineTotal), 0) + Number(input.extraCosts || 0)
    ).toFixed(2),
  );
  const invoiceRow = {
    id,
    restaurantId: input.restaurantId,
    supplierId: input.supplierId,
    invoiceNumber: input.invoiceNumber.trim(),
    purchaseDate: input.purchaseDate,
    status: 'pending_approval',
    localSyncStatus: 'pending',
    syncError: null as string | null,
    serverInvoiceId: null as number | null,
    extraCosts: Number(input.extraCosts || 0),
    totalAmount,
    createdAt: now,
    updatedAt: now,
  };
  await accountingDb.purchaseInvoices.put(invoiceRow);
  await accountingDb.purchaseInvoiceItems.bulkPut(items);
  return { invoice: invoiceRow, items };
}

export async function getPendingPurchaseInvoiceDrafts(restaurantId: number, limit = 50) {
  return accountingDb.purchaseInvoices
    .where('[restaurantId+localSyncStatus]')
    .anyOf([
      [restaurantId, 'pending'],
      [restaurantId, 'failed'],
    ])
    .limit(limit)
    .toArray();
}

export async function getPurchaseInvoiceItemsByInvoiceId(purchaseInvoiceId: number) {
  return accountingDb.purchaseInvoiceItems
    .where('purchaseInvoiceId')
    .equals(purchaseInvoiceId)
    .toArray();
}

export async function markPurchaseInvoiceSyncState(
  purchaseInvoiceId: number,
  patch: {
    localSyncStatus: 'pending' | 'syncing' | 'synced' | 'failed';
    syncError?: string | null;
    serverInvoiceId?: number | null;
  },
) {
  await accountingDb.purchaseInvoices.update(purchaseInvoiceId, {
    ...patch,
    updatedAt: new Date().toISOString(),
  });
}

export async function updatePurchaseInvoiceDraftLocal(input: {
  invoiceId: number;
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
}) {
  const existing = await accountingDb.purchaseInvoices.get(input.invoiceId);
  if (!existing) return null;
  const now = new Date().toISOString();
  const lineItems = input.items.map((x) => ({
    id: nextLocalEntityId(),
    purchaseInvoiceId: input.invoiceId,
    rawMaterialId: x.rawMaterialId ?? null,
    finalProductId: x.finalProductId ?? null,
    quantity: Number(x.quantity),
    unitPrice: Number(x.unitPrice),
    salePrice: x.salePrice != null ? Number(x.salePrice) : null,
    warehouseId: x.warehouseId ?? null,
    lineTotal: Number((Number(x.quantity) * Number(x.unitPrice)).toFixed(2)),
  }));
  const totalAmount = Number(
    (
      lineItems.reduce((acc, x) => acc + Number(x.lineTotal), 0) + Number(input.extraCosts || 0)
    ).toFixed(2),
  );
  await accountingDb.purchaseInvoiceItems
    .where('purchaseInvoiceId')
    .equals(input.invoiceId)
    .delete();
  await accountingDb.purchaseInvoiceItems.bulkPut(lineItems);

  const nextInvoice = {
    ...existing,
    supplierId: input.supplierId,
    invoiceNumber: input.invoiceNumber.trim(),
    purchaseDate: input.purchaseDate,
    extraCosts: Number(input.extraCosts || 0),
    totalAmount,
    localSyncStatus: 'pending',
    syncError: null as string | null,
    updatedAt: now,
  };
  await accountingDb.purchaseInvoices.put(nextInvoice);
  return { invoice: nextInvoice, items: lineItems };
}

export async function createFinalProductLocal(input: {
  restaurantId: number;
  name: string;
  productId?: number;
}) {
  const id = nextLocalEntityId();
  const now = new Date().toISOString();
  const row = {
    id,
    restaurantId: input.restaurantId,
    name: input.name.trim(),
    productId: input.productId ?? null,
    barcode: null,
    salePrice: 0,
    isActive: true,
    currentStock: 0,
    createdAt: now,
    updatedAt: now,
  };
  await accountingDb.finalProducts.put(row);
  await enqueueAccountingOperation({
    localOpId: nextOpId(),
    restaurantId: input.restaurantId,
    entityType: 'final_product',
    entityId: String(id),
    operationType: 'create',
    payload: row,
    version: 1,
    clientUpdatedAt: now,
  });
  return row;
}

/**
 * وقتی یک محصول منوی ساخته‌شده آفلاین واقعاً sync می‌شود، temp ID منفی‌اش
 * (مثلاً ‎-1781108301585‎) با یک ID واقعی سرور جایگزین می‌شود (catalogLocalDb →
 * resolveProductTempId). اما اگر قبل از آن sync، یک «محصول نهایی» حسابداری
 * (FinalProduct) با ‎productId = همان temp ID منفی‎ ساخته و در صف ارسال
 * گذاشته شده باشد (مثلاً از فاکتور خرید)، آن رکورد محلی و payload عملیات
 * سینکش برای همیشه به temp ID اشاره می‌کند — چون چیزی این مقدار را اصلاح
 * نمی‌کند. سرور چنین مقداری را اصلاً نمی‌شناسد (هرگز در جدول product وجود
 * نداشته) و چون ستون product_id از نوع integer است، حتی قبل از رسیدن به
 * خطای FK، با خطای «out of range for type integer» رد می‌شود — و «تلاش
 * مجدد» تا ابد همین خطا را تکرار می‌کند چون payload هیچ‌وقت اصلاح نمی‌شود.
 *
 * این تابع بعد از resolveProductTempId صدا زده می‌شود تا temp ID را در
 * رکوردهای FinalProduct و در payload عملیات سینک pending/failed مربوطه با
 * ID واقعی جایگزین کند و آن عملیات را برای ارسال دوباره به pending برگرداند.
 */
export async function resolveFinalProductTempProductId(
  tempProductId: number,
  realProductId: number,
): Promise<void> {
  const affected = await accountingDb.finalProducts
    .where('productId')
    .equals(tempProductId)
    .toArray();
  await Promise.all(
    affected.map((fp) =>
      accountingDb.finalProducts.update(fp.id, {
        productId: realProductId,
        updatedAt: new Date().toISOString(),
      }),
    ),
  );

  const ops = await accountingDb.syncOperations
    .where('entityType')
    .equals('final_product')
    .toArray();
  const now = new Date().toISOString();
  await Promise.all(
    ops
      .filter((op) => Number(op.payload?.productId) === tempProductId)
      .map((op) =>
        accountingDb.syncOperations.update(op.id!, {
          payload: { ...op.payload, productId: realProductId },
          status: 'pending',
          retryCount: 0,
          errorMessage: undefined,
          updatedAt: now,
        }),
      ),
  );
}

/** پیدا کردن یا ساختن FinalProduct حسابداری برای یک محصول منو */
export async function getOrCreateFinalProductByProductId(
  restaurantId: number,
  menuProductId: number,
  name: string,
): Promise<number> {
  const results = await accountingDb.finalProducts
    .where('productId')
    .equals(menuProductId)
    .toArray();
  const existing = results.find((fp) => fp.restaurantId === restaurantId);
  if (existing) return existing.id;
  const newFp = await createFinalProductLocal({ restaurantId, name, productId: menuProductId });
  return newFp.id;
}

/**
 * نقشه‌ای از productId (محصول منو) → currentStock (موجودی محصول نهایی) می‌سازد.
 * فقط ردیف‌هایی که productId دارند و به این رستوران تعلق دارند در نظر گرفته می‌شوند.
 * برای نمایش موجودی هر محصول در لیست محصولات استفاده می‌شود.
 */
export async function getFinalProductStockByProductId(
  restaurantId: number,
): Promise<Map<number, number>> {
  const rows = await accountingDb.finalProducts
    .where('restaurantId')
    .equals(restaurantId)
    .toArray();
  const map = new Map<number, number>();
  for (const fp of rows) {
    const pid = Number(fp.productId);
    if (!Number.isFinite(pid) || pid <= 0) continue;
    // اگر چند FinalProduct به یک productId وصل بودند، مجموع را نگه می‌داریم
    // (احتمالاً نباید چنین چیزی رخ دهد، ولی محافظ کار اضافه است).
    const stock = Number(fp.currentStock || 0);
    map.set(pid, (map.get(pid) ?? 0) + stock);
  }
  return map;
}

export async function deletePurchaseInvoiceDraftLocal(invoiceId: number) {
  const existing = await accountingDb.purchaseInvoices.get(invoiceId);
  if (!existing) return false;
  await accountingDb.purchaseInvoiceItems.where('purchaseInvoiceId').equals(invoiceId).delete();
  await accountingDb.purchaseInvoices.delete(invoiceId);
  return true;
}
