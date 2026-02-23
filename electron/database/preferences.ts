import { app } from 'electron';
import * as path from 'path';
import * as fs from 'fs';

export type ReceiptNumberResetPolicy = 'never' | 'minutely' | 'daily' | 'weekly' | 'monthly';

export interface ReceiptNumberSettings {
  nextNumber: number;
  resetPolicy: ReceiptNumberResetPolicy;
  startNumber: number;
  lastResetDate: string;
  /** برای ریست روزانه: ساعت ریست به صورت "HH:mm" (مثلاً "06:00") */
  dailyResetTime: string;
}

const DEFAULT_RECEIPT_SETTINGS: ReceiptNumberSettings = {
  nextNumber: 1,
  resetPolicy: 'never',
  startNumber: 1,
  lastResetDate: '',
  dailyResetTime: '00:00',
};

interface PreferencesFile {
  userSession?: {
    user: any;
    token: string;
    cachedAt: string;
  };
  printerConfigs?: Record<string, any>;
  receiptNumberSettings?: ReceiptNumberSettings;
}

const FILE_NAME = 'menus-preferences.json';
const COUNTER_FILE_NAME = 'receipt-counter.json';
const RECEIPT_NUMBERS_MAP_FILE = 'receipt-numbers.json';

const getPreferencesPath = () => {
  try {
    return path.join(app.getPath('userData'), FILE_NAME);
  } catch {
    return path.join(process.cwd(), FILE_NAME);
  }
};

const getCounterPath = () => {
  try {
    return path.join(app.getPath('userData'), COUNTER_FILE_NAME);
  } catch {
    return path.join(process.cwd(), COUNTER_FILE_NAME);
  }
};

const getReceiptNumbersMapPath = () => {
  try {
    return path.join(app.getPath('userData'), RECEIPT_NUMBERS_MAP_FILE);
  } catch {
    return path.join(process.cwd(), RECEIPT_NUMBERS_MAP_FILE);
  }
};

interface ReceiptCounterFile {
  nextNumber: number;
  lastResetDate: string;
}

const readCounterFileSync = (): ReceiptCounterFile | null => {
  const filePath = getCounterPath();
  try {
    const raw = fs.readFileSync(filePath, 'utf-8');
    const data = JSON.parse(raw);
    if (data && typeof data.nextNumber === 'number') {
      return {
        nextNumber: Math.max(1, data.nextNumber),
        lastResetDate: typeof data.lastResetDate === 'string' ? data.lastResetDate : '',
      };
    }
  } catch (error: any) {
    if (error?.code !== 'ENOENT') console.warn('Read receipt counter failed:', error);
  }
  return null;
};

const writeCounterFileSync = (data: ReceiptCounterFile): void => {
  const filePath = getCounterPath();
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
};

const readCounterFile = async (): Promise<ReceiptCounterFile | null> => readCounterFileSync();
const writeCounterFile = async (data: ReceiptCounterFile): Promise<void> => {
  writeCounterFileSync(data);
};

let receiptNumberLock: Promise<void> = Promise.resolve();
const withReceiptNumberLock = <T>(fn: () => Promise<T>): Promise<T> => {
  const next = receiptNumberLock.then(() => fn());
  receiptNumberLock = next.then(() => {}, () => {});
  return next;
};

const readPreferences = async (): Promise<PreferencesFile> => {
  const filePath = getPreferencesPath();
  try {
    const raw = await fs.promises.readFile(filePath, 'utf-8');
    const data = JSON.parse(raw);
    return typeof data === 'object' && data ? data : {};
  } catch (error: any) {
    if (error?.code === 'ENOENT') {
      return {};
    }
    console.error('Failed to read preferences:', error);
    return {};
  }
};

const writePreferences = async (prefs: PreferencesFile) => {
  const filePath = getPreferencesPath();
  const dir = path.dirname(filePath);
  await fs.promises.mkdir(dir, { recursive: true });
  await fs.promises.writeFile(filePath, JSON.stringify(prefs, null, 2), 'utf-8');
};

export async function loadUserSession() {
  const prefs = await readPreferences();
  return prefs.userSession || null;
}

export async function saveUserSession(user: any, token: string) {
  const prefs = await readPreferences();
  prefs.userSession = { user, token, cachedAt: new Date().toISOString() };
  await writePreferences(prefs);
}

export async function clearUserSession() {
  const prefs = await readPreferences();
  if (prefs.userSession) {
    delete prefs.userSession;
    await writePreferences(prefs);
  }
}

export async function loadPrinterConfigs() {
  const prefs = await readPreferences();
  return prefs.printerConfigs || {};
}

export async function savePrinterConfigs(configs: Record<string, any>) {
  const prefs = await readPreferences();
  prefs.printerConfigs = configs || {};
  await writePreferences(prefs);
}

export async function loadReceiptNumberSettings(): Promise<ReceiptNumberSettings> {
  const [prefs, counter] = await Promise.all([readPreferences(), readCounterFile()]);
  const s = prefs.receiptNumberSettings;
  const dailyResetTime =
    s && typeof s.dailyResetTime === 'string' && /^\d{1,2}:\d{2}$/.test(s.dailyResetTime)
      ? s.dailyResetTime
      : '00:00';
  const base = s && typeof s.nextNumber === 'number'
    ? {
        resetPolicy: ['never', 'minutely', 'daily', 'weekly', 'monthly'].includes(s.resetPolicy) ? s.resetPolicy : 'never',
        startNumber: Math.max(1, typeof s.startNumber === 'number' ? s.startNumber : 1),
        dailyResetTime,
      }
    : { ...DEFAULT_RECEIPT_SETTINGS, dailyResetTime: '00:00' };
  return {
    ...base,
    nextNumber: counter ? counter.nextNumber : (s?.nextNumber ?? DEFAULT_RECEIPT_SETTINGS.nextNumber),
    lastResetDate: counter ? counter.lastResetDate : (typeof s?.lastResetDate === 'string' ? s.lastResetDate : ''),
  };
}

export async function saveReceiptNumberSettings(settings: ReceiptNumberSettings) {
  const prefs = await readPreferences();
  prefs.receiptNumberSettings = settings;
  await writePreferences(prefs);

  const current = readCounterFileSync();
  const currentNext = current?.nextNumber ?? 1;
  const lastReset = typeof settings.lastResetDate === 'string' ? settings.lastResetDate : (current?.lastResetDate ?? '');
  const requestedNext = typeof settings.nextNumber === 'number' && settings.nextNumber >= 1 ? settings.nextNumber : null;
  const requestedStart = typeof settings.startNumber === 'number' && settings.startNumber >= 1 ? settings.startNumber : null;
  const newNext = Math.max(currentNext, requestedNext ?? 0, requestedStart ?? 0);
  if (newNext >= currentNext) {
    writeCounterFileSync({ nextNumber: newNext, lastResetDate: lastReset });
  }
}

function todayDateString(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** روز مجازی برای فیش (با توجه به ساعت ریست روزانه). مثلاً اگر ریست 06:00 باشد، از 06:00 امروز تا 05:59 فردا یک روز است. */
function getReceiptDayKey(now: Date, timeStr: string): string {
  const [h = 0, m = 0] = timeStr.split(':').map((x) => parseInt(x, 10) || 0);
  const d = new Date(now);
  if (d.getHours() < h || (d.getHours() === h && d.getMinutes() < m)) {
    d.setDate(d.getDate() - 1);
  }
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** کلید دوره جاری برای ریست هفتگی (دوشنبه همان هفته به صورت YYYY-MM-DD) */
function getWeekKey(now: Date): string {
  const d = new Date(now);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** کلید دوره جاری برای ریست ماهانه (YYYY-MM) */
function getMonthKey(now: Date): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

/** کلید دوره برای ریست هر دقیقه (فقط برای تست) — YYYY-MM-DD-HH-mm */
function getMinuteKey(now: Date): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}-${String(now.getHours()).padStart(2, '0')}-${String(now.getMinutes()).padStart(2, '0')}`;
}

/** کلید یکتا برای دورهٔ فعلی بر اساس سیاست ریست (برای مقایسه و ذخیرهٔ lastResetDate) */
function getCurrentPeriodKey(
  policy: ReceiptNumberResetPolicy,
  now: Date,
  dailyResetTime: string,
): string {
  if (policy === 'minutely') return getMinuteKey(now);
  if (policy === 'daily') return getReceiptDayKey(now, dailyResetTime);
  if (policy === 'weekly') return getWeekKey(now);
  if (policy === 'monthly') return getMonthKey(now);
  return todayDateString();
}

function shouldReset(
  lastResetDate: string,
  policy: ReceiptNumberResetPolicy,
  dailyResetTime: string = '00:00',
): boolean {
  if (policy === 'never') return false;
  const now = new Date();
  const currentKey = getCurrentPeriodKey(policy, now, dailyResetTime);
  if (!lastResetDate) return false;
  return lastResetDate !== currentKey;
}

export async function getNextReceiptNumber(): Promise<number> {
  return withReceiptNumberLock(async () => {
    const prefs = await readPreferences();
    const counter = readCounterFileSync();
    const s = prefs.receiptNumberSettings;
    const policy = s && ['never', 'minutely', 'daily', 'weekly', 'monthly'].includes(s.resetPolicy) ? s.resetPolicy : 'never';
    const startNumber = Math.max(1, s && typeof s.startNumber === 'number' ? s.startNumber : 1);
    const dailyResetTime =
      s && typeof s.dailyResetTime === 'string' && /^\d{1,2}:\d{2}$/.test(s.dailyResetTime) ? s.dailyResetTime : '00:00';

    const lastReset = counter ? counter.lastResetDate : '';
    const now = new Date();
    const receiptDayKey = policy === 'daily' ? getReceiptDayKey(now, dailyResetTime) : todayDateString();
    const needReset = shouldReset(lastReset, policy, dailyResetTime);
    const next = needReset ? startNumber : (counter ? counter.nextNumber : startNumber);

    const numberToUse = Math.max(1, next);
    const newNextNumber = numberToUse + 1;
    const currentPeriodKey = getCurrentPeriodKey(policy, now, dailyResetTime);
    writeCounterFileSync({ nextNumber: newNextNumber, lastResetDate: currentPeriodKey });
    return numberToUse;
  });
}

/** شماره فیش بعدی را بدون مصرف کردن برمی‌گرداند (برای پیش‌نمایش) */
export async function getNextReceiptNumberPreview(): Promise<number> {
  const prefs = await readPreferences();
  const counter = readCounterFileSync();
  const s = prefs.receiptNumberSettings;
  const policy = s && ['never', 'minutely', 'daily', 'weekly', 'monthly'].includes(s.resetPolicy) ? s.resetPolicy : 'never';
  const startNumber = Math.max(1, s && typeof s.startNumber === 'number' ? s.startNumber : 1);
  const dailyResetTime =
    s && typeof s.dailyResetTime === 'string' && /^\d{1,2}:\d{2}$/.test(s.dailyResetTime) ? s.dailyResetTime : '00:00';
  const lastReset = counter ? counter.lastResetDate : '';
  const now = new Date();
  const needReset = shouldReset(lastReset, policy, dailyResetTime);
  const next = needReset ? startNumber : (counter ? counter.nextNumber : startNumber);
  return Math.max(1, next);
}

/** نقشهٔ شناسه سفارش → شماره رسید فراخوانی (برای نمایش در لیست) */
export function getReceiptNumbersMap(): Record<string, number> {
  const filePath = getReceiptNumbersMapPath();
  try {
    const raw = fs.readFileSync(filePath, 'utf-8');
    const data = JSON.parse(raw);
    if (data && typeof data === 'object') {
      const out: Record<string, number> = {};
      for (const [k, v] of Object.entries(data)) {
        if (typeof k === 'string' && typeof v === 'number' && v >= 1) out[k] = v;
      }
      return out;
    }
  } catch (error: any) {
    if (error?.code !== 'ENOENT') console.warn('Read receipt numbers map failed:', error);
  }
  return {};
}

export function setReceiptNumberForOrder(orderKey: string, receiptNumber: number): void {
  if (!orderKey || receiptNumber < 1) return;
  const filePath = getReceiptNumbersMapPath();
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const current = getReceiptNumbersMap();
  current[orderKey] = receiptNumber;
  fs.writeFileSync(filePath, JSON.stringify(current, null, 2), 'utf-8');
}

/** ذخیرهٔ شماره رسید برای چند کلید (مثلاً id و orderNumber) تا در لیست حتماً پیدا شود */
export function setReceiptNumbersForOrder(orderKeys: string[], receiptNumber: number): void {
  const keys = (orderKeys || [])
    .map((k) => (k != null && k !== '' ? String(k) : ''))
    .filter(Boolean);
  if (!keys.length || receiptNumber < 1) return;
  const filePath = getReceiptNumbersMapPath();
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const current = getReceiptNumbersMap();
  for (const key of keys) {
    current[key] = receiptNumber;
  }
  fs.writeFileSync(filePath, JSON.stringify(current, null, 2), 'utf-8');
  console.log('[شماره رسید] ذخیره در فایل:', filePath, 'کلیدها:', keys, 'شماره:', receiptNumber);
}

/** فقط شماره بعدی را مصرف کرده و برای سفارش ذخیره می‌کند (بدون چاپ) — برای وقتی چاپ انجام نمی‌شود */
export async function assignReceiptNumberForOrder(orderKeys: string[]): Promise<number> {
  const keys = (Array.isArray(orderKeys) ? orderKeys : [])
    .map((k) => (k != null && k !== '' ? String(k) : ''))
    .filter(Boolean);
  if (!keys.length) return 0;
  const receiptNumber = await getNextReceiptNumber();
  setReceiptNumbersForOrder(keys, receiptNumber);
  return receiptNumber;
}