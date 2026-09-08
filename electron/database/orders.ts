import { app } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import { generateId } from '../storage/generateId';

export interface OfflineOrder {
  id: number;
  orderData: any;
  token: string;
  createdAt: string;
  synced: boolean;
  syncedAt?: string;
  baseURL?: string;
}

const FILE_NAME = 'offline-orders.json';

const getDbPath = () => {
  try {
    return path.join(app.getPath('userData'), FILE_NAME);
  } catch {
    return path.join(process.cwd(), FILE_NAME);
  }
};

const readOrdersFromDisk = async (): Promise<OfflineOrder[]> => {
  const dbPath = getDbPath();
  try {
    const raw = await fs.promises.readFile(dbPath, 'utf-8');
    const data = JSON.parse(raw);
    return Array.isArray(data) ? data : [];
  } catch (error: any) {
    if (error?.code === 'ENOENT') {
      return [];
    }
    console.error('Failed to read offline orders:', error);
    return [];
  }
};

const writeOrdersToDisk = async (orders: OfflineOrder[]) => {
  const dbPath = getDbPath();
  const dir = path.dirname(dbPath);
  await fs.promises.mkdir(dir, { recursive: true });
  await fs.promises.writeFile(dbPath, JSON.stringify(orders, null, 2), 'utf-8');
};

// سریالایز کردن تمام عملیات read-modify-write روی فایل — بدون این قفل، دو نوشتن هم‌زمان
// (مثلاً ثبت سفارش آفلاین جدید هم‌زمان با sync شدن یک سفارش قبلی) می‌توانند یکدیگر را overwrite کنند.
let ordersLock: Promise<void> = Promise.resolve();
const withOrdersLock = <T>(fn: () => Promise<T>): Promise<T> => {
  const next = ordersLock.then(() => fn());
  ordersLock = next.then(() => {}, () => {});
  return next;
};

export async function saveOfflineOrder(orderData: any, token: string, baseURL?: string): Promise<number> {
  return withOrdersLock(async () => {
    const orders = await readOrdersFromDisk();
    const id = generateId();
    orders.push({
      id,
      orderData,
      token,
      createdAt: new Date().toISOString(),
      synced: false,
      baseURL,
    });
    await writeOrdersToDisk(orders);
    return id;
  });
}

export async function getOfflineOrders(): Promise<OfflineOrder[]> {
  const orders = await readOrdersFromDisk();
  return orders.filter((order) => !order.synced);
}

export async function getAllOrders(): Promise<OfflineOrder[]> {
  const orders = await readOrdersFromDisk();
  return orders.sort((a, b) => (a.createdAt > b.createdAt ? -1 : 1));
}

export async function markOrderAsSynced(id: number): Promise<void> {
  return withOrdersLock(async () => {
    const orders = await readOrdersFromDisk();
    const index = orders.findIndex((order) => order.id === id);
    if (index >= 0) {
      orders[index].synced = true;
      orders[index].syncedAt = new Date().toISOString();
      await writeOrdersToDisk(orders);
    }
  });
}

export async function deleteOrder(id: number): Promise<void> {
  return withOrdersLock(async () => {
    const orders = await readOrdersFromDisk();
    const filtered = orders.filter((order) => order.id !== id);
    if (filtered.length !== orders.length) {
      await writeOrdersToDisk(filtered);
    }
  });
}

