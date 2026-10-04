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
/**
 * http = میان‌افزار JSON روی شبکه (روش فعلی)
 * serial-tlv = اتصال مستقیم به کارتخوان سامان (SEP) روی پورت سریال با پروتکل TLV
 * asan-pardakht = اتصال مستقیم به کارتخوان آسان‌پرداخت کیش از طریق PosInterface.dll (LAN یا سریال)
 */
export type CardTerminalConnectionType = 'http' | 'serial-tlv' | 'asan-pardakht';
export type AsanPardakhtConnectionMode = 'lan' | 'serial';

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
  /** فقط برای connectionType=asan-pardakht */
  asanPardakhtMode: AsanPardakhtConnectionMode;
  asanPardakhtIp: string;
  asanPardakhtPort: number;
  asanPardakhtComPort: string;
  asanPardakhtBaudRate: number;
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

export const DEFAULT_RECEIPT_SETTINGS: ReceiptNumberSettings = {
  nextNumber: 1,
  resetPolicy: 'never',
  startNumber: 1,
  lastResetDate: '',
  dailyResetTime: '00:00',
};

export const DEFAULT_CARD_TERMINAL_SETTINGS: CardTerminalSettings = {
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
  asanPardakhtMode: 'lan',
  asanPardakhtIp: '',
  asanPardakhtPort: 17000,
  asanPardakhtComPort: '',
  asanPardakhtBaudRate: 9600,
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

export interface PreferencesFile {
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
