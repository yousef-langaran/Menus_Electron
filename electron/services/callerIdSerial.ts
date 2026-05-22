import { BrowserWindow } from 'electron';

/**
 * فرمت‌های رایج دستگاه‌های USB Caller ID موجود در بازار:
 *
 * 1. AT+CLIP (مودم استاندارد — رایج‌ترین):
 *    RING
 *    +CLIP: "09123456789",145,,,,0
 *
 * 2. CID Multi-line (دستگاه‌های مستقل):
 *    DATE=0522
 *    TIME=1530
 *    NMBR=09123456789
 *    NAME=Ali
 *
 * 3. Simple NMBR= (برخی دستگاه‌های ارزان):
 *    NMBR = 09123456789
 *
 * 4. CALLER: (فرمت جایگزین):
 *    CALLER: 09123456789
 *
 * 5. خط خالی + شماره (ساده‌ترین):
 *    09123456789
 */

export type CallerIdSerialFormat = 'auto' | 'at-clip' | 'cid-nmbr' | 'caller-field' | 'raw-number';

export interface CallerIdSerialSettings {
  enabled: boolean;
  portName: string;
  baudRate: number;
  format: CallerIdSerialFormat;
}

export const DEFAULT_CALLER_ID_SERIAL_SETTINGS: CallerIdSerialSettings = {
  enabled: false,
  portName: '',
  baudRate: 9600,
  format: 'auto',
};

async function getSerialPort(): Promise<any | null> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    return require('serialport');
  } catch {
    console.warn('[CallerID-Serial] serialport not available. Run: npm run rebuild');
    return null;
  }
}

/**
 * پارس شماره تلفن از یک خط متنی بر اساس فرمت انتخاب‌شده.
 * همه فرمت‌ها را به‌صورت auto امتحان می‌کند.
 */
function parseCallerIdLine(line: string, format: CallerIdSerialFormat): string | null {
  const l = line.trim();
  if (!l) return null;

  if (format === 'at-clip' || format === 'auto') {
    // +CLIP: "09123456789",145,,,,0
    const clipMatch = l.match(/\+CLIP:\s*"?([0-9+\-\s]{7,20})"?/i);
    if (clipMatch) return normalizePhone(clipMatch[1]);
  }

  if (format === 'cid-nmbr' || format === 'auto') {
    // NMBR=09123456789  یا  NMBR = 09123456789
    const nmbrMatch = l.match(/^NMBR\s*=\s*([0-9+\-\s]{7,20})/i);
    if (nmbrMatch) return normalizePhone(nmbrMatch[1]);
  }

  if (format === 'caller-field' || format === 'auto') {
    // CALLER: 09123456789
    const callerMatch = l.match(/^CALLER[:\s]+([0-9+\-\s]{7,20})/i);
    if (callerMatch) return normalizePhone(callerMatch[1]);
    // NUMBER: 09123456789
    const numberMatch = l.match(/^NUMBER[:\s]+([0-9+\-\s]{7,20})/i);
    if (numberMatch) return normalizePhone(numberMatch[1]);
    // CID: 09123456789
    const cidMatch = l.match(/^CID[:\s]+([0-9+\-\s]{7,20})/i);
    if (cidMatch) return normalizePhone(cidMatch[1]);
  }

  if (format === 'raw-number' || format === 'auto') {
    // خط فقط شماره
    const rawMatch = l.match(/^([0-9+]{7,20})$/);
    if (rawMatch) return normalizePhone(rawMatch[1]);
  }

  return null;
}

function normalizePhone(raw: string): string | null {
  const phone = raw.replace(/[\s\-]/g, '').trim();
  if (phone.length < 7 || phone === '0000000' || phone === 'P' || phone === 'O') return null;
  return phone;
}

type IncomingCallCallback = (phone: string) => void;

class CallerIdSerialService {
  private serialPort: any = null;
  private _connected = false;
  private buffer = '';
  private format: CallerIdSerialFormat = 'auto';
  private callbacks = new Set<IncomingCallCallback>();
  private ringReceived = false;
  private ringTimeout: ReturnType<typeof setTimeout> | null = null;

  onCall(cb: IncomingCallCallback) {
    this.callbacks.add(cb);
    return () => this.callbacks.delete(cb);
  }

  private emit(phone: string) {
    for (const cb of this.callbacks) {
      try { cb(phone); } catch {}
    }
  }

  private onData(raw: string) {
    this.buffer += raw;
    const lines = this.buffer.split(/\r\n|\r|\n/);
    this.buffer = lines.pop() ?? '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      // RING تشخیص — بعد از RING منتظر +CLIP می‌مانیم
      if (/^RING$/i.test(trimmed)) {
        this.ringReceived = true;
        if (this.ringTimeout) clearTimeout(this.ringTimeout);
        this.ringTimeout = setTimeout(() => {
          this.ringReceived = false;
        }, 5000);
        continue;
      }

      const phone = parseCallerIdLine(trimmed, this.format);
      if (phone) {
        if (this.ringTimeout) clearTimeout(this.ringTimeout);
        this.ringReceived = false;
        this.emit(phone);
      }
    }
  }

  async connect(settings: CallerIdSerialSettings): Promise<{ success: boolean; error?: string }> {
    if (!settings.portName?.trim()) {
      return { success: false, error: 'پورت COM دستگاه Caller ID انتخاب نشده' };
    }

    await this.disconnect();
    this.buffer = '';
    this.format = settings.format || 'auto';

    const sp = await getSerialPort();
    if (!sp) {
      return { success: false, error: 'ماژول serialport نصب نیست — "npm run rebuild" را اجرا کنید' };
    }

    return new Promise((resolve) => {
      try {
        const { SerialPort } = sp;
        const port = new SerialPort({
          path: settings.portName,
          baudRate: settings.baudRate || 9600,
          autoOpen: false,
        });

        port.open((err: Error | null) => {
          if (err) {
            resolve({ success: false, error: err.message });
            return;
          }

          this.serialPort = port;
          this._connected = true;

          // برای مودم‌های AT، ابتدا دستور init می‌فرستیم
          // ATZ — reset  |  AT+VCID=1 — فعال‌سازی Caller ID
          if (settings.format === 'at-clip' || settings.format === 'auto') {
            try {
              port.write('ATZ\r\n');
              setTimeout(() => {
                try { port.write('AT+VCID=1\r\n'); } catch {}
              }, 500);
            } catch {}
          }

          const decoder = new (require('string_decoder').StringDecoder)('utf8');
          port.on('data', (chunk: Buffer) => {
            this.onData(decoder.write(chunk));
          });

          port.on('error', (err: Error) => {
            console.error('[CallerID-Serial] error:', err);
            this._connected = false;
          });

          port.on('close', () => {
            this._connected = false;
            this.serialPort = null;
            console.log('[CallerID-Serial] port closed');
          });

          resolve({ success: true });
        });
      } catch (err: any) {
        resolve({ success: false, error: String(err?.message || err) });
      }
    });
  }

  async disconnect(): Promise<void> {
    if (this.ringTimeout) {
      clearTimeout(this.ringTimeout);
      this.ringTimeout = null;
    }
    if (!this.serialPort) return;
    await new Promise<void>((resolve) => {
      this.serialPort.close(() => resolve());
    }).catch(() => {});
    this.serialPort = null;
    this._connected = false;
  }

  isConnected() { return this._connected; }
}

export const callerIdSerialService = new CallerIdSerialService();

export function setupCallerIdSerial(
  settings: CallerIdSerialSettings,
  getMainWindow: () => BrowserWindow | null,
) {
  if (!settings.enabled || !settings.portName) {
    callerIdSerialService.disconnect().catch(() => {});
    return;
  }

  callerIdSerialService.connect(settings).then((res) => {
    if (res.success) {
      console.log(`[CallerID-Serial] connected on ${settings.portName}`);
    } else {
      console.error('[CallerID-Serial] connect failed:', res.error);
    }
  });

  callerIdSerialService.onCall((phone) => {
    const win = getMainWindow();
    if (win && !win.isDestroyed()) {
      win.webContents.send('caller-id:incoming-call', {
        phone,
        timestamp: new Date().toISOString(),
      });
    }
  });
}
