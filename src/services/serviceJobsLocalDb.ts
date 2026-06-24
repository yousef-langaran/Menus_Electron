import Dexie, { type Table } from 'dexie';

export type ServiceJobPriority = 'low' | 'normal' | 'high' | 'urgent';
export type ServiceStatusCategory = 'intake' | 'in_progress' | 'done' | 'cancelled';
export type ServiceFormFieldType =
  | 'text' | 'textarea' | 'number' | 'date' | 'select' | 'multiselect' | 'checkbox' | 'file' | 'phone';
export type ServiceJobItemType = 'product' | 'service' | 'labor';
export type ServiceJobOpType = 'create' | 'update' | 'move' | 'item_add' | 'item_update' | 'item_remove';
export type ServiceJobOpStatus = 'pending' | 'failed';

export interface LocalBoardStatus {
  id: number;
  key: string;
  label: string;
  color: string | null;
  category: ServiceStatusCategory;
  isFinal: boolean;
  order: number;
  wipLimit: number | null;
  isVisibleToCustomer: boolean;
}

export interface LocalFormField {
  id: number;
  key: string;
  label: string;
  fieldType: ServiceFormFieldType;
  required: boolean;
  /** آرایهٔ تخت وقتی مستقل است، یا { [parentValue]: string[] } وقتی dependsOnKey ست شده */
  options: string[] | Record<string, string[]> | null;
  /** کلید فیلد پدر (فقط select) */
  dependsOnKey?: string | null;
  order: number;
  showOnCard: boolean;
  showOnTracking: boolean;
}

export interface LocalServiceBoard {
  id: number;
  restaurantId: number;
  name: string;
  icon: string | null;
  color: string | null;
  statuses: LocalBoardStatus[];
  formFields: LocalFormField[];
  cachedAt: string;
}

export interface LocalServiceJob {
  id: number; // server id (positive) or temp id (negative = offline-created)
  restaurantId: number;
  boardId: number;
  boardName: string | null;
  statusId: number | null;
  statusLabel: string | null;
  statusColor: string | null;
  statusCategory: ServiceStatusCategory | null;
  jobNumber: string | null;
  title: string;
  customerId: number | null;
  customerName: string | null;
  customerPhone: string | null;
  assigneeId: number | null;
  assigneeName: string | null;
  priority: ServiceJobPriority;
  dueDate: string | null;
  estimatedAmount: number;
  finalAmount: number;
  salesInvoiceId: number | null;
  formData: Record<string, any> | null;
  publicTrackingToken: string | null;
  publicTrackingCode: string | null;
  closedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface LocalServiceJobItem {
  id: number; // server id or temp id
  jobId: number; // LocalServiceJob.id (temp or real)
  itemType: ServiceJobItemType;
  description: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
  deductFromInventory: boolean;
  createdAt: string;
}

export interface LocalServiceJobOp {
  id?: number;
  restaurantId: number;
  jobLocalId: number;
  seq: number;
  opType: ServiceJobOpType;
  payload: any;
  createdAt: string;
  status: ServiceJobOpStatus;
  error: string | null;
}

export interface ServiceJobsSyncMeta {
  key: string;
  value: string;
}

export class MenusServiceJobsDb extends Dexie {
  serviceBoards!: Table<LocalServiceBoard, number>;
  serviceJobs!: Table<LocalServiceJob, number>;
  serviceJobItems!: Table<LocalServiceJobItem, number>;
  serviceJobOps!: Table<LocalServiceJobOp, number>;
  syncMeta!: Table<ServiceJobsSyncMeta, string>;

  constructor() {
    super('menus-service-jobs-db');
    this.version(1).stores({
      serviceBoards: 'id, restaurantId, cachedAt',
      serviceJobs: 'id, restaurantId, boardId, _syncStatus, createdAt',
      syncMeta: 'key',
    });
    this.version(2)
      .stores({
        serviceBoards: 'id, restaurantId, cachedAt',
        serviceJobs: 'id, restaurantId, boardId, statusId, createdAt',
        serviceJobItems: 'id, jobId',
        serviceJobOps: '++id, restaurantId, jobLocalId, status, [jobLocalId+seq]',
        syncMeta: 'key',
      })
      .upgrade(async (tx) => {
        const jobsTable = tx.table('serviceJobs');
        const opsTable = tx.table('serviceJobOps');
        const jobs = await jobsTable.toArray();
        for (const j of jobs) {
          const patch: Record<string, any> = {};
          if (j.priority === 'medium') patch.priority = 'normal';
          if (Object.keys(patch).length) await jobsTable.update(j.id, patch);
          if (j._syncStatus === 'pending_create' || j._syncStatus === 'failed') {
            await opsTable.add({
              restaurantId: j.restaurantId,
              jobLocalId: j.id,
              seq: 0,
              opType: 'create',
              payload: {
                boardId: j.boardId,
                statusId: j.statusId,
                title: j.title,
                customerName: j.customerName ?? undefined,
                customerPhone: j.customerPhone ?? undefined,
                priority: patch.priority ?? j.priority,
                formData: j.description ? { description: j.description } : undefined,
              },
              createdAt: j.createdAt,
              status: 'pending',
              error: j._syncError ?? null,
            });
          }
        }
      });
  }
}

export const serviceJobsDb = new MenusServiceJobsDb();

// ─── helpers ────────────────────────────────────────────────────────────────

function nextTempId(): number {
  return -(Date.now() + Math.floor(Math.random() * 1000));
}

function nowIso(): string {
  return new Date().toISOString();
}

// ─── sync meta ──────────────────────────────────────────────────────────────

export async function getSjSyncMeta(key: string): Promise<string | null> {
  const row = await serviceJobsDb.syncMeta.get(key);
  return row?.value ?? null;
}

export async function setSjSyncMeta(key: string, value: string): Promise<void> {
  await serviceJobsDb.syncMeta.put({ key, value });
}

// ─── boards ─────────────────────────────────────────────────────────────────

export async function getLocalServiceBoards(restaurantId: number): Promise<LocalServiceBoard[]> {
  return serviceJobsDb.serviceBoards.where('restaurantId').equals(restaurantId).toArray();
}

export async function upsertLocalServiceBoards(boards: LocalServiceBoard[]): Promise<void> {
  if (boards.length > 0) await serviceJobsDb.serviceBoards.bulkPut(boards);
}

export async function deleteStaleBoards(restaurantId: number, serverIds: number[]): Promise<void> {
  const serverIdSet = new Set(serverIds);
  const local = await serviceJobsDb.serviceBoards.where('restaurantId').equals(restaurantId).toArray();
  const toDelete = local.filter((b) => !serverIdSet.has(b.id)).map((b) => b.id);
  if (toDelete.length) await serviceJobsDb.serviceBoards.bulkDelete(toDelete);
}

// ─── ops queue ──────────────────────────────────────────────────────────────

async function nextSeqForJob(jobLocalId: number): Promise<number> {
  const ops = await serviceJobsDb.serviceJobOps.where('jobLocalId').equals(jobLocalId).toArray();
  return ops.length ? Math.max(...ops.map((o) => o.seq)) + 1 : 0;
}

async function enqueueOp(restaurantId: number, jobLocalId: number, opType: ServiceJobOpType, payload: any): Promise<void> {
  const seq = await nextSeqForJob(jobLocalId);
  await serviceJobsDb.serviceJobOps.add({
    restaurantId,
    jobLocalId,
    seq,
    opType,
    payload,
    createdAt: nowIso(),
    status: 'pending',
    error: null,
  });
}

export async function getJobOpsState(jobLocalId: number): Promise<{ hasPending: boolean; hasFailed: boolean; errors: string[] }> {
  const ops = await serviceJobsDb.serviceJobOps.where('jobLocalId').equals(jobLocalId).toArray();
  return {
    hasPending: ops.some((o) => o.status === 'pending'),
    hasFailed: ops.some((o) => o.status === 'failed'),
    errors: ops.filter((o) => o.status === 'failed' && o.error).map((o) => o.error as string),
  };
}

/** Map<jobLocalId, {hasPending, hasFailed}> برای کل رستوران — برای نشان وضعیت روی کارت‌ها بدون N کوئری */
export async function getOpsStateMap(restaurantId: number): Promise<Map<number, { hasPending: boolean; hasFailed: boolean }>> {
  const ops = await serviceJobsDb.serviceJobOps.where('restaurantId').equals(restaurantId).toArray();
  const map = new Map<number, { hasPending: boolean; hasFailed: boolean }>();
  for (const op of ops) {
    const cur = map.get(op.jobLocalId) ?? { hasPending: false, hasFailed: false };
    if (op.status === 'pending') cur.hasPending = true;
    if (op.status === 'failed') cur.hasFailed = true;
    map.set(op.jobLocalId, cur);
  }
  return map;
}

export async function getPendingOpsGroupedByJob(restaurantId: number): Promise<Map<number, LocalServiceJobOp[]>> {
  const ops = await serviceJobsDb.serviceJobOps
    .where('restaurantId').equals(restaurantId)
    .and((o) => o.status === 'pending' || o.status === 'failed')
    .toArray();
  const grouped = new Map<number, LocalServiceJobOp[]>();
  for (const op of ops) {
    const list = grouped.get(op.jobLocalId) ?? [];
    list.push(op);
    grouped.set(op.jobLocalId, list);
  }
  for (const list of grouped.values()) list.sort((a, b) => a.seq - b.seq);
  return grouped;
}

export async function markOpFailed(opId: number, error: string): Promise<void> {
  await serviceJobsDb.serviceJobOps.update(opId, { status: 'failed', error });
}

export async function deleteOp(opId: number): Promise<void> {
  await serviceJobsDb.serviceJobOps.delete(opId);
}

export async function retryFailedOps(restaurantId: number): Promise<void> {
  await serviceJobsDb.serviceJobOps
    .where('restaurantId').equals(restaurantId)
    .and((o) => o.status === 'failed')
    .modify({ status: 'pending', error: null });
}

/** وقتی id موقت یک پرونده به id واقعی سرور resolve می‌شود، همه ارجاعات را به‌روزرسانی کن */
export async function reassignJobLocalId(oldId: number, newId: number): Promise<void> {
  await serviceJobsDb.transaction('rw', [serviceJobsDb.serviceJobs, serviceJobsDb.serviceJobItems, serviceJobsDb.serviceJobOps], async () => {
    const job = await serviceJobsDb.serviceJobs.get(oldId);
    if (job) {
      await serviceJobsDb.serviceJobs.delete(oldId);
      await serviceJobsDb.serviceJobs.put({ ...job, id: newId });
    }
    const items = await serviceJobsDb.serviceJobItems.where('jobId').equals(oldId).toArray();
    for (const it of items) {
      await serviceJobsDb.serviceJobItems.delete(it.id);
      await serviceJobsDb.serviceJobItems.put({ ...it, jobId: newId });
    }
    const ops = await serviceJobsDb.serviceJobOps.where('jobLocalId').equals(oldId).toArray();
    for (const op of ops) {
      await serviceJobsDb.serviceJobOps.update(op.id!, { jobLocalId: newId });
    }
  });
}

// ─── jobs ───────────────────────────────────────────────────────────────────

export async function getLocalServiceJobs(restaurantId: number, boardId?: number): Promise<LocalServiceJob[]> {
  let coll = serviceJobsDb.serviceJobs.where('restaurantId').equals(restaurantId);
  const all = await coll.toArray();
  return (boardId ? all.filter((j) => j.boardId === boardId) : all).sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );
}

export async function getLocalServiceJob(jobId: number): Promise<LocalServiceJob | undefined> {
  return serviceJobsDb.serviceJobs.get(jobId);
}

export async function createServiceJobLocal(input: {
  restaurantId: number;
  boardId: number;
  boardName: string | null;
  statusId: number;
  statusLabel?: string | null;
  statusColor?: string | null;
  statusCategory?: ServiceStatusCategory | null;
  title: string;
  customerName?: string | null;
  customerPhone?: string | null;
  customerId?: number | null;
  assigneeId?: number | null;
  assigneeName?: string | null;
  priority?: ServiceJobPriority;
  dueDate?: string | null;
  estimatedAmount?: number;
  formData?: Record<string, any> | null;
}): Promise<LocalServiceJob> {
  const now = nowIso();
  const id = nextTempId();
  const row: LocalServiceJob = {
    id,
    restaurantId: input.restaurantId,
    boardId: input.boardId,
    boardName: input.boardName,
    statusId: input.statusId,
    statusLabel: input.statusLabel ?? null,
    statusColor: input.statusColor ?? null,
    statusCategory: input.statusCategory ?? null,
    jobNumber: null,
    title: input.title.trim(),
    customerId: input.customerId ?? null,
    customerName: input.customerName?.trim() || null,
    customerPhone: input.customerPhone?.trim() || null,
    assigneeId: input.assigneeId ?? null,
    assigneeName: input.assigneeName ?? null,
    priority: input.priority ?? 'normal',
    dueDate: input.dueDate ?? null,
    estimatedAmount: input.estimatedAmount ?? 0,
    finalAmount: 0,
    salesInvoiceId: null,
    formData: input.formData ?? null,
    publicTrackingToken: null,
    publicTrackingCode: null,
    closedAt: null,
    createdAt: now,
    updatedAt: now,
  };
  await serviceJobsDb.serviceJobs.put(row);
  await enqueueOp(input.restaurantId, id, 'create', {
    boardId: input.boardId,
    statusId: input.statusId,
    title: row.title,
    customerName: row.customerName ?? undefined,
    customerPhone: row.customerPhone ?? undefined,
    assigneeId: row.assigneeId ?? undefined,
    priority: row.priority,
    dueDate: row.dueDate ?? undefined,
    estimatedAmount: row.estimatedAmount || undefined,
    formData: row.formData ?? undefined,
  });
  return row;
}

export async function updateServiceJobLocal(
  jobId: number,
  patch: {
    title?: string;
    customerName?: string | null;
    customerPhone?: string | null;
    priority?: ServiceJobPriority;
    dueDate?: string | null;
    estimatedAmount?: number;
    assigneeId?: number | null;
    assigneeName?: string | null;
  },
): Promise<void> {
  const job = await serviceJobsDb.serviceJobs.get(jobId);
  if (!job) return;
  const localPatch: Partial<LocalServiceJob> = { updatedAt: nowIso() };
  if (patch.title !== undefined) localPatch.title = patch.title;
  if (patch.customerName !== undefined) localPatch.customerName = patch.customerName;
  if (patch.customerPhone !== undefined) localPatch.customerPhone = patch.customerPhone;
  if (patch.priority !== undefined) localPatch.priority = patch.priority;
  if (patch.dueDate !== undefined) localPatch.dueDate = patch.dueDate;
  if (patch.estimatedAmount !== undefined) localPatch.estimatedAmount = patch.estimatedAmount;
  if (patch.assigneeId !== undefined) localPatch.assigneeId = patch.assigneeId;
  if (patch.assigneeName !== undefined) localPatch.assigneeName = patch.assigneeName;
  await serviceJobsDb.serviceJobs.update(jobId, localPatch);
  await enqueueOp(job.restaurantId, jobId, 'update', {
    title: patch.title,
    customerName: patch.customerName,
    customerPhone: patch.customerPhone,
    priority: patch.priority,
    dueDate: patch.dueDate,
    estimatedAmount: patch.estimatedAmount,
    assigneeId: patch.assigneeId,
  });
}

export async function moveServiceJobLocal(
  jobId: number,
  newStatus: { id: number; label: string; color: string | null; category: ServiceStatusCategory; isFinal: boolean },
): Promise<void> {
  const job = await serviceJobsDb.serviceJobs.get(jobId);
  if (!job) return;
  await serviceJobsDb.serviceJobs.update(jobId, {
    statusId: newStatus.id,
    statusLabel: newStatus.label,
    statusColor: newStatus.color,
    statusCategory: newStatus.category,
    closedAt: newStatus.isFinal ? nowIso() : null,
    updatedAt: nowIso(),
  });
  await enqueueOp(job.restaurantId, jobId, 'move', { statusId: newStatus.id });
}

export async function getPendingServiceJobsCount(restaurantId: number): Promise<{ pendingCount: number; failedCount: number }> {
  const ops = await serviceJobsDb.serviceJobOps.where('restaurantId').equals(restaurantId).toArray();
  const jobIds = new Set(ops.map((o) => o.jobLocalId));
  let pendingCount = 0;
  let failedCount = 0;
  for (const jobId of jobIds) {
    const jobOps = ops.filter((o) => o.jobLocalId === jobId);
    if (jobOps.some((o) => o.status === 'failed')) failedCount++;
    else if (jobOps.some((o) => o.status === 'pending')) pendingCount++;
  }
  return { pendingCount, failedCount };
}

export async function hasPendingOps(jobId: number): Promise<boolean> {
  const count = await serviceJobsDb.serviceJobOps.where('jobLocalId').equals(jobId).count();
  return count > 0;
}

export async function bulkUpsertServerJobs(jobs: any[], restaurantId: number): Promise<void> {
  const opsMap = await getOpsStateMap(restaurantId);
  const rows: LocalServiceJob[] = jobs
    .filter((j) => !opsMap.has(Number(j.id)))
    .map((j) => ({
      id: Number(j.id),
      restaurantId,
      boardId: Number(j.board?.id ?? j.board_id ?? 0),
      boardName: j.board?.name ?? null,
      statusId: j.status?.id ?? j.status_id ?? null,
      statusLabel: j.status?.label ?? null,
      statusColor: j.status?.color ?? null,
      statusCategory: j.status?.category ?? null,
      jobNumber: j.jobNumber ?? null,
      title: j.title || '',
      customerId: j.customer_id ?? null,
      customerName: j.customerName || null,
      customerPhone: j.customerPhone || null,
      assigneeId: j.assignee_id ?? null,
      assigneeName: j.assignee ? `${j.assignee.firstName ?? ''} ${j.assignee.lastName ?? ''}`.trim() || j.assignee.phone : null,
      priority: j.priority ?? 'normal',
      dueDate: j.dueDate ?? null,
      estimatedAmount: Number(j.estimatedAmount ?? 0),
      finalAmount: Number(j.finalAmount ?? 0),
      salesInvoiceId: j.salesInvoiceId ?? null,
      formData: j.formData ?? null,
      publicTrackingToken: j.publicTrackingToken ?? null,
      publicTrackingCode: j.publicTrackingCode ?? null,
      closedAt: j.closedAt ?? null,
      createdAt: j.createdAt || nowIso(),
      updatedAt: j.updatedAt || nowIso(),
    }));
  if (rows.length > 0) await serviceJobsDb.serviceJobs.bulkPut(rows);
}

export async function deleteStaleServerJobs(restaurantId: number, serverIds: number[]): Promise<void> {
  const serverIdSet = new Set(serverIds);
  const local = await serviceJobsDb.serviceJobs.where('restaurantId').equals(restaurantId).toArray();
  const toDelete = local.filter((j) => j.id > 0 && !serverIdSet.has(j.id)).map((j) => j.id);
  if (toDelete.length) await serviceJobsDb.serviceJobs.bulkDelete(toDelete);
}

// ─── job items (local) ──────────────────────────────────────────────────────

export async function getLocalServiceJobItems(jobId: number): Promise<LocalServiceJobItem[]> {
  return serviceJobsDb.serviceJobItems.where('jobId').equals(jobId).toArray();
}

export async function addServiceJobItemLocal(
  restaurantId: number,
  jobId: number,
  item: { itemType: ServiceJobItemType; description: string; quantity: number; unitPrice: number; deductFromInventory: boolean },
): Promise<LocalServiceJobItem> {
  const row: LocalServiceJobItem = {
    id: nextTempId(),
    jobId,
    itemType: item.itemType,
    description: item.description,
    quantity: item.quantity,
    unitPrice: item.unitPrice,
    lineTotal: Math.round(item.quantity * item.unitPrice),
    deductFromInventory: item.deductFromInventory,
    createdAt: nowIso(),
  };
  await serviceJobsDb.serviceJobItems.put(row);
  await enqueueOp(restaurantId, jobId, 'item_add', { tempItemId: row.id, ...item });
  return row;
}

export async function updateServiceJobItemLocal(
  restaurantId: number,
  jobId: number,
  itemId: number,
  item: { itemType: ServiceJobItemType; description: string; quantity: number; unitPrice: number; deductFromInventory: boolean },
): Promise<void> {
  await serviceJobsDb.serviceJobItems.update(itemId, {
    ...item,
    lineTotal: Math.round(item.quantity * item.unitPrice),
  });
  await enqueueOp(restaurantId, jobId, 'item_update', { itemId, ...item });
}

export async function removeServiceJobItemLocal(restaurantId: number, jobId: number, itemId: number): Promise<void> {
  await serviceJobsDb.serviceJobItems.delete(itemId);
  // اگر آیتم هنوز برای سرور ارسال نشده (id موقت)، فقط opهای مربوط به همان آیتم را از صف حذف کن
  if (itemId < 0) {
    const ops = await serviceJobsDb.serviceJobOps.where('jobLocalId').equals(jobId).toArray();
    for (const op of ops) {
      if ((op.opType === 'item_add' && op.payload?.tempItemId === itemId) || (op.opType === 'item_update' && op.payload?.itemId === itemId)) {
        await serviceJobsDb.serviceJobOps.delete(op.id!);
      }
    }
    return;
  }
  await enqueueOp(restaurantId, jobId, 'item_remove', { itemId });
}

export async function bulkUpsertServerJobItems(jobId: number, items: any[]): Promise<void> {
  const rows: LocalServiceJobItem[] = items.map((i) => ({
    id: Number(i.id),
    jobId,
    itemType: i.itemType,
    description: i.description,
    quantity: Number(i.quantity),
    unitPrice: Number(i.unitPrice),
    lineTotal: Number(i.lineTotal),
    deductFromInventory: Boolean(i.deductFromInventory),
    createdAt: i.createdAt || nowIso(),
  }));
  await serviceJobsDb.serviceJobItems.where('jobId').equals(jobId).delete();
  if (rows.length) await serviceJobsDb.serviceJobItems.bulkPut(rows);
}
