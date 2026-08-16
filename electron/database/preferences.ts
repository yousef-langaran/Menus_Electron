import { app } from 'electron';
import * as path from 'path';
import * as fs from 'fs';

export type ReceiptNumberResetPolicy = 'never' | 'minutely' | 'daily' | 'weekly' | 'monthly';

/** واحد نمایش مبلغ در رسید چاپی (مقادیر سفارش در دیتابیس به ریال هستند؛ در حالت ریال ×۱۰ نمایش داده می‌شود) */
export type ReceiptPriceDisplayUnit = 'toman' | 'rial';
export type CardTerminalSendAmountUnit = 'toman' | 'rial';

export type ScaleConnectionType = 'serial' | 'tcp';

export type CallerIdInputMode = 'webhook' | 'serial' | 'hid';
export type CallerIdSerialFormat = 'auto' | 'at-clip' | 'cid-nmbr' | 'caller-field' | 'raw-number';

export interface CallerIdSettings {
  enabled: boolean;
  /** نحوه دریافت تماس: webhook (VOIP) یا serial (دستگاه USB) */
  inputMode: CallerIdInputMode;

  // ─── تنظیمات Webhook ───────────────────────────────────────────
  /** پورت محلی که اپ روی آن منتظر webhook می‌ماند */
  webhookPort: number;
  /** توکن/رمز برای تأیید هویت درخواست‌های ورودی (اختیاری) */
  webhookSecret: string;
  /** نام فیلد در بدنه webhook که شماره تماس‌گیرنده را دارد */
  phoneField: string;

  // ─── تنظیمات دستگاه USB / Serial ─────────────────────────────
  /** نام پورت COM دستگاه USB Caller ID (مثلاً COM3) */
  serialPortName: string;
  /** نرخ baud دستگاه (معمولاً 9600) */
  serialBaudRate: number;
  /** فرمت داده دستگاه */
  serialFormat: CallerIdSerialFormat;

  // ─── تنظیمات عمومی ────────────────────────────────────────────
  /** مدت زمان نمایش اعلان تماس ورودی (ثانیه) */
  notifyDurationSec: number;
  /** پخش صدا هنگام تماس ورودی */
  playSoundEnabled: boolean;
}

export const DEFAULT_CALLER_ID_SETTINGS: CallerIdSettings = {
  enabled: false,
  inputMode: 'webhook',
  webhookPort: 5055,
  webhookSecret: '',
  phoneField: 'caller',
  serialPortName: '',
  serialBaudRate: 9600,
  serialFormat: 'auto',
  notifyDurationSec: 30,
  playSoundEnabled: true,
};

export interface ScaleSettings {
  connectionType: ScaleConnectionType;
  portName: string;
  baudRate: number;
  host: string;
  tcpPort: number;
}

export const DEFAULT_SCALE_SETTINGS: ScaleSettings = {
  connectionType: 'serial',
  portName: '',
  baudRate: 9600,
  host: '',
  tcpPort: 8000,
};
export type CardTerminalHttpMethod = 'POST' | 'PUT';
/** http = میان‌افزار JSON روی شبکه (روش فعلی)؛ serial-tlv = اتصال مستقیم به کارتخوان سامان (SEP) روی پورت سریال با پروتکل TLV */
export type CardTerminalConnectionType = 'http' | 'serial-tlv';

export interface CardTerminalSettings {
  enabled: boolean;
  connectionType: CardTerminalConnectionType;
  endpointUrl: string;
  httpMethod: CardTerminalHttpMethod;
  timeoutMs: number;
  amountFieldName: string;
  orderIdFieldName: string;
  restaurantIdFieldName: string;
  sendAmountUnit: CardTerminalSendAmountUnit;
  authHeaderName: string;
  authToken: string;
  successFieldPath: string;
  messageFieldPath: string;
  referenceFieldPath: string;
  /** فقط برای connectionType=serial-tlv */
  serialPortName: string;
  serialBaudRate: number;
  /** آیا کارتخوان با تنظیم "With Handshake" فعال شده — در این حالت پس از ارسال مبلغ منتظر ACK (0x06) می‌مانیم */
  serialWithHandshake: boolean;
}

export interface CardTerminalProfile {
  id: string;
  name: string;
  settings: CardTerminalSettings;
}

export interface CardTerminalConfig {
  profiles: CardTerminalProfile[];
  defaultProfileId: string | null;
}

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

const DEFAULT_CARD_TERMINAL_SETTINGS: CardTerminalSettings = {
  enabled: false,
  connectionType: 'http',
  endpointUrl: '',
  httpMethod: 'POST',
  timeoutMs: 10000,
  amountFieldName: 'amount',
  orderIdFieldName: 'orderId',
  restaurantIdFieldName: 'restaurantId',
  sendAmountUnit: 'toman',
  authHeaderName: 'Authorization',
  authToken: '',
  successFieldPath: 'success',
  messageFieldPath: 'message',
  referenceFieldPath: 'refId',
  serialPortName: '',
  serialBaudRate: 19200,
  serialWithHandshake: false,
};

/** قالب چاپ پیش‌فرض انتخاب‌شده از سرور (کپی برای استفاده آفلاین) */
export interface DefaultPrintTemplateSnapshot {
  id: number;
  name: string;
  receiptType: 'full' | 'kitchen';
  paperWidth: number;
  paperLength: number;
  margin: number;
  contentWidthMm?: number | null;
  shiftLeftMm?: number | null;
  layout?: any[] | null;
}

/** قالب چاپ به‌ازای هر پرینتر (نام پرینتر → اسنپ‌شات قالب؛ null = صراحتاً بدون قالب) */
export type PrinterTemplatesMap = Record<string, DefaultPrintTemplateSnapshot | null>;

interface PreferencesFile {
  userSession?: {
    user: any;
    token: string;
    cachedAt: string;
  };
  printerConfigs?: Record<string, any>;
  receiptNumberSettings?: ReceiptNumberSettings;
  defaultPrintTemplate?: DefaultPrintTemplateSnapshot;
  /** قالب چاپ برای هر پرینتر (fallback وقتی پرینتر قالب ندارد: defaultPrintTemplate) */
  printerTemplates?: PrinterTemplatesMap;
  /** واحد نمایش قیمت در رسید چاپی */
  receiptPriceDisplayUnit?: ReceiptPriceDisplayUnit;
  /** تنظیمات اتصال کارتخوان در اپ دسکتاپ */
  cardTerminalSettings?: CardTerminalSettings;
  cardTerminalProfiles?: CardTerminalProfile[];
  defaultCardTerminalProfileId?: string | null;
  scaleSettings?: ScaleSettings;
  callerIdSettings?: CallerIdSettings;
  /** شناسه انبار مرتبط با این پایانه POS */
  posWarehouseId?: number | null;
}

const FILE_NAME = 'menus-preferences.json';
const COUNTER_FILE_NAME = 'receipt-counter.json';
const RECEIPT_NUMBERS_MAP_FILE = 'receipt-numbers.json';
const CALL_HISTORY_FILE = 'call-history.json';

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

/** فقط به‌روزرسانی توکن در نشست ذخیره‌شده (برای سینک main و هم‌خوانی با zustand پس از لاگین مجدد) */
export async function updateUserSessionToken(token: string) {
  const trimmed = typeof token === 'string' ? token.trim() : '';
  if (!trimmed) return;
  const prefs = await readPreferences();
  if (!prefs.userSession) return;
  prefs.userSession = {
    ...prefs.userSession,
    token: trimmed,
    cachedAt: new Date().toISOString(),
  };
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

export async function loadReceiptPriceDisplayUnit(): Promise<ReceiptPriceDisplayUnit> {
  const prefs = await readPreferences();
  return prefs.receiptPriceDisplayUnit === 'rial' ? 'rial' : 'toman';
}

export async function saveReceiptPriceDisplayUnit(unit: ReceiptPriceDisplayUnit): Promise<void> {
  const prefs = await readPreferences();
  prefs.receiptPriceDisplayUnit = unit === 'rial' ? 'rial' : 'toman';
  await writePreferences(prefs);
}

export async function loadCardTerminalSettings(): Promise<CardTerminalSettings> {
  const prefs = await readPreferences();
  const fallbackFromLegacy = prefs.cardTerminalSettings || {};
  const selectedProfile =
    (prefs.cardTerminalProfiles || []).find(
      (p) => p.id === (prefs.defaultCardTerminalProfileId || ''),
    ) || (prefs.cardTerminalProfiles || [])[0];
  const raw = selectedProfile?.settings || fallbackFromLegacy;
  const timeoutMs = Number((raw as any).timeoutMs);
  const normalizedMethod = String((raw as any).httpMethod || 'POST').toUpperCase() === 'PUT' ? 'PUT' : 'POST';
  return {
    enabled: Boolean((raw as any).enabled),
    connectionType: (raw as any).connectionType === 'serial-tlv' ? 'serial-tlv' : 'http',
    endpointUrl: String((raw as any).endpointUrl || '').trim(),
    httpMethod: normalizedMethod,
    timeoutMs: Number.isFinite(timeoutMs) ? Math.max(3000, Math.min(timeoutMs, 120000)) : 10000,
    amountFieldName: String((raw as any).amountFieldName || 'amount').trim() || 'amount',
    orderIdFieldName: String((raw as any).orderIdFieldName || 'orderId').trim(),
    restaurantIdFieldName: String((raw as any).restaurantIdFieldName || 'restaurantId').trim(),
    sendAmountUnit: (raw as any).sendAmountUnit === 'rial' ? 'rial' : 'toman',
    authHeaderName: String((raw as any).authHeaderName || 'Authorization').trim() || 'Authorization',
    authToken: String((raw as any).authToken || '').trim(),
    successFieldPath: String((raw as any).successFieldPath || 'success').trim() || 'success',
    messageFieldPath: String((raw as any).messageFieldPath || 'message').trim() || 'message',
    referenceFieldPath: String((raw as any).referenceFieldPath || 'refId').trim() || 'refId',
    serialPortName: String((raw as any).serialPortName || '').trim(),
    serialBaudRate: Number((raw as any).serialBaudRate) || 19200,
    serialWithHandshake: Boolean((raw as any).serialWithHandshake),
  };
}

export async function loadCardTerminalConfig(): Promise<CardTerminalConfig> {
  const prefs = await readPreferences();
  const profiles = Array.isArray(prefs.cardTerminalProfiles) ? prefs.cardTerminalProfiles : [];
  if (profiles.length > 0) {
    const normalizedProfiles = profiles.map((p) => ({
      id: String(p.id || `terminal-${Date.now()}`),
      name: String(p.name || 'کارتخوان').trim() || 'کارتخوان',
      settings: {
        ...DEFAULT_CARD_TERMINAL_SETTINGS,
        ...(p.settings || {}),
      },
    }));
    const defaultProfileId =
      normalizedProfiles.some((x) => x.id === prefs.defaultCardTerminalProfileId)
        ? String(prefs.defaultCardTerminalProfileId)
        : normalizedProfiles[0].id;
    return { profiles: normalizedProfiles, defaultProfileId };
  }
  const legacy = await loadCardTerminalSettings();
  return {
    profiles: [
      {
        id: 'terminal-default',
        name: 'کارتخوان 1',
        settings: legacy,
      },
    ],
    defaultProfileId: 'terminal-default',
  };
}

export async function saveCardTerminalConfig(config: Partial<CardTerminalConfig>): Promise<CardTerminalConfig> {
  const prefs = await readPreferences();
  const incomingProfiles = Array.isArray(config.profiles) ? config.profiles : [];
  const profiles = incomingProfiles
    .map((p) => ({
      id: String(p.id || `terminal-${Date.now()}-${Math.floor(Math.random() * 1000)}`),
      name: String(p.name || 'کارتخوان').trim() || 'کارتخوان',
      settings: {
        ...DEFAULT_CARD_TERMINAL_SETTINGS,
        ...(p.settings || {}),
      },
    }))
    .filter((p, idx, arr) => arr.findIndex((x) => x.id === p.id) === idx);

  const defaultProfileId =
    profiles.length === 0
      ? null
      : profiles.some((x) => x.id === config.defaultProfileId)
        ? String(config.defaultProfileId)
        : profiles[0].id;

  prefs.cardTerminalProfiles = profiles;
  prefs.defaultCardTerminalProfileId = defaultProfileId;
  if (defaultProfileId) {
    const selected = profiles.find((x) => x.id === defaultProfileId);
    if (selected) {
      prefs.cardTerminalSettings = selected.settings;
    }
  }
  await writePreferences(prefs);
  return { profiles, defaultProfileId };
}

export async function saveCardTerminalSettings(
  settings: Partial<CardTerminalSettings>,
): Promise<CardTerminalSettings> {
  const prefs = await readPreferences();
  const merged = {
    ...DEFAULT_CARD_TERMINAL_SETTINGS,
    ...(prefs.cardTerminalSettings || {}),
    ...(settings || {}),
  };
  prefs.cardTerminalSettings = {
    enabled: Boolean(merged.enabled),
    connectionType: merged.connectionType === 'serial-tlv' ? 'serial-tlv' : 'http',
    endpointUrl: String(merged.endpointUrl || '').trim(),
    httpMethod: String(merged.httpMethod || 'POST').toUpperCase() === 'PUT' ? 'PUT' : 'POST',
    timeoutMs: Math.max(3000, Math.min(Number(merged.timeoutMs || 10000), 120000)),
    amountFieldName: String(merged.amountFieldName || 'amount').trim() || 'amount',
    orderIdFieldName: String(merged.orderIdFieldName || 'orderId').trim(),
    restaurantIdFieldName: String(merged.restaurantIdFieldName || 'restaurantId').trim(),
    sendAmountUnit: merged.sendAmountUnit === 'rial' ? 'rial' : 'toman',
    authHeaderName: String(merged.authHeaderName || 'Authorization').trim() || 'Authorization',
    authToken: String(merged.authToken || '').trim(),
    successFieldPath: String(merged.successFieldPath || 'success').trim() || 'success',
    messageFieldPath: String(merged.messageFieldPath || 'message').trim() || 'message',
    referenceFieldPath: String(merged.referenceFieldPath || 'refId').trim() || 'refId',
    serialPortName: String(merged.serialPortName || '').trim(),
    serialBaudRate: Number(merged.serialBaudRate) || 19200,
    serialWithHandshake: Boolean(merged.serialWithHandshake),
  };
  await writePreferences(prefs);
  return prefs.cardTerminalSettings;
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

export async function loadDefaultPrintTemplate(): Promise<DefaultPrintTemplateSnapshot | null> {
  const prefs = await readPreferences();
  return prefs.defaultPrintTemplate ?? null;
}

export async function saveDefaultPrintTemplate(template: DefaultPrintTemplateSnapshot | null): Promise<void> {
  const prefs = await readPreferences();
  if (template) {
    prefs.defaultPrintTemplate = template;
  } else {
    delete prefs.defaultPrintTemplate;
  }
  await writePreferences(prefs);
}

export async function loadPrintTemplatesMap(): Promise<Record<string, DefaultPrintTemplateSnapshot | null>> {
  const prefs = await readPreferences();
  const map = prefs.printerTemplates ?? {};
  return { ...map };
}

/**
 * کلید نگاشت قالب‌ها: با نوع رسید یعنی قالبِ همان رسید از همان پرینتر
 * (`نام‌پرینتر::full`) و بدون آن یعنی قالبِ کلی همان پرینتر.
 */
export function printTemplateKey(printerName: string, receiptType?: 'full' | 'kitchen'): string {
  return receiptType ? `${printerName}::${receiptType}` : printerName;
}

/**
 * `null` یعنی کاربر صراحتاً «بدون قالب» را انتخاب کرده (پس قالب پیش‌فرض برنامه هم
 * اعمال نمی‌شود). نبودنِ کلید یعنی «ارث‌بری از سطح بالاتر». برای پاک‌کردن کامل،
 * `undefined` بفرستید.
 */
export async function setPrintTemplateForPrinter(
  printerName: string,
  template: DefaultPrintTemplateSnapshot | null | undefined,
  receiptType?: 'full' | 'kitchen'
): Promise<void> {
  const prefs = await readPreferences();
  if (!prefs.printerTemplates) prefs.printerTemplates = {};
  const key = printTemplateKey(printerName, receiptType);
  if (template === undefined) {
    delete prefs.printerTemplates[key];
  } else {
    prefs.printerTemplates[key] = template;
  }
  await writePreferences(prefs);
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

export async function loadScaleSettings(): Promise<ScaleSettings> {
  const prefs = await readPreferences();
  const raw = prefs.scaleSettings;
  if (!raw) return { ...DEFAULT_SCALE_SETTINGS };
  return {
    connectionType: raw.connectionType === 'tcp' ? 'tcp' : 'serial',
    portName: String(raw.portName || ''),
    baudRate: Number.isFinite(Number(raw.baudRate)) && Number(raw.baudRate) > 0 ? Number(raw.baudRate) : 9600,
    host: String(raw.host || ''),
    tcpPort: Number.isFinite(Number(raw.tcpPort)) && Number(raw.tcpPort) > 0 ? Number(raw.tcpPort) : 8000,
  };
}

export async function saveScaleSettings(settings: Partial<ScaleSettings>): Promise<ScaleSettings> {
  const prefs = await readPreferences();
  const merged: ScaleSettings = {
    ...DEFAULT_SCALE_SETTINGS,
    ...(prefs.scaleSettings || {}),
    ...(settings || {}),
  };
  prefs.scaleSettings = merged;
  await writePreferences(prefs);
  return merged;
}

export async function loadCallerIdSettings(): Promise<CallerIdSettings> {
  const prefs = await readPreferences();
  const raw = prefs.callerIdSettings;
  if (!raw) return { ...DEFAULT_CALLER_ID_SETTINGS };
  const validFormats: CallerIdSerialFormat[] = ['auto', 'at-clip', 'cid-nmbr', 'caller-field', 'raw-number'];
  return {
    enabled: Boolean(raw.enabled),
    inputMode: raw.inputMode === 'serial' ? 'serial' : raw.inputMode === 'hid' ? 'hid' : 'webhook',
    webhookPort: Number.isFinite(Number(raw.webhookPort)) && Number(raw.webhookPort) > 0
      ? Number(raw.webhookPort)
      : DEFAULT_CALLER_ID_SETTINGS.webhookPort,
    webhookSecret: String(raw.webhookSecret || ''),
    phoneField: String(raw.phoneField || DEFAULT_CALLER_ID_SETTINGS.phoneField).trim() || DEFAULT_CALLER_ID_SETTINGS.phoneField,
    serialPortName: String(raw.serialPortName || ''),
    serialBaudRate: Number.isFinite(Number(raw.serialBaudRate)) && Number(raw.serialBaudRate) > 0
      ? Number(raw.serialBaudRate)
      : DEFAULT_CALLER_ID_SETTINGS.serialBaudRate,
    serialFormat: validFormats.includes(raw.serialFormat as CallerIdSerialFormat)
      ? raw.serialFormat as CallerIdSerialFormat
      : 'auto',
    notifyDurationSec: Number.isFinite(Number(raw.notifyDurationSec)) && Number(raw.notifyDurationSec) > 0
      ? Number(raw.notifyDurationSec)
      : DEFAULT_CALLER_ID_SETTINGS.notifyDurationSec,
    playSoundEnabled: raw.playSoundEnabled !== false,
  };
}

export async function loadPosWarehouseId(): Promise<number | null> {
  const prefs = await readPreferences();
  const val = prefs.posWarehouseId;
  return typeof val === 'number' && val > 0 ? val : null;
}

export async function savePosWarehouseId(id: number | null): Promise<void> {
  const prefs = await readPreferences();
  prefs.posWarehouseId = typeof id === 'number' && id > 0 ? id : null;
  await writePreferences(prefs);
}

const getCallHistoryPath = () => {
  try {
    return path.join(app.getPath('userData'), CALL_HISTORY_FILE);
  } catch {
    return path.join(process.cwd(), CALL_HISTORY_FILE);
  }
};

export async function loadCallHistory(): Promise<any[]> {
  const filePath = getCallHistoryPath();
  try {
    const raw = await fs.promises.readFile(filePath, 'utf-8');
    const data = JSON.parse(raw);
    return Array.isArray(data) ? data : [];
  } catch (error: any) {
    if (error?.code === 'ENOENT') return [];
    console.warn('[CallHistory] load error:', error);
    return [];
  }
}

export async function saveCallHistory(history: any[]): Promise<void> {
  const filePath = getCallHistoryPath();
  const dir = path.dirname(filePath);
  await fs.promises.mkdir(dir, { recursive: true });
  await fs.promises.writeFile(filePath, JSON.stringify(history, null, 2), 'utf-8');
}

export async function saveCallerIdSettings(settings: Partial<CallerIdSettings>): Promise<CallerIdSettings> {
  const prefs = await readPreferences();
  const merged: CallerIdSettings = {
    ...DEFAULT_CALLER_ID_SETTINGS,
    ...(prefs.callerIdSettings || {}),
    ...(settings || {}),
  };
  prefs.callerIdSettings = merged;
  await writePreferences(prefs);
  return merged;
}