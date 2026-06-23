import {
  bulkUpsertServerJobs,
  deleteStaleBoards,
  deleteStaleServerJobs,
  getSjSyncMeta,
  getPendingServiceJobs,
  markServiceJobFailed,
  resolveServiceJobTempId,
  setSjSyncMeta,
  upsertLocalServiceBoards,
  type LocalServiceBoard,
} from './serviceJobsLocalDb';
import { getServiceBoards, createServiceJobRemote, listServiceJobsRemote } from './api';

export interface ServiceJobsSyncResult {
  isOnline: boolean;
  jobsPushed: number;
  jobsFailed: number;
  boardsPulled: number;
  jobsPulled: number;
}

function resolveOnlineStatus(): Promise<boolean> {
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

export async function runServiceJobsSync(args: {
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

  // ─── PUSH: pending jobs ────────────────────────────────────────────────────
  const pendingJobs = await getPendingServiceJobs(restaurantId);

  const pushResults = await concurrentMap(pendingJobs, 3, async (job) => {
    try {
      const serverJob = await createServiceJobRemote(
        {
          restaurantId,
          boardId: job.boardId,
          title: job.title,
          description: job.description ?? undefined,
          customerName: job.customerName ?? undefined,
          customerPhone: job.customerPhone ?? undefined,
          priority: job.priority,
          initialStatusId: job.statusId ?? undefined,
        },
        token,
      );
      await resolveServiceJobTempId(job.id, {
        id: Number(serverJob.id),
        jobNumber: serverJob.jobNumber ?? null,
        publicTrackingToken: serverJob.publicTrackingToken ?? null,
        statusId: serverJob.status?.id ?? null,
        statusLabel: serverJob.status?.label ?? null,
        statusColor: serverJob.status?.color ?? null,
        statusCategory: serverJob.status?.category ?? null,
        createdAt: serverJob.createdAt ?? job.createdAt,
        updatedAt: serverJob.updatedAt ?? job.updatedAt,
      });
      return { pushed: 1, failed: 0 };
    } catch (e: any) {
      const msg = e?.response?.data?.message || e?.message || 'خطای سینک پرونده';
      await markServiceJobFailed(job.id, msg);
      return { pushed: 0, failed: 1 };
    }
  });

  for (const r of pushResults) {
    jobsPushed += r.pushed;
    jobsFailed += r.failed;
  }

  // ─── PULL: boards (every sync) ─────────────────────────────────────────────
  try {
    const serverBoards = await getServiceBoards(restaurantId, token);
    const boards: LocalServiceBoard[] = serverBoards.map((b: any) => ({
      id: Number(b.id),
      restaurantId,
      name: b.name || '',
      description: b.description || null,
      statuses: Array.isArray(b.statuses)
        ? b.statuses.map((s: any) => ({
            id: Number(s.id),
            label: s.label || '',
            color: s.color || null,
            category: s.category || 'in_progress',
            isFinal: Boolean(s.isFinal),
            sortOrder: Number(s.sortOrder ?? 0),
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

  // ─── PULL: jobs (incremental with watermark) ──────────────────────────────
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

