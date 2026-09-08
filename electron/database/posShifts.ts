import { app } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import { generateId } from '../storage/generateId';

export type OfflineShiftActionType = 'open' | 'close';

/**
 * صف آفلاین اکشن‌های شیفت صندوق — دقیقاً همان الگوی فایل JSON در orders.ts/returns.ts
 * (نه Dexie/`_syncStatus`، چون این‌جا هم مثل سفارش/مرجوعی یک نوشتنِ حیاتیِ صندوق‌دار
 * است که هرگز نباید به‌خاطر قطعی شبکه مسدود شود).
 *
 * برخلاف سفارش/مرجوعی، «بستن شیفت» به شناسهٔ سرورِ همان شیفت نیاز دارد. اگر شیفت
 * آفلاین باز شده باشد، این شناسه هنوز وجود ندارد — به همین دلیل هر اکشن با
 * `clientShiftKey` (idempotency key سمت کلاینت، مطابق OpenShiftDto در Menus_BE)
 * مرتبط می‌شود و `serverShiftId` بعد از sync موفقِ «باز کردن» توسط
 * `resolveServerShiftIdForKey` روی رکورد «بستن» متناظر پر می‌شود (رجوع کنید به
 * `syncOfflinePosShifts` در services/sync.ts).
 */
export interface OfflineShiftAction {
  id: number;
  type: OfflineShiftActionType;
  clientShiftKey: string;
  restaurantId: number;
  /** برای open: بدنهٔ OpenShiftDto (بدون restaurantId/clientShiftKey که جدا نگه داشته می‌شوند)؛ برای close: بدنهٔ CloseShiftDto */
  payload: Record<string, unknown>;
  /** شناسهٔ سرور شیفت — برای open بعد از sync موفق پر می‌شود؛ برای close ممکن است از ابتدا مشخص باشد (شیفت آنلاین باز شده) یا بعداً resolve شود */
  serverShiftId: number | null;
  token: string;
  baseURL?: string;
  createdAt: string;
  synced: boolean;
  syncedAt?: string;
  lastError?: string;
}

const FILE_NAME = 'offline-pos-shifts.json';

const getDbPath = () => {
  try {
    return path.join(app.getPath('userData'), FILE_NAME);
  } catch {
    return path.join(process.cwd(), FILE_NAME);
  }
};

const readFromDisk = async (): Promise<OfflineShiftAction[]> => {
  const dbPath = getDbPath();
  try {
    const raw = await fs.promises.readFile(dbPath, 'utf-8');
    const data = JSON.parse(raw);
    return Array.isArray(data) ? data : [];
  } catch (error: any) {
    if (error?.code === 'ENOENT') {
      return [];
    }
    console.error('Failed to read offline pos-shift actions:', error);
    return [];
  }
};

const writeToDisk = async (actions: OfflineShiftAction[]) => {
  const dbPath = getDbPath();
  const dir = path.dirname(dbPath);
  await fs.promises.mkdir(dir, { recursive: true });
  await fs.promises.writeFile(dbPath, JSON.stringify(actions, null, 2), 'utf-8');
};

// سریالایز کردن تمام عملیات read-modify-write روی فایل — بدون این قفل، دو نوشتن هم‌زمان
// (مثلاً بستن شیفت هم‌زمان با sync شدن باز کردن همان شیفت) می‌توانند یکدیگر را overwrite کنند.
let shiftActionsLock: Promise<void> = Promise.resolve();
const withShiftActionsLock = <T>(fn: () => Promise<T>): Promise<T> => {
  const next = shiftActionsLock.then(() => fn());
  shiftActionsLock = next.then(() => {}, () => {});
  return next;
};

export async function saveOfflineShiftAction(
  action: Omit<OfflineShiftAction, 'id' | 'createdAt' | 'synced'>,
): Promise<number> {
  return withShiftActionsLock(async () => {
    const actions = await readFromDisk();
    const id = generateId();
    actions.push({
      ...action,
      id,
      createdAt: new Date().toISOString(),
      synced: false,
    });
    await writeToDisk(actions);
    return id;
  });
}

export async function getOfflineShiftActions(): Promise<OfflineShiftAction[]> {
  const actions = await readFromDisk();
  return actions.filter((a) => !a.synced);
}

export async function getAllShiftActions(): Promise<OfflineShiftAction[]> {
  const actions = await readFromDisk();
  return actions.sort((a, b) => (a.createdAt > b.createdAt ? -1 : 1));
}

export async function markShiftActionSynced(id: number, serverShiftId?: number): Promise<void> {
  return withShiftActionsLock(async () => {
    const actions = await readFromDisk();
    const index = actions.findIndex((a) => a.id === id);
    if (index >= 0) {
      actions[index].synced = true;
      actions[index].syncedAt = new Date().toISOString();
      if (typeof serverShiftId === 'number') {
        actions[index].serverShiftId = serverShiftId;
      }
      await writeToDisk(actions);
    }
  });
}

export async function markShiftActionError(id: number, message: string): Promise<void> {
  return withShiftActionsLock(async () => {
    const actions = await readFromDisk();
    const index = actions.findIndex((a) => a.id === id);
    if (index >= 0) {
      actions[index].lastError = message;
      await writeToDisk(actions);
    }
  });
}

/** بعد از sync موفقِ یک «باز کردن» — همهٔ «بستن»‌های در انتظارِ همان clientShiftKey را با شناسهٔ سرور پر می‌کند */
export async function resolveServerShiftIdForKey(clientShiftKey: string, serverShiftId: number): Promise<void> {
  return withShiftActionsLock(async () => {
    const actions = await readFromDisk();
    let changed = false;
    for (const a of actions) {
      if (a.clientShiftKey === clientShiftKey && a.serverShiftId == null) {
        a.serverShiftId = serverShiftId;
        changed = true;
      }
    }
    if (changed) await writeToDisk(actions);
  });
}

export async function deleteShiftAction(id: number): Promise<void> {
  return withShiftActionsLock(async () => {
    const actions = await readFromDisk();
    const filtered = actions.filter((a) => a.id !== id);
    if (filtered.length !== actions.length) {
      await writeToDisk(filtered);
    }
  });
}
