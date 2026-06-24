import {
  bulkUpsertServerJobs,
  bulkUpsertServerJobItems,
  deleteStaleBoards,
  deleteStaleServerJobs,
  deleteOp,
  getLocalServiceJobItems,
  getPendingOpsGroupedByJob,
  getSjSyncMeta,
  markOpFailed,
  reassignJobLocalId,
  setSjSyncMeta,
  upsertLocalServiceBoards,
  type LocalServiceBoard,
  type LocalServiceJobOp,
} from './serviceJobsLocalDb';
import {
  getServiceBoards,
  createServiceJobRemote,
  listServiceJobsRemote,
  updateServiceJobRemote,
  moveServiceJobStatusRemote,
  addServiceJobItemRemote,
  updateServiceJobItemRemote,
  removeServiceJobItemRemote,
  getServiceJobRemote,
} from './api';
import { serviceJobsDb } from './serviceJobsLocalDb';

/** برای صفحهٔ جزئیات: وقتی آنلاینیم، آخرین نسخهٔ پرونده (با آیتم‌ها/پیوست‌ها/تایم‌لاین) را از سرور می‌گیرد و محلی هم به‌روزرسانی می‌کند */
export async function refreshServiceJobDetail(jobId: number, restaurantId: number, token: string): Promise<any> {
  const serverJob = await getServiceJobRemote(jobId, restaurantId, token);
  await applyServerJobFields(jobId, serverJob);
  return serverJob;
}

export interface ServiceJobsSyncResult {
  isOnline: boolean;
  jobsPushed: number;
  jobsFailed: number;
  boardsPulled: number;
  jobsPulled: number;
}

export function resolveOnlineStatus(): Promise<boolean> {
  if (typeof window !== 'undefined' && window.electronAPI?.checkOnline) {
    return window.electronAPI.checkOnline();
  }
  return Promise.resolve(typeof navigator !== 'undefined' ? navigator.onLine : true);
}

async function concurrentMap<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = [];
  for (let i = 0; i < items.length; i += limit) {
    const chunk = items.slice(i, i + limit);
    const chunkResults = await Promise.all(chunk.map(fn));
    results.push(...chunkResults);
  }
  return results;
}

async function applyServerJobFields(jobId: number, serverJob: any): Promise<void> {
  await serviceJobsDb.serviceJobs.update(jobId, {
    boardId: Number(serverJob.board?.id ?? serverJob.board_id ?? 0) || undefined,
    boardName: serverJob.board?.name ?? undefined,
    statusId: serverJob.status?.id ?? serverJob.status_id ?? undefined,
    statusLabel: serverJob.status?.label ?? undefined,
    statusColor: serverJob.status?.color ?? undefined,
    statusCategory: serverJob.status?.category ?? undefined,
    jobNumber: serverJob.jobNumber ?? undefined,
    title: serverJob.title ?? undefined,
    customerId: serverJob.customer_id ?? undefined,
    customerName: serverJob.customerName ?? undefined,
    customerPhone: serverJob.customerPhone ?? undefined,
    assigneeId: serverJob.assignee_id ?? undefined,
    assigneeName: serverJob.assignee
      ? (`${serverJob.assignee.firstName ?? ''} ${serverJob.assignee.lastName ?? ''}`.trim() || serverJob.assignee.phone)
      : undefined,
    priority: serverJob.priority ?? undefined,
    dueDate: serverJob.dueDate ?? undefined,
    estimatedAmount: serverJob.estimatedAmount ?? undefined,
    finalAmount: serverJob.finalAmount ?? undefined,
    salesInvoiceId: serverJob.salesInvoiceId ?? undefined,
    formData: serverJob.formData ?? undefined,
    publicTrackingToken: serverJob.publicTrackingToken ?? undefined,
    publicTrackingCode: serverJob.publicTrackingCode ?? undefined,
    closedAt: serverJob.closedAt ?? undefined,
    updatedAt: serverJob.updatedAt ?? undefined,
  });
  if (Array.isArray(serverJob.items)) {
    await bulkUpsertServerJobItems(jobId, serverJob.items);
  }
}

/** پردازش ترتیبی صف عملیات یک پرونده؛ توقف در اولین شکست (حفظ ترتیب) */
async function pushJobOps(
  jobLocalId: number,
  ops: LocalServiceJobOp[],
  restaurantId: number,
  token: string,
): Promise<{ pushed: number; failed: number }> {
  let currentJobId = jobLocalId;
  let pushed = 0;
  let failed = 0;
  const itemIdMap = new Map<number, number>();

  for (const op of ops) {
    try {
      let serverJob: any;
      switch (op.opType) {
        case 'create': {
          serverJob = await createServiceJobRemote({ restaurantId, ...op.payload }, token);
          const realId = Number(serverJob.id);
          if (realId !== currentJobId) {
            await reassignJobLocalId(currentJobId, realId);
            currentJobId = realId;
          }
          break;
        }
        case 'update': {
          serverJob = await updateServiceJobRemote(currentJobId, restaurantId, op.payload, token);
          break;
        }
        case 'move': {
          serverJob = await moveServiceJobStatusRemote(currentJobId, restaurantId, op.payload.statusId, token);
          break;
        }
        case 'item_add': {
          const beforeIds = new Set(
            (await getLocalServiceJobItems(currentJobId)).filter((i) => i.id > 0).map((i) => i.id),
          );
          const { tempItemId, ...itemPayload } = op.payload;
          serverJob = await addServiceJobItemRemote(currentJobId, restaurantId, itemPayload, token);
          const newItem = (serverJob.items ?? []).find((it: any) => !beforeIds.has(Number(it.id)));
          if (newItem && tempItemId) itemIdMap.set(tempItemId, Number(newItem.id));
          break;
        }
        case 'item_update': {
          const itemId = itemIdMap.get(op.payload.itemId) ?? op.payload.itemId;
          const { itemId: _drop, ...itemPayload } = op.payload;
          serverJob = await updateServiceJobItemRemote(currentJobId, itemId, restaurantId, itemPayload, token);
          break;
        }
        case 'item_remove': {
          const itemId = itemIdMap.get(op.payload.itemId) ?? op.payload.itemId;
          serverJob = await removeServiceJobItemRemote(currentJobId, itemId, restaurantId, token);
          break;
        }
      }
      if (serverJob) await applyServerJobFields(currentJobId, serverJob);
      await deleteOp(op.id!);
      pushed++;
    } catch (e: any) {
      const raw = e?.response?.data?.message || e?.message || 'خطای سینک پرونده خدمت';
      const msg = Array.isArray(raw) ? raw.join('، ') : String(raw);
      await markOpFailed(op.id!, msg);
      failed++;
      break; // حفظ ترتیب: بقیه opهای همین پرونده پردازش نمی‌شوند تا این یکی حل شود
    }
  }
  return { pushed, failed };
}

// قفل سراسری: همهٔ فراخوان‌ها (مدیر پس‌زمینه + اقدامات کاربر) باید یک اجرای هم‌زمان را به اشتراک بگذارند
// تا روی صف عملیات هم‌پوشانی پیش نیاید (مثلاً ساخت دوبار یک پرونده روی سرور).
let syncInFlight: Promise<ServiceJobsSyncResult> | null = null;

export async function runServiceJobsSync(args: { restaurantId: number; token: string }): Promise<ServiceJobsSyncResult> {
  if (syncInFlight) return syncInFlight;
  syncInFlight = runServiceJobsSyncInternal(args);
  try {
    return await syncInFlight;
  } finally {
    syncInFlight = null;
  }
}

async function runServiceJobsSyncInternal(args: {
  restaurantId: number;
  token: string;
}): Promise<ServiceJobsSyncResult> {
  const { restaurantId, token } = args;

  const isOnline = await resolveOnlineStatus();
  if (!isOnline) {
    return { isOnline: false, jobsPushed: 0, jobsFailed: 0, boardsPulled: 0, jobsPulled: 0 };
  }

  let jobsPushed = 0;
  let jobsFailed = 0;
  let boardsPulled = 0;
  let jobsPulled = 0;

  // ─── PUSH: صف عملیات معلق، ترتیبی per-job، موازی بین پرونده‌ها ──────────────
  const grouped = await getPendingOpsGroupedByJob(restaurantId);
  const pushResults = await concurrentMap(Array.from(grouped.entries()), 3, ([jobLocalId, ops]) =>
    pushJobOps(jobLocalId, ops, restaurantId, token),
  );
  for (const r of pushResults) {
    jobsPushed += r.pushed;
    jobsFailed += r.failed;
  }

  // ─── PULL: boards (هر سینک) ─────────────────────────────────────────────
  try {
    const serverBoards = await getServiceBoards(restaurantId, token);
    const boards: LocalServiceBoard[] = serverBoards.map((b: any) => ({
      id: Number(b.id),
      restaurantId,
      name: b.name || '',
      icon: b.icon ?? null,
      color: b.color ?? null,
      statuses: Array.isArray(b.statuses)
        ? b.statuses.map((s: any) => ({
            id: Number(s.id),
            key: s.key || '',
            label: s.label || '',
            color: s.color || null,
            category: s.category || 'in_progress',
            isFinal: Boolean(s.isFinal),
            order: Number(s.order ?? 0),
            wipLimit: s.wipLimit ?? null,
            isVisibleToCustomer: Boolean(s.isVisibleToCustomer),
          }))
        : [],
      formFields: Array.isArray(b.formFields)
        ? b.formFields.map((f: any) => ({
            id: Number(f.id),
            key: f.key || '',
            label: f.label || '',
            fieldType: f.fieldType || 'text',
            required: Boolean(f.required),
            options: f.options ?? null,
            dependsOnKey: f.dependsOnKey ?? null,
            order: Number(f.order ?? 0),
            showOnCard: Boolean(f.showOnCard),
            showOnTracking: Boolean(f.showOnTracking),
          }))
        : [],
      cachedAt: new Date().toISOString(),
    }));
    await upsertLocalServiceBoards(boards);
    await deleteStaleBoards(restaurantId, boards.map((b) => b.id));
    boardsPulled = boards.length;
  } catch {
    // pull خطا داد — push را خراب نمی‌کند
  }

  // ─── PULL: jobs (تدریجی با watermark) ──────────────────────────────
  const jobsMetaKey = `service-jobs:lastPullAt:${restaurantId}`;
  const lastPullAt = await getSjSyncMeta(jobsMetaKey);
  const MS_1H = 60 * 60 * 1000;
  const needFullPull = !lastPullAt || Date.now() - new Date(lastPullAt).getTime() > MS_1H;

  if (needFullPull) {
    try {
      const LIMIT = 100;
      const first = await listServiceJobsRemote({ restaurantId, page: 1, limit: LIMIT }, token);
      const totalPages = Math.ceil(first.total / LIMIT);
      const remaining = await concurrentMap(
        Array.from({ length: Math.max(0, totalPages - 1) }, (_, i) => i + 2),
        3,
        (pg) => listServiceJobsRemote({ restaurantId, page: pg, limit: LIMIT }, token),
      );
      const allJobs = [first.data, ...remaining.map((r) => r.data)].flat();
      await bulkUpsertServerJobs(allJobs, restaurantId);
      await deleteStaleServerJobs(restaurantId, allJobs.map((j) => Number(j.id)));
      jobsPulled = allJobs.length;
      await setSjSyncMeta(jobsMetaKey, new Date().toISOString());
    } catch {
      // pull خطا داد
    }
  }

  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event('service-jobs:synced'));
  }

  return { isOnline: true, jobsPushed, jobsFailed, boardsPulled, jobsPulled };
}
