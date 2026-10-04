import { SyncEntityType, LocalSyncOperationStatus, LocalSyncOperation } from './accountingDbTypes';
import { MenusAccountingDb, accountingDb } from './accountingDbCore';

export async function enqueueAccountingOperation(
  input: Omit<LocalSyncOperation, 'id' | 'status' | 'retryCount' | 'createdAt' | 'updatedAt'>,
): Promise<number> {
  const now = new Date().toISOString();
  return accountingDb.syncOperations.add({
    ...input,
    status: 'pending',
    retryCount: 0,
    createdAt: now,
    updatedAt: now,
  });
}

export async function getPendingAccountingOperations(
  restaurantId: number,
  limit = 200,
): Promise<LocalSyncOperation[]> {
  try {
    return await accountingDb.syncOperations
      .where('[restaurantId+status]')
      .anyOf([
        [restaurantId, 'pending'],
        [restaurantId, 'failed'],
      ])
      .limit(limit)
      .toArray();
  } catch {
    // Fallback for legacy IndexedDB schemas missing compound index.
    const rows = await accountingDb.syncOperations.toArray();
    return rows
      .filter(
        (row) =>
          row.restaurantId === restaurantId &&
          (row.status === 'pending' || row.status === 'failed'),
      )
      .slice(0, limit);
  }
}

export async function updateOperationSyncStatus(
  id: number,
  status: LocalSyncOperationStatus,
  patch?: Partial<LocalSyncOperation>,
) {
  await accountingDb.syncOperations.update(id, {
    ...patch,
    status,
    updatedAt: new Date().toISOString(),
  });
}

/**
 * حذف عملیات صف‌شده برای یک موجودیت که مستقیماً (بدون واسطه صف) با سرور سینک شده است —
 * مثلاً وقتی حین آنلاین بودن، علاوه بر ثبت local، یک درخواست مستقیم به سرور هم زده شده.
 * بدون این پاکسازی، عملیات صف‌شده دوباره توسط سینک پس‌زمینه (AccountingSyncManager) ارسال
 * می‌شود و چون entityId آن یک id موقت محلی است، سرور یک رکورد تکراری واقعی می‌سازد
 * (برای دسته‌بندی‌ها) یا برای همیشه با خطای اعتبارسنجی شکست می‌خورد (برای هزینه‌های عملیاتی
 * که fiscalYearId در payload قدیمی موجود نیست).
 */
export async function cancelPendingSyncOp(
  entityType: SyncEntityType,
  entityId: string,
): Promise<void> {
  const ops = await accountingDb.syncOperations
    .where('entityType')
    .equals(entityType)
    .filter((op) => op.entityId === entityId && op.status !== 'synced')
    .toArray();
  if (ops.length) {
    await accountingDb.syncOperations.bulkDelete(
      ops.map((op) => op.id!).filter((id) => id !== undefined),
    );
  }
}

/**
 * وقتی یک صفحه (مثل ثبت هزینه) علاوه بر صف‌کردن عملیات، بلافاصله هم یک درخواست
 * مستقیم به سرور می‌زند، باید عملیات صف‌شده را قبل از شروع آن درخواست از حالت
 * 'pending' خارج کند — وگرنه سینک پس‌زمینه (AccountingSyncManager، هر ۳۰ ثانیه یا
 * روی رویداد focus/online) ممکن است دقیقاً در همان بازه، همان عملیات را هم پوش کند
 * و روی سرور یک رکورد تکراری واقعی بسازد. این تابع عملیات‌های 'pending' مطابق را
 * موقتاً به 'syncing' می‌برد تا getPendingAccountingOperations آن‌ها را انتخاب نکند.
 */
export async function markPendingSyncOpsInFlight(
  entityType: SyncEntityType,
  entityId: string,
): Promise<void> {
  const ops = await accountingDb.syncOperations
    .where('entityType')
    .equals(entityType)
    .filter((op) => op.entityId === entityId && op.status === 'pending')
    .toArray();
  const now = new Date().toISOString();
  await Promise.all(
    ops.map((op) =>
      accountingDb.syncOperations.update(op.id!, { status: 'syncing', updatedAt: now }),
    ),
  );
}

/** اگر درخواست مستقیم بالا شکست خورد، عملیات صف‌شده را برای تلاش مجدد توسط سینک پس‌زمینه برگردان. */
export async function restorePendingSyncOps(
  entityType: SyncEntityType,
  entityId: string,
): Promise<void> {
  const ops = await accountingDb.syncOperations
    .where('entityType')
    .equals(entityType)
    .filter((op) => op.entityId === entityId && op.status === 'syncing')
    .toArray();
  const now = new Date().toISOString();
  await Promise.all(
    ops.map((op) =>
      accountingDb.syncOperations.update(op.id!, { status: 'pending', updatedAt: now }),
    ),
  );
}

/**
 * بعد از اینکه یک عملیات 'create' که فقط از طریق صف پس‌زمینه (بدون درخواست مستقیم)
 * سینک شده موفق شد، رکورد محلیِ با id موقت (temp، از nextLocalEntityId) را حذف کن.
 * سرور در پاسخ push، entityId موقت خودِ کلاینت را echo می‌کند نه id واقعی سرور —
 * پس هیچ راهی برای جایگزینی آن رکورد وجود ندارد. اگر حذفش نکنیم، pull بعدی همان
 * چرخه، نسخه‌ی سرور را با id واقعی اضافه می‌کند و رکورد موقت هم برای همیشه کنارش
 * باقی می‌ماند — دقیقاً همان باگِ «بعد از رفرش دوتا نشون می‌دهد».
 */
export async function deleteLocalTempEntity(
  entityType: SyncEntityType,
  entityId: string,
): Promise<void> {
  const tableName = mapCollectionName(entityType);
  const table = accountingDb.table<any, any>(tableName as string);
  const numericId = Number(entityId);
  if (!Number.isFinite(numericId)) return;
  await table.delete(numericId);
}

function mapCollectionName(entityType: SyncEntityType): keyof MenusAccountingDb {
  switch (entityType) {
    case 'raw_material':
      return 'rawMaterials';
    case 'supplier':
      return 'suppliers';
    case 'final_product':
      return 'finalProducts';
    case 'recipe_item':
      return 'recipeItems';
    case 'cash_bank_account':
      return 'cashBankAccounts';
    case 'operational_expense':
      return 'operationalExpenses';
    case 'expense_category':
      return 'expenseCategories';
    case 'raw_material_category':
      return 'rawMaterialCategories';
    case 'purchase_return':
      return 'purchaseReturns';
    default:
      return 'rawMaterials';
  }
}

export async function upsertPulledEntities(entityType: SyncEntityType, rows: any[]) {
  if (!rows?.length) return;
  const tableName = mapCollectionName(entityType);
  const table = accountingDb.table<any, any>(tableName as string);

  // موجودیت‌های این ماژول همه id از نوع Postgres bigint دارند (برای این‌که id های
  // client-generated مثل Date.now() هم جا بشوند) — TypeORM چنین id هایی را به صورت
  // رشته سریالایز می‌کند، در حالی‌که رکوردهای ساخته‌شده محلی (nextLocalEntityId) از
  // نوع number هستند. اگر رشته همین‌طور در Dexie ذخیره شود، primary key آن رکورد با
  // نسخه‌ی number‌ی که بقیه‌ی کد (مثلاً Number(row.id) در حذف) انتظار دارد یکی نیست و
  // IndexedDB هیچ رکوردی پیدا نمی‌کند — دقیقاً همان باگ «حذف می‌کنم ولی تا رفرش نکنم
  // از لیست نمی‌رود». همه‌ی id ها را همین‌جا، قبل از ورود به Dexie، number می‌کنیم.
  const normalizedRows = rows.map((r) => (r && r.id != null ? { ...r, id: Number(r.id) } : r));

  // اگر کاربر همین الان رکوردی را حذف کرده و عملیات 'delete' آن هنوز در صف/در حال
  // ارسال است (سرور هنوز واقعاً حذفش نکرده)، این pull ممکن است همان رکوردِ قدیمی
  // را برگردانده باشد — دوباره درجش نکن. وگرنه حذف خوش‌بینانه‌ی محلی توسط همین
  // pull پس‌زمینه لغو می‌شود و کاربر تا رفرش بعدی دوباره همان رکورد را می‌بیند.
  const pendingDeletes = await accountingDb.syncOperations
    .where('entityType')
    .equals(entityType)
    .filter((op) => op.operationType === 'delete' && op.status !== 'synced')
    .toArray();
  const rowsToApply = pendingDeletes.length
    ? normalizedRows.filter((r) => !pendingDeletes.some((op) => op.entityId === String(r.id)))
    : normalizedRows;
  if (pendingDeletes.length && rowsToApply.length !== normalizedRows.length) {
    // لاگ تشخیصی موقت — برای ردیابی گزارش «هزینه‌ها یهو از پنل ویندوز محو می‌شوند».
    // اگر یک عملیات 'delete' برای همین entityId برای همیشه روی pending/failed گیر
    // کرده باشد (مثلاً چون حذف روی سرور رد شده)، این pull آن رکورد را برای همیشه
    // نادیده می‌گیرد — حتی اگر رکورد واقعاً هنوز روی سرور موجود باشد.
    console.warn(
      `[upsertPulledEntities] skipped ${normalizedRows.length - rowsToApply.length} "${entityType}" row(s) present on server due to a pending/failed local delete op`,
      {
        skippedIds: normalizedRows.filter((r) => !rowsToApply.includes(r)).map((r) => r.id),
        pendingDeleteOps: pendingDeletes.map((op) => ({
          entityId: op.entityId,
          status: op.status,
          retryCount: op.retryCount,
          errorMessage: op.errorMessage,
        })),
      },
    );
  }
  if (!rowsToApply.length) return;

  // داده‌های قدیمی (از قبل از فیکس بالا) ممکن است هنوز با id رشته‌ای در Dexie نشسته
  // باشند. اگر همان نسخه‌ی رشته‌ای هنوز هست، پاکش کن — وگرنه کنار نسخه‌ی number‌یِ
  // تازه به‌عنوان یک رکورد تکراریِ همیشگی باقی می‌ماند.
  const staleStringKeys = rowsToApply.map((r) => String(r.id));
  const staleExisting = await table.bulkGet(staleStringKeys);
  const staleKeysToDelete = staleStringKeys.filter((_, i) => staleExisting[i] != null);
  if (staleKeysToDelete.length) {
    await table.bulkDelete(staleKeysToDelete);
  }

  // برای final_product: اگر سرور productId نداشت (TypeORM relation بدون @Column مستقیم
  // این فیلد را در getMany() برنمی‌گرداند)، مقدار محلی موجود را حفظ کن.
  if (entityType === 'final_product') {
    const ids = rowsToApply.map((r) => r.id);
    const existingArr = await table.bulkGet(ids);
    const existingMap = new Map<any, any>();
    existingArr.forEach((e: any) => {
      if (e) existingMap.set(e.id, e);
    });
    const merged = rowsToApply.map((r) => {
      if (r.productId != null) return r;
      const local = existingMap.get(r.id);
      return local?.productId != null ? { ...r, productId: local.productId } : r;
    });
    await table.bulkPut(merged);
    return;
  }

  await table.bulkPut(rowsToApply);
}

/**
 * Merge server-pulled purchase invoices into the local Dexie table.
 * Avoids duplicates: if a local draft was already synced (serverInvoiceId == server.id),
 * update its status instead of inserting a second record.
 */
export async function upsertPulledInvoices(restaurantId: number, serverInvoices: any[]) {
  if (!serverInvoices?.length) return;

  // Build a map: serverInvoiceId → local Dexie record id
  const localRows = await accountingDb.purchaseInvoices
    .where('restaurantId')
    .equals(restaurantId)
    .toArray();
  const serverIdToLocalId = new Map<number, number>();
  for (const row of localRows) {
    if (row.serverInvoiceId != null) serverIdToLocalId.set(Number(row.serverInvoiceId), row.id);
  }

  const toInsert: any[] = [];
  for (const inv of serverInvoices) {
    const localId = serverIdToLocalId.get(Number(inv.id));
    if (localId != null) {
      // Already tracked as a local draft — just refresh mutable fields.
      await accountingDb.purchaseInvoices.update(localId, {
        status: inv.status,
        totalAmount: inv.totalAmount,
        supplierName: inv.supplierName,
        localSyncStatus: 'synced',
        updatedAt:
          typeof inv.updatedAt === 'string' ? inv.updatedAt : new Date(inv.updatedAt).toISOString(),
      });
    } else {
      toInsert.push({
        ...inv,
        localSyncStatus: 'synced',
        syncError: null,
        serverInvoiceId: Number(inv.id),
        updatedAt:
          typeof inv.updatedAt === 'string' ? inv.updatedAt : new Date(inv.updatedAt).toISOString(),
        createdAt:
          typeof inv.createdAt === 'string' ? inv.createdAt : new Date(inv.createdAt).toISOString(),
      });
    }
  }
  if (toInsert.length) await accountingDb.purchaseInvoices.bulkPut(toInsert);
}

export async function upsertPulledInvoiceItems(items: any[]) {
  if (!items?.length) return;
  await accountingDb.purchaseInvoiceItems.bulkPut(items);
}

export async function upsertPulledCheques(cheques: any[]) {
  if (!cheques?.length) return;
  await accountingDb.cheques.bulkPut(cheques);
}

export async function upsertPulledReceivables(receivables: any[]) {
  if (!receivables?.length) return;
  await accountingDb.customerReceivables.bulkPut(receivables);
}

export async function upsertPulledPurchaseReturns(returns: any[]) {
  if (!returns?.length) return;
  await accountingDb.purchaseReturns.bulkPut(returns);
}

export async function upsertPulledWarehouses(warehouses: any[]) {
  if (!warehouses?.length) return;
  await accountingDb.warehouses.bulkPut(warehouses);
}

export async function upsertPulledWarehouseTransfers(transfers: any[]) {
  if (!transfers?.length) return;
  await (accountingDb as any).warehouseTransfers.bulkPut(transfers);
}

export async function upsertPulledWarehouseStocks(stocks: any[]) {
  if (!stocks?.length) return;
  await accountingDb.warehouseStocks.bulkPut(stocks);
}

export async function getWarehouseStocksLocal(
  restaurantId: number,
  warehouseId?: number,
): Promise<any[]> {
  const query =
    warehouseId != null
      ? accountingDb.warehouseStocks.where('warehouseId').equals(warehouseId)
      : accountingDb.warehouseStocks.where('restaurantId').equals(restaurantId);
  return query.toArray();
}

export async function getDefaultWarehouseLocal(restaurantId: number): Promise<any | undefined> {
  return accountingDb.warehouses
    .where('restaurantId')
    .equals(restaurantId)
    .filter((w) => w.isDefault === true)
    .first();
}

export async function listWarehousesLocal(restaurantId: number): Promise<any[]> {
  return accountingDb.warehouses.where('restaurantId').equals(restaurantId).toArray();
}

export async function upsertPulledPurchaseReturnItems(items: any[]) {
  if (!items?.length) return;
  await accountingDb.purchaseReturnItems.bulkPut(items);
}

/**
 * Full-sync reconciliation: removes entities from local Dexie that the server no longer has.
 * Only deletes records that have no pending/failed local sync op (i.e. they're not awaiting push).
 */
export async function reconcileDeletedEntities(
  restaurantId: number,
  entityType: SyncEntityType,
  serverIds: Set<number>,
): Promise<number> {
  const tableName = mapCollectionName(entityType);
  const table = accountingDb.table<any, any>(tableName as string);

  const all = await accountingDb.syncOperations.toArray();
  const pendingEntityIds = new Set(
    all
      .filter(
        (op) =>
          op.restaurantId === restaurantId &&
          op.entityType === entityType &&
          (op.status === 'pending' || op.status === 'failed' || op.status === 'syncing'),
      )
      .map((op) => Number(op.entityId)),
  );

  const localRows = await table.where('restaurantId').equals(restaurantId).toArray();
  const idsToDelete = localRows
    .filter((r) => !serverIds.has(Number(r.id)) && !pendingEntityIds.has(Number(r.id)))
    .map((r) => r.id);

  if (idsToDelete.length) {
    // لاگ تشخیصی موقت — برای ردیابی گزارش «هزینه‌ها یهو از پنل ویندوز محو می‌شوند»
    // (سرور آن‌ها را دارد ولی پس از هر full sync پاک می‌شوند). بعد از رفع قطعی حذف شود.
    console.warn(
      `[reconcile] deleting ${idsToDelete.length} local "${entityType}" row(s) not present in server batch`,
      {
        restaurantId,
        deletedIds: idsToDelete,
        localCount: localRows.length,
        serverCount: serverIds.size,
      },
    );
    await table.bulkDelete(idsToDelete);
  }
  return idsToDelete.length;
}
