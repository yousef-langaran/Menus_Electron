import { toShamsiDateTime } from '../../utils/date';

export const ORDERS_PAGE_SIZE = 20;
export const ORDERS_PAGE_SIZE_OPTIONS = [20, 50, 100];

export const STATUS_OPTIONS = [
  { value: 'all', label: 'همه وضعیت‌ها' },
  { value: 'pending', label: 'در انتظار' },
  { value: 'confirmed', label: 'تایید شده' },
  { value: 'preparing', label: 'در حال آماده‌سازی' },
  { value: 'ready', label: 'آماده تحویل' },
  { value: 'delivered', label: 'تحویل شده' },
  { value: 'cancelled', label: 'لغو شده' },
];

export const STATUS_LABELS: Record<string, string> = {
  pending: 'در انتظار',
  confirmed: 'تایید شده',
  preparing: 'در حال آماده‌سازی',
  ready: 'آماده تحویل',
  delivered: 'تحویل شده',
  cancelled: 'لغو شده',
};

export const formatPrice = (price?: number) =>
  typeof price === 'number' ? `${new Intl.NumberFormat('fa-IR').format(price)} ریال` : '-';

export const formatDate = (value?: string) => toShamsiDateTime(value);

export const DEFAULT_ONLINE_META = {
  page: 1,
  limit: ORDERS_PAGE_SIZE,
  offset: 0,
  total: 0,
  totalPages: 1,
  hasNextPage: false,
  hasPreviousPage: false,
};
