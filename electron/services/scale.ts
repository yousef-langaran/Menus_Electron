import * as net from 'net';

export type ScaleConnectionType = 'serial' | 'tcp';

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

/**
 * پارس وزن از خروجی ترازو — از فرمت‌های رایج:
 *   CAS/Jadever:  "ST,GS,+  1.234kg"  → 1.234
 *   Toledo:       "S S      1.234 kg"  → 1.234
 *   عدد خالص:    "001234"             → 1234 (کیلوگرم یا گرم بر اساس تنظیم)
 * اگر نتواند عدد مثبت استخراج کند، null بر می‌گرداند.
 */
export function parseWeight(raw: string): number | null {
  const cleaned = raw.replace(/\0/g, '').trim();
  if (!cleaned) return null;

  // استخراج اولین عدد اعشاری مثبت از رشته
  const match = cleaned.match(/(?<![0-9])([0-9]+\.?[0-9]*)/);
  if (!match) return null;

  const num = parseFloat(match[1]);
  if (!Number.isFinite(num) || num < 0) return null;
  return num;
}

async function getSerialPort(): Promise<any | null> {
  try {
    // Dynamic require — serialport باید نصب و برای Electron rebuild شده باشد
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    return require('serialport');
  } catch {
    console.warn('[Scale] serialport not available. Run: npm run rebuild');
    return null;
  }
}

export async function listSerialPorts(): Promise<Array<{ path: string; manufacturer?: string; friendlyName?: string }>> {
  try {
    const sp = await getSerialPort();
    if (!sp) return [];
    const ports = await sp.SerialPort.list();
    return ports.map((p: any) => ({
      path: p.path,
      manufacturer: p.manufacturer,
      friendlyName: p.friendlyName,
    }));
  } catch (err) {
    console.warn('[Scale] listSerialPorts error:', err);
    return [];
  }
}

type WeightCallback = (weight: number) => void;

class ScaleService {
  private serialPort: any = null;
  private tcpSocket: net.Socket | null = null;
  private _connected = false;
  private buffer = '';
  private latestWeight: number | null = null;
  private weightCallbacks = new Set<WeightCallback>();

  private onData(raw: string) {
    this.buffer += raw;
    // تقسیم بر اساس line ending های مختلف
    const lines = this.buffer.split(/\r\n|\r|\n/);
    this.buffer = lines.pop() ?? '';
    for (const line of lines) {
      if (!line.trim()) continue;
      const w = parseWeight(line);
      if (w !== null) {
        this.latestWeight = w;
        for (const cb of this.weightCallbacks) {
          try { cb(w); } catch {}
        }
      }
    }
  }

  async connect(settings: ScaleSettings): Promise<{ success: boolean; error?: string }> {
    if (settings.connectionType === 'serial') {
      if (!settings.portName?.trim()) {
        return { success: false, error: 'پورت COM انتخاب نشده است' };
      }
    } else {
      if (!settings.host?.trim()) {
        return { success: false, error: 'آدرس IP ترازو وارد نشده است' };
      }
    }

    await this.disconnect();
    this.buffer = '';
    this.latestWeight = null;

    try {
      if (settings.connectionType === 'serial') {
        return await this.connectSerial(settings);
      } else {
        return await this.connectTcp(settings);
      }
    } catch (err: any) {
      return { success: false, error: String(err?.message || err) };
    }
  }

  private async connectSerial(settings: ScaleSettings): Promise<{ success: boolean; error?: string }> {
    return new Promise(async (resolve) => {
      try {
        const sp = await getSerialPort();
        if (!sp) {
          resolve({ success: false, error: 'ماژول serialport نصب نیست. دستور "npm run rebuild" را اجرا کنید.' });
          return;
        }
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

          port.on('data', (data: Buffer) => this.onData(data.toString('latin1')));
          port.on('error', (e: Error) => {
            console.warn('[Scale] serial error:', e.message);
            this._connected = false;
          });
          port.on('close', () => { this._connected = false; });

          resolve({ success: true });
        });
      } catch (err: any) {
        resolve({ success: false, error: String(err?.message || err) });
      }
    });
  }

  private connectTcp(settings: ScaleSettings): Promise<{ success: boolean; error?: string }> {
    return new Promise((resolve) => {
      const socket = new net.Socket();
      let resolved = false;

      const finish = (result: { success: boolean; error?: string }) => {
        if (resolved) return;
        resolved = true;
        resolve(result);
      };

      const timer = setTimeout(() => {
        socket.destroy();
        finish({ success: false, error: 'تایم‌اوت اتصال TCP (5 ثانیه)' });
      }, 5000);

      socket.connect(settings.tcpPort, settings.host, () => {
        clearTimeout(timer);
        this.tcpSocket = socket;
        this._connected = true;
        socket.on('data', (data: Buffer) => this.onData(data.toString('latin1')));
        socket.on('error', (e: Error) => {
          console.warn('[Scale] tcp error:', e.message);
          this._connected = false;
        });
        socket.on('close', () => { this._connected = false; });
        finish({ success: true });
      });

      socket.on('error', (err: Error) => {
        clearTimeout(timer);
        finish({ success: false, error: err.message });
      });
    });
  }

  async disconnect(): Promise<void> {
    this._connected = false;

    if (this.serialPort) {
      try {
        if (this.serialPort.isOpen) {
          await new Promise<void>((r) => this.serialPort.close(() => r()));
        }
      } catch {}
      this.serialPort = null;
    }

    if (this.tcpSocket) {
      try { this.tcpSocket.destroy(); } catch {}
      this.tcpSocket = null;
    }

    this.buffer = '';
  }

  isConnected(): boolean {
    if (this.serialPort) return this._connected && this.serialPort.isOpen === true;
    if (this.tcpSocket) return this._connected && !this.tcpSocket.destroyed;
    return false;
  }

  getLatestWeight(): number | null {
    return this.latestWeight;
  }

  /** درخواست وزن از ترازو (برای مدل‌هایی که به صورت اکتیو می‌فرستند نیازی نیست) */
  requestWeight(): void {
    const cmd = Buffer.from('P\r\n');
    try {
      if (this.serialPort?.isOpen) this.serialPort.write(cmd);
      else if (this.tcpSocket && !this.tcpSocket.destroyed) this.tcpSocket.write(cmd);
    } catch {}
  }

  /** خواندن وزن — اگر از قبل موجود است بلافاصله برمی‌گردد، وگرنه تا timeoutMs صبر می‌کند */
  readWeight(timeoutMs = 4000): Promise<{ success: boolean; weight?: number; error?: string }> {
    if (!this.isConnected()) {
      return Promise.resolve({ success: false, error: 'ترازو متصل نیست' });
    }
    if (this.latestWeight !== null) {
      return Promise.resolve({ success: true, weight: this.latestWeight });
    }
    this.requestWeight();
    return new Promise((resolve) => {
      let done = false;
      const timer = setTimeout(() => {
        if (done) return;
        done = true;
        this.weightCallbacks.delete(cb);
        if (this.latestWeight !== null) {
          resolve({ success: true, weight: this.latestWeight });
        } else {
          resolve({ success: false, error: 'تایم‌اوت: وزنی از ترازو دریافت نشد' });
        }
      }, timeoutMs);

      const cb: WeightCallback = (weight) => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        this.weightCallbacks.delete(cb);
        resolve({ success: true, weight });
      };
      this.weightCallbacks.add(cb);
    });
  }

  /** اشتراک در وزن‌های جدید — unsubscribe را بر می‌گرداند */
  onWeight(cb: WeightCallback): () => void {
    this.weightCallbacks.add(cb);
    return () => this.weightCallbacks.delete(cb);
  }

  clearLatestWeight(): void {
    this.latestWeight = null;
  }
}

export const scaleService = new ScaleService();
