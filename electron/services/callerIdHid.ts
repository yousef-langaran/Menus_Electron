import { BrowserWindow } from 'electron';

/**
 * T-Line TK-202UH USB Caller ID (HID Vendor-Defined)
 * ─────────────────────────────────────────────────────────────────────
 * Hardware: VID=0x16C0, PID=0x05DA  (V-USB shared vendor ID)
 * Driver:   WinUSB (must be installed via Zadig — replaces HID class driver)
 * Protocol: HID GET_REPORT → 80-byte record cycling through statuses
 *
 * Record formats (ASCII, null-padded to 80 bytes):
 *
 *   Noise / status (ignore):
 *     "~OK TILDA KISH\nHP[state][ctr][chk]Z8&P…"
 *
 *   Idle:
 *     "L1:On-hook 2017/MM/DD HH:MM:SS Dialed: Duration:NNNNN EEE\n"
 *     "L2:Off-hook 2017/MM/DD HH:MM:SS EEE\n"
 *
 *   ★ PRIMARY — Incoming call with full Caller ID (wValue=0x0100):
 *     "L1:CallerID:989916446728 2017/05/28 16:20:00 EEE\n"
 *     Phone is in international format without '+' (98XXXXXXXXXX).
 *     Normalise: 989XXXXXXXXX → 09XXXXXXXXX (Iran local format).
 *
 *   Ringing without CID yet (first ring, before FSK decoded):
 *     "L1:RingsCount:XX EEE\n\n<PHONE> YYYY/MM/DD HH:MM:SS EEE\n"
 *
 *   After missed call:
 *     "L1:Missed Call! EEE\n\n<PHONE> YYYY/MM/DD HH:MM:SS EEE\n"
 *
 * Note: the device's internal RTC shows year 2017 (clock not set correctly).
 * We use system time for the call timestamp instead.
 */

// ─── types ────────────────────────────────────────────────────────────────────

export interface CallerIdHidSettings {
  enabled: boolean;
}

export const DEFAULT_CALLER_ID_HID_SETTINGS: CallerIdHidSettings = {
  enabled: false,
};

export interface HidDevice {
  vendorId: number;
  productId: number;
  manufacturer?: string;
  product?: string;
  serialNumber?: string;
}

type IncomingCallCallback = (phone: string) => void;
type CallEndedCallback = () => void;

// ─── USB constants ───────────────────────────────────────────────────────────

const VID = 0x16c0;
const PID = 0x05da;

// HID GET_REPORT request parameters
const BM_REQUEST_TYPE  = 0xa1;   // D2H | Class | Interface
const B_REQUEST        = 0x01;   // GET_REPORT
const W_VALUE_INPUT    = 0x0100; // type=Input(1), ID=0  → RingsCount live
const W_VALUE_FEATURE  = 0x0300; // type=Feature(3), ID=0 → Missed Call post-event
const W_INDEX          = 0;      // interface 0
const REPORT_LENGTH    = 80;

const POLL_INTERVAL_MS = 200;
// After connecting, ignore data for this many ms to flush old buffered events
const STARTUP_GRACE_MS = 2_500;
// Minimum gap (ms) between two DIFFERENT call buffers — prevents rapid double-fire.
// Dedup for the SAME ongoing call is handled by comparing the raw record hex, so
// this guard only applies when the hex actually changes (i.e. a new call).
const MIN_CALL_GAP_MS = 3_000;

// ─── parser ──────────────────────────────────────────────────────────────────

interface CallerRecord {
  kind: 'idle' | 'ringing' | 'missed' | 'off-hook' | 'noise' | 'unknown';
  phone?: string;
  ringCount?: number;
  raw?: string;
}

function parseRecord(buf: Buffer): CallerRecord {
  // strip null bytes from right
  let len = buf.length;
  while (len > 0 && buf[len - 1] === 0) len--;

  const text = buf.slice(0, len).toString('ascii');
  const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);

  if (lines.length === 0) return { kind: 'noise' };

  const first = lines[0];

  if (first.startsWith('~OK TILDA KISH')) return { kind: 'noise' };
  if (first.startsWith('L1:On-hook'))     return { kind: 'idle' };
  if (first.startsWith('L2:Off-hook'))    return { kind: 'off-hook' };

  // ── PRIMARY: L1:CallerID:PHONENUMBER DATE TIME EEE ───────────────────────
  // This is the main CID record sent when the device decodes a full Caller ID.
  // Example: "L1:CallerID:989916446728 2017/05/28 16:20:00 EEE"
  // Phone is in international format (98XXXXXXXXXX) → we normalise to 0XXXXXXXXXX.
  if (first.startsWith('L1:CallerID:')) {
    const m = first.match(/^L1:CallerID:(\S+)/);
    const rawPhone = m ? m[1] : '';
    const phone = normalizeIranianPhone(rawPhone) ?? (rawPhone || undefined);
    return { kind: 'ringing', ringCount: 1, phone };
  }

  // ── SECONDARY: L1:RingsCount:XX EEE ← ringing without CID yet ───────────
  // Appears when phone rings but CID hasn't been decoded yet (first ring).
  // Phone number (if any) is on the second non-empty line.
  if (first.startsWith('L1:RingsCount:')) {
    const m = first.match(/RingsCount:(\d+)/);
    const ringCount = m ? parseInt(m[1], 10) : 0;
    const callerLine = lines[1]; // "<PHONE> DATE TIME EEE"
    const rawPhone = callerLine ? callerLine.split(/\s+/)[0] : '';
    const phone = rawPhone ? (normalizeIranianPhone(rawPhone) ?? rawPhone) : undefined;
    return { kind: 'ringing', ringCount, phone };
  }

  // ── Missed Call ───────────────────────────────────────────────────────────
  if (first.startsWith('L1:Missed Call!')) {
    const callerLine = lines[1];
    const rawPhone = callerLine ? callerLine.split(/\s+/)[0] : '';
    const phone = rawPhone ? (normalizeIranianPhone(rawPhone) ?? rawPhone) : undefined;
    return { kind: 'missed', phone };
  }

  return { kind: 'unknown', raw: first };
}

/**
 * Normalises an Iranian phone number to 09XXXXXXXXX (11-digit) local format.
 *
 * Device returns numbers in international format without '+':
 *   989916446728  →  09916446728
 *   +989916446728 →  09916446728
 *   09916446728   →  09916446728   (already local)
 *
 * Returns undefined if the input doesn't look like a valid phone number.
 */
function normalizeIranianPhone(raw: string): string | undefined {
  if (!raw) return undefined;
  const cleaned = raw.replace(/[\s+\-()]/g, '');
  if (!/^\d{7,15}$/.test(cleaned)) return undefined;

  // International with Iran code: 989... → 09...
  if (/^989\d{9}$/.test(cleaned)) return '0' + cleaned.slice(2); // 12 digits → 11
  if (/^98\d{9,10}$/.test(cleaned)) return '0' + cleaned.slice(2);

  // Already local: 09...
  if (/^0\d{9,10}$/.test(cleaned)) return cleaned;

  // Short internal extension or other format — return as-is
  return cleaned;
}

// ─── service ─────────────────────────────────────────────────────────────────

class CallerIdHidService {
  private usbDevice: any = null;
  private iface: any = null;
  private _connected = false;
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private callbacks = new Set<IncomingCallCallback>();
  private callEndedCallbacks = new Set<CallEndedCallback>();

  // Hex-based dedup: store the full raw hex of the last CallerID/ringing buffer
  // we emitted for. Each new call produces a new record with a different device
  // timestamp, so the hex changes → new event fires even if same caller calls back.
  // Reset to '' when a call ends so the guard is ready for the next call.
  private lastEmittedCallerHex = '';
  // Short absolute time guard: prevents rapid double-fire when a new hex appears
  private lastEmittedTime = 0;
  // startup grace: ignore records until connectTime + STARTUP_GRACE_MS
  private connectTime = 0;
  private lastKind: CallerRecord['kind'] = 'idle';
  // When true, reconnect automatically when the device is plugged back in
  private autoReconnect = false;
  // Fallback call-end timer: if no ringing record for 8 s, assume call ended
  private callEndTimer: ReturnType<typeof setTimeout> | null = null;

  onCall(cb: IncomingCallCallback) {
    this.callbacks.add(cb);
    return () => this.callbacks.delete(cb);
  }

  onCallEnded(cb: CallEndedCallback) {
    this.callEndedCallbacks.add(cb);
    return () => this.callEndedCallbacks.delete(cb);
  }

  setAutoReconnect(enabled: boolean) { this.autoReconnect = enabled; }
  shouldAutoReconnect() { return this.autoReconnect; }

  private emit(phone: string) {
    this.callbacks.forEach((cb) => {
      try { cb(phone); } catch {}
    });
  }

  private emitCallEnded() {
    this.callEndedCallbacks.forEach((cb) => {
      try { cb(); } catch {}
    });
  }

  // ── list available T-Line / TK-202UH devices ──────────────────────────────
  static listDevices(): HidDevice[] {
    try {
      const usb = require('usb');
      const devices: any[] = usb.getDeviceList ? usb.getDeviceList() : [];
      return devices
        .filter((d: any) =>
          d.deviceDescriptor?.idVendor  === VID &&
          d.deviceDescriptor?.idProduct === PID
        )
        .map((d: any) => ({
          vendorId:  d.deviceDescriptor.idVendor,
          productId: d.deviceDescriptor.idProduct,
        }));
    } catch {
      return [];
    }
  }

  // ── connect ───────────────────────────────────────────────────────────────
  async connect(): Promise<{ success: boolean; error?: string }> {
    await this.disconnect();

    let usb: any;
    try {
      usb = require('usb');
    } catch {
      return { success: false, error: 'ماژول usb نصب نیست — npm install usb را اجرا کنید' };
    }

    const device = usb.findByIds(VID, PID);
    if (!device) {
      return {
        success: false,
        error:
          'دستگاه T-Line TK-202UH یافت نشد.\n' +
          'مطمئن شوید دستگاه وصل است و درایور WinUSB از طریق Zadig نصب شده باشد.',
      };
    }

    try {
      device.open();
    } catch (e: any) {
      return { success: false, error: 'خطا در باز کردن دستگاه USB: ' + (e?.message || e) };
    }

    // Claim interface 0
    let iface: any;
    try {
      iface = device.interface(0);
      iface.claim();
    } catch (e: any) {
      try { device.close(); } catch {}
      return { success: false, error: 'خطا در claim کردن interface: ' + (e?.message || e) };
    }

    this.usbDevice = device;
    this.iface    = iface;
    this._connected = true;
    this.connectTime = Date.now();
    this.lastEmittedCallerHex = '';
    this.lastEmittedTime = 0;
    this.lastKind = 'idle';
    if (this.callEndTimer) { clearTimeout(this.callEndTimer); this.callEndTimer = null; }

    // start polling
    this.startPolling();

    console.log('[CallerID-HID] connected to T-Line TK-202UH');
    return { success: true };
  }

  // ── disconnect ────────────────────────────────────────────────────────────
  async disconnect(): Promise<void> {
    if (this.callEndTimer) { clearTimeout(this.callEndTimer); this.callEndTimer = null; }
    this.stopPolling();
    if (this.iface) {
      try { this.iface.release(true, () => {}); } catch {}
      this.iface = null;
    }
    if (this.usbDevice) {
      try { this.usbDevice.close(); } catch {}
      this.usbDevice = null;
    }
    this._connected = false;
  }

  isConnected() { return this._connected; }

  // ── polling ───────────────────────────────────────────────────────────────
  private startPolling() {
    this.stopPolling();
    this.pollTimer = setInterval(() => this.doPoll(), POLL_INTERVAL_MS);
  }

  private stopPolling() {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
  }

  private doPoll() {
    if (!this.usbDevice || !this._connected) return;

    // Only poll 0x0100 (Input,ID=0) — this slot returns the CURRENT live status:
    //   L1:On-hook      → idle
    //   L1:CallerID:XX  → incoming call with full CID  ← what we want
    //   L1:RingsCount:N → ringing before CID decoded
    //
    // We do NOT poll 0x0300 (Feature,ID=0) because that slot returns the LAST
    // MISSED CALL record (stale historical data) and would show old numbers.
    this.pollWValue(W_VALUE_INPUT);
  }

  private pollWValue(wValue: number) {
    if (!this.usbDevice || !this._connected) return;
    this.usbDevice.controlTransfer(
      BM_REQUEST_TYPE,
      B_REQUEST,
      wValue,
      W_INDEX,
      REPORT_LENGTH,
      (err: any, data: Buffer) => {
        if (err) {
          const msg = String(err?.message || err);
          if (msg.includes('LIBUSB_ERROR_NO_DEVICE') || err.errno === -4 || err.errno === -5) {
            console.warn('[CallerID-HID] device disconnected:', msg);
            this.disconnect().catch(() => {});
          }
          // Other errors (LIBUSB_ERROR_PIPE etc.) are transient — ignore
          return;
        }
        if (!data || data.length === 0) return;
        try {
          const rec = parseRecord(data);
          this.handleRecord(rec, wValue, data.toString('hex'));
        } catch {}
      }
    );
  }

  // ── call-end fallback timer ───────────────────────────────────────────────
  // The device interleaves ~OK TILDA KISH noise records with meaningful ones
  // WHILE THE PHONE IS RINGING, so we CANNOT use "noise after ringing" as the
  // call-ended signal — it would fire 200 ms after the overlay appears.
  //
  // Instead we use explicit end-of-call records:
  //   L1:Missed Call!  → reliable: fired after rejection or caller hangs up
  //   L2:Off-hook      → call answered; overlay no longer needed
  //   L1:On-hook       → line idle
  //
  // Plus this 8-second ringing timeout as a fallback (covers edge cases where
  // none of the above records arrive, e.g. very brief calls).
  private resetCallEndTimer() {
    if (this.callEndTimer) { clearTimeout(this.callEndTimer); }
    this.callEndTimer = setTimeout(() => {
      this.callEndTimer = null;
      if (this.lastEmittedCallerHex !== '') {
        console.log('[CallerID-HID] 📵 call ended (ringing timeout — no ring for 8s)');
        this.lastEmittedCallerHex = '';
        this.emitCallEnded();
      }
    }, 8_000);
  }

  private triggerCallEnded(reason: string) {
    if (this.callEndTimer) { clearTimeout(this.callEndTimer); this.callEndTimer = null; }
    if (this.lastEmittedCallerHex !== '') {
      console.log(`[CallerID-HID] 📵 call ended (${reason})`);
      this.lastEmittedCallerHex = '';
      this.emitCallEnded();
    }
  }

  private handleRecord(rec: CallerRecord, wValue: number, rawHex: string) {
    // Noise / unknown: just skip — the device sends ~OK TILDA KISH between every
    // meaningful record even WHILE the phone is ringing, so we must never treat
    // noise as a call-ended signal.
    if (rec.kind === 'noise' || rec.kind === 'unknown') return;

    // Log state transitions for debugging
    if (rec.kind !== this.lastKind) {
      console.log(
        `[CallerID-HID] wValue=0x${wValue.toString(16)} state: ${this.lastKind} → ${rec.kind}`,
        rec.phone ? `phone=${rec.phone}` : '',
        rec.ringCount != null ? `rings=${rec.ringCount}` : '',
      );
      this.lastKind = rec.kind;
    }

    const now = Date.now();

    // Startup grace period: skip any buffered old call events
    if (now - this.connectTime < STARTUP_GRACE_MS) {
      if (rec.kind === 'ringing' || rec.kind === 'missed') {
        console.log('[CallerID-HID] startup grace — skipping buffered event');
      }
      return;
    }

    // ── explicit call-ended signals ──────────────────────────────────────────
    // L1:Missed Call! → caller hung up / we rejected → reliable end-of-call
    // L2:Off-hook     → call answered → overlay no longer needed
    // L1:On-hook      → line returned to idle
    if (rec.kind === 'missed' || rec.kind === 'off-hook' || rec.kind === 'idle') {
      this.triggerCallEnded(rec.kind);
      return;
    }

    if (rec.kind === 'ringing') {
      // Keep the fallback timer alive as long as the phone is ringing
      this.resetCallEndTimer();

      // Ring check: CallerID records map to ringCount=1; skip bare RingsCount:0
      const ringOk = (rec.ringCount ?? 0) >= 1;
      if (!ringOk) return;

      // Phone quality check: require a non-empty number with ≥ 7 digits.
      // Empty phone means CID hasn't been decoded yet (first ring before FSK) —
      // skip and wait for the L1:CallerID: record that carries the full number.
      const phone = rec.phone || '';
      const digitCount = phone.replace(/\D/g, '').length;
      if (!phone || digitCount < 7) {
        if (phone) console.warn(`[CallerID-HID] ignoring short phone (${phone}) — stale/partial data`);
        return;
      }

      // ── Hex-based dedup ──────────────────────────────────────────────────────
      // Each new call produces a fresh record with a new device timestamp, so
      // rawHex changes between calls even for the same number.  Same hex =
      // same ongoing ring → skip.  Different hex = new call → emit.
      if (rawHex === this.lastEmittedCallerHex) return; // same ongoing ring

      // Short absolute-time guard: prevents rapid double-fire
      if (now - this.lastEmittedTime < MIN_CALL_GAP_MS) return;

      const emitPhone = phone || 'unknown';
      this.lastEmittedCallerHex = rawHex;
      this.lastEmittedTime = now;
      console.log(`[CallerID-HID] 📞 INCOMING CALL: ${emitPhone}`);
      this.emit(emitPhone);
    }
  }
}

// ─── singleton ────────────────────────────────────────────────────────────────
export const callerIdHidService = new CallerIdHidService();

/** Convenience function for the IPC handler */
export function listHidDevices(): HidDevice[] {
  return CallerIdHidService.listDevices();
}

// ─── setup helper (called from main.ts) ──────────────────────────────────────

// USB attach/detach listeners are registered once per process lifetime.
let _usbListenersRegistered = false;

export function setupCallerIdHid(
  settings: CallerIdHidSettings,
  getMainWindow: () => BrowserWindow | null,
) {
  if (!settings.enabled) {
    callerIdHidService.setAutoReconnect(false);
    callerIdHidService.disconnect().catch(() => {});
    return;
  }

  callerIdHidService.setAutoReconnect(true);

  // ── Register USB attach/detach listeners (once for the lifetime of the process)
  if (!_usbListenersRegistered) {
    _usbListenersRegistered = true;
    try {
      const usb = require('usb');

      // Detach: clean up state
      usb.on('detach', (det: any) => {
        if (
          det.deviceDescriptor?.idVendor  === VID &&
          det.deviceDescriptor?.idProduct === PID
        ) {
          console.log('[CallerID-HID] device detached');
          callerIdHidService.disconnect().catch(() => {});
        }
      });

      // Attach: re-connect when device is plugged back in (if enabled)
      usb.on('attach', (att: any) => {
        if (
          att.deviceDescriptor?.idVendor  === VID &&
          att.deviceDescriptor?.idProduct === PID
        ) {
          console.log('[CallerID-HID] device attached — attempting auto-reconnect');
          if (!callerIdHidService.shouldAutoReconnect()) return;
          // Small delay so the OS finishes USB enumeration before we open the device
          setTimeout(() => {
            if (!callerIdHidService.shouldAutoReconnect()) return;
            callerIdHidService.connect().then((res) => {
              if (res.success) {
                console.log('[CallerID-HID] auto-reconnected successfully');
              } else {
                console.error('[CallerID-HID] auto-reconnect failed:', res.error);
              }
            }).catch(() => {});
          }, 1_500);
        }
      });
    } catch (e) {
      console.warn('[CallerID-HID] could not register USB listeners:', e);
    }
  }

  // ── Connect at startup
  callerIdHidService.connect().then((res) => {
    if (res.success) {
      console.log('[CallerID-HID] auto-connected at startup');
    } else {
      console.error('[CallerID-HID] auto-connect failed:', res.error);
    }
  });

  // ── Forward events to renderer
  callerIdHidService.onCall((phone) => {
    const win = getMainWindow();
    if (win && !win.isDestroyed()) {
      win.webContents.send('caller-id:incoming-call', {
        phone,
        timestamp: new Date().toISOString(),
      });
    }
  });

  callerIdHidService.onCallEnded(() => {
    const win = getMainWindow();
    if (win && !win.isDestroyed()) {
      win.webContents.send('caller-id:call-ended');
    }
  });
}
