import { api, apiConfigReady } from './apiBase';

// ─── فراخوان گارسون (پیجر نرم‌افزاری) ────────────────────────────────────────

export type WaiterCallType = 'waiter' | 'bill' | 'water' | 'cleaning' | 'order' | 'other';

export type WaiterCallStatus = 'pending' | 'accepted' | 'done' | 'cancelled' | 'expired';

export const WAITER_CALL_TYPE_LABELS: Record<WaiterCallType, string> = {
  waiter: 'صدا زدن گارسون',
  bill: 'درخواست صورتحساب',
  water: 'آب / نوشیدنی',
  cleaning: 'جمع‌آوری میز',
  order: 'آماده‌ام سفارش بدهم',
  other: 'درخواست دیگر',
};

export const WAITER_CALL_STATUS_LABELS: Record<WaiterCallStatus, string> = {
  pending: 'در انتظار پذیرش',
  accepted: 'پذیرفته شد',
  done: 'انجام شد',
  cancelled: 'لغو شد',
  expired: 'بی‌پاسخ ماند',
};

export interface WaiterCallRow {
  id: number;
  restaurant_id: number;
  tableName: string;
  type: WaiterCallType;
  typeLabel?: string;
  note: string | null;
  status: WaiterCallStatus;
  acceptedByName: string | null;
  acceptedAt: string | null;
  responseSeconds: number | null;
  createdAt: string;
}

/** فراخوان‌های باز (در انتظار یا پذیرفته‌شده) — قدیمی‌ترین اول */
export async function listActiveWaiterCalls(
  restaurantId: number,
  token: string,
): Promise<WaiterCallRow[]> {
  await apiConfigReady;
  const response = await api.get('/waiter-calls/active', {
    params: { restaurantId },
    headers: { Authorization: `Bearer ${token}` },
  });
  return Array.isArray(response.data) ? response.data : [];
}

export async function listWaiterCallHistory(
  restaurantId: number,
  token: string,
  limit = 50,
): Promise<WaiterCallRow[]> {
  await apiConfigReady;
  const response = await api.get('/waiter-calls', {
    params: { restaurantId, limit },
    headers: { Authorization: `Bearer ${token}` },
  });
  return Array.isArray(response.data) ? response.data : [];
}

/** پذیرش فراخوان — اولین نفر برنده است؛ نفر دوم خطای ۴۰۹ می‌گیرد */
export async function acceptWaiterCall(
  callId: number,
  restaurantId: number,
  token: string,
): Promise<WaiterCallRow> {
  await apiConfigReady;
  const response = await api.patch(
    `/waiter-calls/${callId}/accept`,
    {},
    { params: { restaurantId }, headers: { Authorization: `Bearer ${token}` } },
  );
  return response.data;
}

export async function completeWaiterCall(
  callId: number,
  restaurantId: number,
  token: string,
): Promise<WaiterCallRow> {
  await apiConfigReady;
  const response = await api.patch(
    `/waiter-calls/${callId}/complete`,
    {},
    { params: { restaurantId }, headers: { Authorization: `Bearer ${token}` } },
  );
  return response.data;
}

// ─── شیفت صندوق (باز/بستن، گزارش X/Z) ──────────────────────────────────────

export type PosShiftStatus = 'open' | 'closed';

export interface PosShiftRow {
  id: number;
  restaurantId: number;
  clientShiftKey: string | null;
  openedByUserId: number | null;
  closedByUserId: number | null;
  openingFloatAmount: number;
  countedCashAmount: number | null;
  expectedCashAmount: number | null;
  varianceAmount: number | null;
  status: PosShiftStatus;
  openingNotes: string | null;
  closingNotes: string | null;
  openedAt: string;
  closedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface OpenPosShiftPayload {
  restaurantId: number;
  openingFloatAmount: number;
  openingNotes?: string;
  /** کلید idempotency برای صف آفلاین — رجوع کنید به OpenShiftDto در Menus_BE */
  clientShiftKey?: string;
}

export interface ClosePosShiftPayload {
  countedCashAmount: number;
  closingNotes?: string;
}

export interface PosShiftPaymentMethodBreakdownRow {
  paymentMethod: string;
  salesCount: number;
  salesAmount: number;
  refundsCount: number;
  refundsAmount: number;
  netAmount: number;
}

export interface PosShiftReport {
  shiftId: number;
  restaurantId: number;
  type: 'x' | 'z';
  status: PosShiftStatus;
  openedAt: string;
  reportedThrough: string;
  openingFloatAmount: number;
  countedCashAmount: number | null;
  expectedCashAmount: number | null;
  varianceAmount: number | null;
  totals: {
    salesCount: number;
    salesAmount: number;
    refundsCount: number;
    refundsAmount: number;
    netAmount: number;
  };
  paymentMethodBreakdown: PosShiftPaymentMethodBreakdownRow[];
}

export async function openPosShift(
  payload: OpenPosShiftPayload,
  token: string,
): Promise<PosShiftRow> {
  await apiConfigReady;
  const response = await api.post('/pos-shifts/open', payload, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return response.data;
}

export async function closePosShift(
  shiftId: number,
  restaurantId: number,
  payload: ClosePosShiftPayload,
  token: string,
): Promise<PosShiftRow> {
  await apiConfigReady;
  const response = await api.post(`/pos-shifts/${shiftId}/close`, payload, {
    params: { restaurantId },
    headers: { Authorization: `Bearer ${token}` },
  });
  return response.data;
}

export async function getCurrentPosShift(
  restaurantId: number,
  token: string,
): Promise<PosShiftRow | null> {
  await apiConfigReady;
  const response = await api.get('/pos-shifts/current', {
    params: { restaurantId },
    headers: { Authorization: `Bearer ${token}` },
  });
  return response.data ?? null;
}

export async function listPosShifts(restaurantId: number, token: string): Promise<PosShiftRow[]> {
  await apiConfigReady;
  const response = await api.get('/pos-shifts', {
    params: { restaurantId },
    headers: { Authorization: `Bearer ${token}` },
  });
  return Array.isArray(response.data) ? response.data : [];
}

export async function getPosShiftReport(
  shiftId: number,
  restaurantId: number,
  type: 'x' | 'z',
  token: string,
): Promise<PosShiftReport> {
  await apiConfigReady;
  const response = await api.get(`/pos-shifts/${shiftId}/report`, {
    params: { restaurantId, type },
    headers: { Authorization: `Bearer ${token}` },
  });
  return response.data;
}

export async function cancelWaiterCall(
  callId: number,
  restaurantId: number,
  token: string,
  reason?: string,
): Promise<WaiterCallRow> {
  await apiConfigReady;
  const response = await api.patch(
    `/waiter-calls/${callId}/cancel`,
    { reason },
    { params: { restaurantId }, headers: { Authorization: `Bearer ${token}` } },
  );
  return response.data;
}
