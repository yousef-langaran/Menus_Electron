import { encodeTLV, encodeConstructedTLV, decodeAllTLV, decodeTLV } from './berTlv';

/**
 * پیاده‌سازی پروتکل TLV شرکت سامان الکترونیک (SEP) برای ارسال مبلغ به کارتخوان‌های
 * S80/S800/S90/S900/D210 از طریق پورت سریال — بر اساس سند «Technical Guideline of
 * Communicating with EFT-POS (TLV Protocol v1.2)».
 *
 * ⚠️ نگاشت تگ‌های فیلد (جدول‌های صفحه ۶ و ۹ سند) از متن تمیز و بدون شکستگی سند گرفته
 * شده و اطمینان بالایی دارد. اما فریم‌بندی بیرونیِ پیام ارسالی (نشانگر 0x02 + طول
 * ۴بایتی + نشانگر 0x01) از نمونه‌های هگزادسیمال چندخطی سند بازسازی شده که در استخراج
 * متن PDF علائم خرابی/جابه‌جایی داشتند (مثلاً یک رقم اضافه در وسط یک بلوک هگز). این
 * بخش با کارتخوان فیزیکی واقعی تأیید نشده — پیش از اتکا به آن در تراکنش واقعی حتماً
 * با دستگاه/شبیه‌ساز واقعی سامان تست شود.
 */

const TAG_ROOT = 0x72;
const TAG_POS_INFO = 0xB1;
const TAG_SWITCH_DATA = 0xB2;
const TAG_AMOUNTS = 0xA1;
const TAG_HISTORY = 0xA2;

const T_TOTAL_FEE = 0x81;
const T_CODEPAGE = 0x83;
const T_PRINT_FLAG = 0x84;
const T_SEGMENT_PURCHASE = 0x86;

const T_AMOUNT1 = 0x81;
const T_ITEM = 0x81;
const T_VALUE = 0x82;

const R_SERIAL = 0x85;
const R_AFFECTED_AMOUNT = 0x8e;
const R_AMOUNT = 0x8d;
const R_TRACE = 0x8c;
const R_RRN = 0x8b;
const R_PAN = 0x8a;
const R_TERMINAL_ID = 0x89;
const R_RESPONSE_CODE = 0x88;
const R_DATETIME = 0x87;
const R_BATCH = 0x86;

const ACK = 0x06;

function ascii(v: string | number): Buffer {
  return Buffer.from(String(v), 'ascii');
}

/** پیام «ارسال مبلغ»: Tag 72 شامل B1 (اطلاعات کارتخوان) و B2 (مبلغ ارسالی به سوییچ) */
export function buildAmountMessage(amountRial: number, opts?: { dllVer?: string; prgVer?: string }): Buffer {
  const amountStr = ascii(Math.max(0, Math.round(amountRial)));
  const dllVer = ascii(opts?.dllVer || '2.5.0.0');
  const prgVer = ascii(opts?.prgVer || 'MenusElectron/1.0');

  const posInfo = encodeConstructedTLV(TAG_POS_INFO, [
    encodeTLV(T_TOTAL_FEE, amountStr),
    encodeTLV(T_CODEPAGE, ascii('1')),
    encodeTLV(T_PRINT_FLAG, ascii('0')),
    encodeTLV(T_SEGMENT_PURCHASE, ascii('0')),
  ]);

  const amounts = encodeConstructedTLV(TAG_AMOUNTS, [encodeTLV(T_AMOUNT1, amountStr)]);

  const history = encodeConstructedTLV(TAG_HISTORY, [
    encodeConstructedTLV(TAG_AMOUNTS, [encodeTLV(T_ITEM, ascii('DllVer')), encodeTLV(T_VALUE, dllVer)]),
    encodeConstructedTLV(TAG_AMOUNTS, [encodeTLV(T_ITEM, ascii('PrgVer')), encodeTLV(T_VALUE, prgVer)]),
  ]);

  const switchData = encodeConstructedTLV(TAG_SWITCH_DATA, [amounts, history]);
  const root = encodeConstructedTLV(TAG_ROOT, [posInfo, switchData]);

  const marker = Buffer.from([0x01]);
  const payload = Buffer.concat([marker, root]);
  const lenBuf = Buffer.alloc(4);
  lenBuf.writeUInt32LE(payload.length, 0);
  return Buffer.concat([Buffer.from([0x02]), lenBuf, payload]);
}

export interface SamanPosResult {
  success: boolean;
  raw?: string;
  serialNumber?: string;
  affectedAmount?: string;
  amount?: string;
  traceNumber?: string;
  rrn?: string;
  pan?: string;
  terminalId?: string;
  dateTime?: string;
  batchNumber?: string;
  error?: string;
}

/** پارس پاسخ کارتخوان: Tag 72 -> B1 -> فیلدهای تراکنش (جدول صفحه ۹ سند) */
export function parseResponseFrame(buf: Buffer): SamanPosResult {
  try {
    const root = decodeTLV(buf, 0);
    if (root.tag !== TAG_ROOT) return { success: false, error: 'ساختار پاسخ کارتخوان نامعتبر است (Tag ریشه)' };
    const b1 = decodeTLV(root.value, 0);
    if (b1.tag !== TAG_POS_INFO) return { success: false, error: 'ساختار پاسخ کارتخوان نامعتبر است (Tag B1)' };

    const byTag = new Map<number, Buffer>();
    for (const f of decodeAllTLV(b1.value)) byTag.set(f.tag, f.value);

    // طبق راهنما: بایت اول همیشه 01 است، بایت دوم 00=موفق / 01=ناموفق (باینری، نه ASCII)
    const responseCode = byTag.get(R_RESPONSE_CODE);
    const success = !!responseCode && responseCode.length >= 2 && responseCode[1] === 0x00;

    const str = (tag: number) => byTag.get(tag)?.toString('ascii');

    return {
      success,
      raw: buf.toString('hex'),
      serialNumber: str(R_SERIAL),
      affectedAmount: str(R_AFFECTED_AMOUNT),
      amount: str(R_AMOUNT),
      traceNumber: str(R_TRACE),
      rrn: str(R_RRN),
      pan: str(R_PAN),
      terminalId: str(R_TERMINAL_ID),
      dateTime: str(R_DATETIME),
      batchNumber: str(R_BATCH),
      error: success ? undefined : 'تراکنش توسط کارتخوان ناموفق اعلام شد',
    };
  } catch (err: any) {
    return { success: false, error: `خطا در پردازش پاسخ کارتخوان: ${String(err?.message || err)}` };
  }
}

/** یک فریم کامل TLV (که با Tag 72 شروع می‌شود) را از ابتدای بافر جدا می‌کند؛ اگر هنوز کامل نرسیده null */
function tryExtractFrame(buf: Buffer): { frame: Buffer; rest: Buffer } | null {
  if (buf.length < 2 || buf[0] !== TAG_ROOT) return null;
  const first = buf[1];
  let lenFieldBytes: number;
  let valueLen: number;
  if (first < 0x80) {
    lenFieldBytes = 1;
    valueLen = first;
  } else {
    const n = first & 0x7f;
    if (buf.length < 2 + n) return null;
    lenFieldBytes = 1 + n;
    valueLen = 0;
    for (let i = 0; i < n; i++) valueLen = (valueLen << 8) | buf[2 + i];
  }
  const totalLen = 1 + lenFieldBytes + valueLen;
  if (buf.length < totalLen) return null;
  return { frame: buf.subarray(0, totalLen), rest: buf.subarray(totalLen) };
}

async function getSerialPort(): Promise<any | null> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    return require('serialport');
  } catch {
    return null;
  }
}

export interface SamanSerialOptions {
  portName: string;
  baudRate?: number;
  withHandshake?: boolean;
  /** حداکثر زمان انتظار برای پاسخ نهایی تراکنش (کارتخوان تا کشیدن کارت/زدن رمز صبر می‌کند) */
  transactionTimeoutMs?: number;
}

/** مبلغ را از طریق پورت سریال با پروتکل TLV سامان به کارتخوان می‌فرستد و منتظر پاسخ می‌ماند */
export async function sendAmountViaSamanSerial(
  amountRial: number,
  options: SamanSerialOptions,
): Promise<SamanPosResult> {
  if (!options.portName?.trim()) {
    return { success: false, error: 'پورت COM کارتخوان انتخاب نشده است' };
  }
  const sp = await getSerialPort();
  if (!sp) {
    return { success: false, error: 'ماژول serialport نصب نیست. دستور "npm run rebuild" را اجرا کنید.' };
  }

  const { SerialPort } = sp;
  const port = new SerialPort({
    path: options.portName,
    baudRate: options.baudRate || 19200,
    dataBits: 8,
    parity: 'none',
    stopBits: 1,
    autoOpen: false,
  });

  const close = () => {
    try {
      if (port.isOpen) port.close();
    } catch {
      /* ignore */
    }
  };

  return new Promise((resolve) => {
    let settled = false;
    let inBuffer = Buffer.alloc(0);
    let ackReceived = !options.withHandshake;

    const finish = (result: SamanPosResult) => {
      if (settled) return;
      settled = true;
      clearTimeout(handshakeTimer);
      clearTimeout(txTimer);
      close();
      resolve(result);
    };

    const handshakeTimer = setTimeout(() => {
      if (!ackReceived) finish({ success: false, error: 'کارتخوان متصل نیست (ACK دریافت نشد)' });
    }, 5000);

    const txTimer = setTimeout(() => {
      finish({ success: false, error: 'زمان انتظار برای پاسخ کارتخوان به پایان رسید' });
    }, options.transactionTimeoutMs || 90000);

    port.open((err: Error | null) => {
      if (err) {
        finish({ success: false, error: `اتصال به پورت ${options.portName} ناموفق بود: ${err.message}` });
        return;
      }

      port.on('data', (chunk: Buffer) => {
        inBuffer = Buffer.concat([inBuffer, chunk]);

        // نویز خط سریال قبل از ACK یا شروع فریم واقعی را دور بریز
        while (inBuffer.length > 0 && inBuffer[0] !== ACK && inBuffer[0] !== TAG_ROOT) {
          inBuffer = inBuffer.subarray(1);
        }
        while (inBuffer.length > 0 && inBuffer[0] === ACK) {
          ackReceived = true;
          inBuffer = inBuffer.subarray(1);
        }

        const extracted = tryExtractFrame(inBuffer);
        if (extracted) {
          const result = parseResponseFrame(extracted.frame);
          // طبق «Final Interaction»: در صورت موفقیت 0x06 بفرست (best-effort، نتیجه صرف‌نظر از این مرحله مشخص است)
          if (result.success) {
            try {
              port.write(Buffer.from([ACK]));
            } catch {
              /* ignore */
            }
          }
          finish(result);
        }
      });

      port.on('error', (e: Error) => {
        finish({ success: false, error: `خطای پورت سریال: ${e.message}` });
      });

      try {
        port.write(buildAmountMessage(amountRial));
      } catch (writeErr: any) {
        finish({ success: false, error: `ارسال به کارتخوان ناموفق بود: ${String(writeErr?.message || writeErr)}` });
      }
    });
  });
}
