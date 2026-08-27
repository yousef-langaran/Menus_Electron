// ─── Permission Modules ───────────────────────────────────────────────────────

export const MODULES = {
  ORDERS_MANAGEMENT: 'orders_management',
  ORDERS_LIST: 'orders_list',
  PRODUCTS: 'products',
  CATEGORIES: 'categories',
  ACCOUNTING: 'accounting',
  PURCHASES: 'purchases',
  INVENTORY: 'inventory',
  ELECTRON_PANEL: 'electron_panel',
  PRINT_TEMPLATES: 'print_templates',
  SERVICE_JOBS: 'service_jobs',
  WAITER_CALLS: 'waiter_calls',
} as const;

export type ModuleKey = typeof MODULES[keyof typeof MODULES];

export const ACTIONS = {
  READ: 'read',
  CREATE: 'create',
  UPDATE: 'update',
  DELETE: 'delete',
  MANAGE: 'manage',
} as const;

export type ActionKey = typeof ACTIONS[keyof typeof ACTIONS];

// ─── User & Auth ──────────────────────────────────────────────────────────────

export interface RestaurantPermission {
  id: number;
  module: ModuleKey;
  actions: ActionKey[];
  isActive: boolean;
  restaurant?: {
    id: number;
    name: string;
    name_fa: string;
  };
}

export interface Restaurant {
  id: number;
  name: string;
  name_fa?: string;
}

export interface UserRole {
  title: 'restaurant_owner' | 'admin' | 'super_admin' | 'staff' | string;
}

export interface User {
  id: number;
  mobile: string;
  firstName?: string;
  lastName?: string;
  roles?: UserRole[];
  restaurants?: Restaurant[];
  restaurantPermissions?: RestaurantPermission[];
}

export interface Subscription {
  id: number;
  status: 'active' | 'expired' | 'trial' | string;
  expiresAt: string;
  startsAt: string;
  plan?: {
    id: number;
    name: string;
  };
}

// ─── Sync ─────────────────────────────────────────────────────────────────────

export type SyncStatus = 'synced' | 'pending_create' | 'pending_update' | 'failed';

// ─── Orders ───────────────────────────────────────────────────────────────────

export type OrderStatus =
  | 'pending'
  | 'confirmed'
  | 'preparing'
  | 'ready'
  | 'delivered'
  | 'cancelled';

export type ServiceType = 'dine_in' | 'takeaway' | 'delivery';

export type PaymentMethod = 'cash' | 'card' | 'online' | 'mixed' | 'credit';

export type DiscountType = 'fixed' | 'percentage' | 'code';
