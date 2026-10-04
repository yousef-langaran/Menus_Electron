export type CardTerminalConnectionType = 'http' | 'serial-tlv' | 'asan-pardakht';
export type AsanPardakhtConnectionMode = 'lan' | 'serial';

export type CardTerminalSettings = {
  enabled: boolean;
  connectionType: CardTerminalConnectionType;
  endpointUrl: string;
  httpMethod: 'POST' | 'PUT';
  timeoutMs: number;
  amountFieldName: string;
  orderIdFieldName: string;
  restaurantIdFieldName: string;
  sendAmountUnit: 'toman' | 'rial';
  authHeaderName: string;
  authToken: string;
  successFieldPath: string;
  messageFieldPath: string;
  referenceFieldPath: string;
  companyKey?: string;
  deviceIp?: string;
  /** فقط برای connectionType=serial-tlv (کارتخوان سامان/SEP روی پورت سریال) */
  serialPortName: string;
  serialBaudRate: number;
  serialWithHandshake: boolean;
  /** فقط برای connectionType=asan-pardakht (کارتخوان آسان‌پرداخت کیش — PosInterface.dll) */
  asanPardakhtMode: AsanPardakhtConnectionMode;
  asanPardakhtIp: string;
  asanPardakhtPort: number;
  asanPardakhtComPort: string;
  asanPardakhtBaudRate: number;
};

export type CardTerminalProfile = {
  id: string;
  name: string;
  settings: CardTerminalSettings;
};

export const DEFAULT_SETTINGS: CardTerminalSettings = {
  enabled: true,
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

export type CompanyPreset = {
  key: string;
  label: string;
  port: number;
  urlPath: string;
  baseSettings: Partial<CardTerminalSettings>;
};

export const COMPANY_PRESETS: CompanyPreset[] = [
  {
    key: 'sepehr',
    label: 'پرداخت الکترونیک سپهر (بانک صادرات)',
    port: 8080,
    urlPath: '/payment/sendrequest',
    baseSettings: {
      httpMethod: 'POST',
      timeoutMs: 30000,
      sendAmountUnit: 'rial',
      amountFieldName: 'Amount',
      orderIdFieldName: 'InvoiceNumber',
      restaurantIdFieldName: 'TerminalId',
      authHeaderName: 'Authorization',
      authToken: '',
      successFieldPath: 'status',
      messageFieldPath: 'description',
      referenceFieldPath: 'Rrn',
    },
  },
  {
    key: 'sep',
    label: 'پرداخت الکترونیک سامان (SEP)',
    port: 8080,
    urlPath: '/api/payment',
    baseSettings: {
      httpMethod: 'POST',
      timeoutMs: 30000,
      sendAmountUnit: 'rial',
      amountFieldName: 'amount',
      orderIdFieldName: 'invoiceNumber',
      restaurantIdFieldName: 'terminalId',
      authHeaderName: 'Authorization',
      authToken: '',
      successFieldPath: 'success',
      messageFieldPath: 'message',
      referenceFieldPath: 'refId',
    },
  },
  {
    key: 'asanpardakht',
    label: 'آسان پرداخت پرشین',
    port: 9000,
    urlPath: '/api/payment',
    baseSettings: {
      httpMethod: 'POST',
      timeoutMs: 30000,
      sendAmountUnit: 'rial',
      amountFieldName: 'amount',
      orderIdFieldName: 'invoiceNumber',
      restaurantIdFieldName: 'terminalId',
      authHeaderName: 'Authorization',
      authToken: '',
      successFieldPath: 'success',
      messageFieldPath: 'message',
      referenceFieldPath: 'refId',
    },
  },
  {
    key: 'behpardakht',
    label: 'به پرداخت ملت',
    port: 9090,
    urlPath: '/api/payment',
    baseSettings: {
      httpMethod: 'POST',
      timeoutMs: 60000,
      sendAmountUnit: 'toman',
      amountFieldName: 'amount',
      orderIdFieldName: 'orderId',
      restaurantIdFieldName: 'terminalId',
      authHeaderName: 'x-api-key',
      authToken: '',
      successFieldPath: 'success',
      messageFieldPath: 'message',
      referenceFieldPath: 'trackingCode',
    },
  },
  {
    key: 'parsian',
    label: 'تجارت الکترونیک پارسیان (IranKish)',
    port: 8060,
    urlPath: '/api/pay',
    baseSettings: {
      httpMethod: 'POST',
      timeoutMs: 30000,
      sendAmountUnit: 'rial',
      amountFieldName: 'amount',
      orderIdFieldName: 'invoiceNumber',
      restaurantIdFieldName: 'terminalId',
      authHeaderName: 'Authorization',
      authToken: '',
      successFieldPath: 'success',
      messageFieldPath: 'message',
      referenceFieldPath: 'refNumber',
    },
  },
  {
    key: 'sadad',
    label: 'پرداخت الکترونیک سداد (بانک ملی)',
    port: 8080,
    urlPath: '/api/payment',
    baseSettings: {
      httpMethod: 'POST',
      timeoutMs: 30000,
      sendAmountUnit: 'rial',
      amountFieldName: 'amount',
      orderIdFieldName: 'invoiceNumber',
      restaurantIdFieldName: 'terminalId',
      authHeaderName: 'Authorization',
      authToken: '',
      successFieldPath: 'success',
      messageFieldPath: 'message',
      referenceFieldPath: 'refId',
    },
  },
  {
    key: 'pep',
    label: 'پرداخت الکترونیک پاسارگاد (PEP)',
    port: 8080,
    urlPath: '/api/payment',
    baseSettings: {
      httpMethod: 'POST',
      timeoutMs: 30000,
      sendAmountUnit: 'rial',
      amountFieldName: 'amount',
      orderIdFieldName: 'invoiceNumber',
      restaurantIdFieldName: 'terminalId',
      authHeaderName: 'Authorization',
      authToken: '',
      successFieldPath: 'success',
      messageFieldPath: 'message',
      referenceFieldPath: 'refId',
    },
  },
  {
    key: 'novin',
    label: 'پرداخت نوین آرین',
    port: 8080,
    urlPath: '/api/payment',
    baseSettings: {
      httpMethod: 'POST',
      timeoutMs: 30000,
      sendAmountUnit: 'rial',
      amountFieldName: 'amount',
      orderIdFieldName: 'orderId',
      restaurantIdFieldName: 'terminalId',
      authHeaderName: 'Authorization',
      authToken: '',
      successFieldPath: 'success',
      messageFieldPath: 'message',
      referenceFieldPath: 'refId',
    },
  },
];

export function buildEndpointUrl(companyKey: string, ip: string): string {
  const preset = COMPANY_PRESETS.find((p) => p.key === companyKey);
  if (!preset) return '';
  const host = ip.trim() || 'localhost';
  return `http://${host}:${preset.port}${preset.urlPath}`;
}
