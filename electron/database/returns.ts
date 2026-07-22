import { app } from 'electron';
import * as path from 'path';
import * as fs from 'fs';

export interface OfflineReturn {
  id: number;
  returnData: any;
  token: string;
  createdAt: string;
  synced: boolean;
  syncedAt?: string;
  baseURL?: string;
}

const FILE_NAME = 'offline-returns.json';

const getDbPath = () => {
  try {
    return path.join(app.getPath('userData'), FILE_NAME);
  } catch {
    return path.join(process.cwd(), FILE_NAME);
  }
};

const readFromDisk = async (): Promise<OfflineReturn[]> => {
  const dbPath = getDbPath();
  try {
    const raw = await fs.promises.readFile(dbPath, 'utf-8');
    const data = JSON.parse(raw);
    return Array.isArray(data) ? data : [];
  } catch (error: any) {
    if (error?.code === 'ENOENT') {
      return [];
    }
    console.error('Failed to read offline returns:', error);
    return [];
  }
};

const writeToDisk = async (returns: OfflineReturn[]) => {
  const dbPath = getDbPath();
  const dir = path.dirname(dbPath);
  await fs.promises.mkdir(dir, { recursive: true });
  await fs.promises.writeFile(dbPath, JSON.stringify(returns, null, 2), 'utf-8');
};

// سریالایز کردن تمام عملیات read-modify-write روی فایل — بدون این قفل، دو نوشتن هم‌زمان
// (مثلاً ثبت مرجوعی آفلاین جدید هم‌زمان با sync شدن یک مرجوعی قبلی) می‌توانند یکدیگر را overwrite کنند.
let returnsLock: Promise<void> = Promise.resolve();
const withReturnsLock = <T>(fn: () => Promise<T>): Promise<T> => {
  const next = returnsLock.then(() => fn());
  returnsLock = next.then(() => {}, () => {});
  return next;
};

export async function saveOfflineReturn(returnData: any, token: string, baseURL?: string): Promise<number> {
  return withReturnsLock(async () => {
    const returns = await readFromDisk();
    const id = Date.now();
    returns.push({
      id,
      returnData,
      token,
      createdAt: new Date().toISOString(),
      synced: false,
      baseURL,
    });
    await writeToDisk(returns);
    return id;
  });
}

export async function getOfflineReturns(): Promise<OfflineReturn[]> {
  const returns = await readFromDisk();
  return returns.filter((r) => !r.synced);
}

export async function getAllReturns(): Promise<OfflineReturn[]> {
  const returns = await readFromDisk();
  return returns.sort((a, b) => (a.createdAt > b.createdAt ? -1 : 1));
}

export async function markReturnAsSynced(id: number): Promise<void> {
  return withReturnsLock(async () => {
    const returns = await readFromDisk();
    const index = returns.findIndex((r) => r.id === id);
    if (index >= 0) {
      returns[index].synced = true;
      returns[index].syncedAt = new Date().toISOString();
      await writeToDisk(returns);
    }
  });
}

export async function deleteReturn(id: number): Promise<void> {
  return withReturnsLock(async () => {
    const returns = await readFromDisk();
    const filtered = returns.filter((r) => r.id !== id);
    if (filtered.length !== returns.length) {
      await writeToDisk(filtered);
    }
  });
}
