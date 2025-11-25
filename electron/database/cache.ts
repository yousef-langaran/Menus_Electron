import Dexie, { Table } from 'dexie';

export interface CachedMenu {
  id?: number;
  restaurantId: number;
  restaurantName: string;
  products: any[];
  categories: any[];
  cachedAt: Date;
  expiresAt: Date;
}

export interface CachedUser {
  id?: number;
  user: any;
  token: string;
  cachedAt: Date;
}

class CacheDatabase extends Dexie {
  menus!: Table<CachedMenu>;
  users!: Table<CachedUser>;

  constructor() {
    super('CacheDatabase');
    this.version(1).stores({
      menus: '++id, restaurantId, restaurantName, expiresAt',
      users: '++id, cachedAt',
    });
  }
}

const db = new CacheDatabase();

// Menu cache functions
export async function cacheMenu(restaurantId: number, restaurantName: string, products: any[], categories: any[]): Promise<void> {
  const expiresAt = new Date();
  expiresAt.setHours(expiresAt.getHours() + 24); // Cache for 24 hours

  await db.menus.put({
    restaurantId,
    restaurantName,
    products,
    categories,
    cachedAt: new Date(),
    expiresAt,
  });
}

export async function getCachedMenu(restaurantId?: number, restaurantName?: string): Promise<CachedMenu | undefined> {
  let menu: CachedMenu | undefined;

  if (restaurantId) {
    menu = await db.menus.where('restaurantId').equals(restaurantId).first();
  } else if (restaurantName) {
    menu = await db.menus.where('restaurantName').equals(restaurantName).first();
  }

  if (menu && menu.expiresAt > new Date()) {
    return menu;
  }

  if (menu) {
    await db.menus.delete(menu.id!);
  }

  return undefined;
}

export async function clearExpiredMenus(): Promise<void> {
  const now = new Date();
  await db.menus.where('expiresAt').below(now).delete();
}

// User cache functions
export async function cacheUser(user: any, token: string): Promise<void> {
  await db.users.clear();
  await db.users.add({
    user,
    token,
    cachedAt: new Date(),
  });
}

export async function getCachedUser(): Promise<CachedUser | undefined> {
  return await db.users.orderBy('cachedAt').reverse().first();
}

export async function clearUserCache(): Promise<void> {
  await db.users.clear();
}

