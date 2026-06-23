import Dexie, { type Table } from 'dexie';

export type ServiceJobSyncStatus = 'synced' | 'pending_create' | 'failed';

export type ServiceJobPriority = 'low' | 'medium' | 'high' | 'urgent';

export interface LocalBoardStatus {
  id: number;
  label: string;
  color: string | null;
  category: 'intake' | 'in_progress' | 'done' | 'cancelled';
  isFinal: boolean;
  sortOrder: number;
}

export interface LocalServiceBoard {
  id: number;
  restaurantId: number;
  name: string;
  description: string | null;
  statuses: LocalBoardStatus[];
  cachedAt: string;
}

export interface LocalServiceJob {
  id: number;           // server ID (positive) or temp ID (negative = offline)
  restaurantId: number;
  boardId: number;
  boardName: string | null;
  title: string;
  description: string | null;
  customerName: string | null;
  customerPhone: string | null;
  priority: ServiceJobPriority;
  statusId: number | null;
  statusLabel: string | null;
  statusColor: string | null;
  statusCategory: string | null;
  jobNumber: string | null;
  publicTrackingToken: string | null;
  salesInvoiceId: number | null;
  createdAt: string;
  updatedAt: string;
  _syncStatus: ServiceJobSyncStatus;
  _syncError: string | null;
}

export interface ServiceJobsSyncMeta {
  key: string;
  value: string;
}

export class MenusServiceJobsDb extends Dexie {
  serviceBoards!: Table<LocalServiceBoard, number>;
  serviceJobs!: Table<LocalServiceJob, number>;
  syncMeta!: Table<ServiceJobsSyncMeta, string>;

  constructor() {
    super('menus-service-jobs-db');
    this.version(1).stores({
      serviceBoards: 'id, restaurantId, cachedAt',
      serviceJobs: 'id, restaurantId, boardId, _syncStatus, createdAt',
      syncMeta: 'key',
    });
  }
}

export const serviceJobsDb = new MenusServiceJobsDb();

// ─── helpers ────────────────────────────────────────────────────────────────

function nextTempId(): number {
  return -(Date.now() + Math.floor(Math.random() * 1000));
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

// ─── service jobs ─────────────────────────────────────────────────────────────

export async function createServiceJobLocal(input: {
  restaurantId: number;
  boardId: number;
  boardName: string | null;
  title: string;
  description?: string;
  customerName?: string;
  customerPhone?: string;
  priority?: ServiceJobPriority;
  statusId?: number;
  statusLabel?: string;
  statusColor?: string;
  statusCategory?: string;
}): Promise<LocalServiceJob> {
  const now = new Date().toISOString();
  const row: LocalServiceJob = {
    id: nextTempId(),
    restaurantId: input.restaurantId,
    boardId: input.boardId,
    boardName: input.boardName ?? null,
    title: input.title.trim(),
    description: input.description?.trim() || null,
    customerName: input.customerName?.trim() || null,
    customerPhone: input.customerPhone?.trim() || null,
    priority: input.priority ?? 'medium',
    statusId: input.statusId ?? null,
    statusLabel: input.statusLabel ?? null,
    statusColor: input.statusColor ?? null,
    statusCategory: input.statusCategory ?? null,
    jobNumber: null,
    publicTrackingToken: null,
    salesInvoiceId: null,
    createdAt: now,
    updatedAt: now,
    _syncStatus: 'pending_create',
    _syncError: null,
  };
  await serviceJobsDb.serviceJobs.put(row);
  return row;
}

export async function getLocalServiceJobs(restaurantId: number): Promise<LocalServiceJob[]> {
  return serviceJobsDb.serviceJobs
    .where('restaurantId')
    .equals(restaurantId)
    .reverse()
    .sortBy('createdAt');
}

export async function getPendingServiceJobs(restaurantId: number): Promise<LocalServiceJob[]> {
  const all = await serviceJobsDb.serviceJobs.where('restaurantId').equals(restaurantId).toArray();
  return all.filter((j) => j._syncStatus === 'pending_create' || j._syncStatus === 'failed');
}

export async function resolveServiceJobTempId(tempId: number, serverJob: Partial<LocalServiceJob>): Promise<void> {
  const existing = await serviceJobsDb.serviceJobs.get(tempId);
  if (!existing) return;
  await serviceJobsDb.serviceJobs.delete(tempId);
  await serviceJobsDb.serviceJobs.put({
    ...existing,
    ...serverJob,
    _syncStatus: 'synced',
    _syncError: null,
  });
}

export async function markServiceJobFailed(id: number, error: string): Promise<void> {
  await serviceJobsDb.serviceJobs.update(id, { _syncStatus: 'failed', _syncError: error });
}

export async function bulkUpsertServerJobs(jobs: any[], restaurantId: number): Promise<void> {
  const pendingIds = new Set(
    (await serviceJobsDb.serviceJobs.where('restaurantId').equals(restaurantId).toArray())
      .filter((j) => j._syncStatus !== 'synced')
      .map((j) => j.id),
  );
  const rows: LocalServiceJob[] = jobs
    .filter((j) => !pendingIds.has(Number(j.id)))
    .map((j) => ({
      id: Number(j.id),
      restaurantId,
      boardId: Number(j.board?.id ?? j.boardId ?? 0),
      boardName: j.board?.name ?? null,
      title: j.title || '',
      description: j.description || null,
      customerName: j.customerName || null,
      customerPhone: j.customerPhone || null,
      priority: j.priority ?? 'medium',
      statusId: j.status?.id ?? null,
      statusLabel: j.status?.label ?? null,
      statusColor: j.status?.color ?? null,
      statusCategory: j.status?.category ?? null,
      jobNumber: j.jobNumber ?? null,
      publicTrackingToken: j.publicTrackingToken ?? null,
      salesInvoiceId: j.salesInvoiceId ?? null,
      createdAt: j.createdAt || new Date().toISOString(),
      updatedAt: j.updatedAt || new Date().toISOString(),
      _syncStatus: 'synced' as const,
      _syncError: null,
    }));
  if (rows.length > 0) await serviceJobsDb.serviceJobs.bulkPut(rows);
}

export async function deleteStaleServerJobs(restaurantId: number, serverIds: number[]): Promise<void> {
  const serverIdSet = new Set(serverIds);
  const local = await serviceJobsDb.serviceJobs.where('restaurantId').equals(restaurantId).toArray();
  const toDelete = local
    .filter((j) => j.id > 0 && !serverIdSet.has(j.id))
    .map((j) => j.id);
  if (toDelete.length) await serviceJobsDb.serviceJobs.bulkDelete(toDelete);
}

export async function getServiceJobsQueueStats(restaurantId: number): Promise<{ pendingCount: number; failedCount: number }> {
  const pending = await getPendingServiceJobs(restaurantId);
  return {
    pendingCount: pending.filter((j) => j._syncStatus === 'pending_create').length,
    failedCount: pending.filter((j) => j._syncStatus === 'failed').length,
  };
}
