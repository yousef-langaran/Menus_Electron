import { useState } from 'react';
import { toast } from '../../utils/toast';

export function useCallerIdSettings() {
  const [callerIdEnabled, setCallerIdEnabled] = useState(false);
  const [callerIdMode, setCallerIdMode] = useState<'webhook' | 'serial' | 'hid'>('webhook');
  // webhook
  const [callerIdPort, setCallerIdPort] = useState('5055');
  const [callerIdSecret, setCallerIdSecret] = useState('');
  const [callerIdPhoneField, setCallerIdPhoneField] = useState('caller');
  // serial / USB
  const [callerIdSerialPort, setCallerIdSerialPort] = useState('');
  const [callerIdSerialBaud, setCallerIdSerialBaud] = useState('9600');
  const [callerIdSerialFormat, setCallerIdSerialFormat] = useState('auto');
  const [callerIdSerialPorts, setCallerIdSerialPorts] = useState<
    Array<{ path: string; manufacturer?: string; friendlyName?: string }>
  >([]);
  const [callerIdSerialConnected, setCallerIdSerialConnected] = useState(false);
  const [callerIdSerialConnecting, setCallerIdSerialConnecting] = useState(false);
  // HID (T-Line TK-202UH)
  const [callerIdHidConnected, setCallerIdHidConnected] = useState(false);
  const [callerIdHidConnecting, setCallerIdHidConnecting] = useState(false);
  const [callerIdHidDeviceFound, setCallerIdHidDeviceFound] = useState(false);
  // common
  const [callerIdDuration, setCallerIdDuration] = useState('30');
  const [callerIdSound, setCallerIdSound] = useState(true);
  const [callerIdSaving, setCallerIdSaving] = useState(false);
  const [callerIdWebhookRunning, setCallerIdWebhookRunning] = useState(false);
  const loadCallerIdData = async () => {
    const api = window.electronAPI;
    if (!api?.getCallerIdSettings) return;
    try {
      const [s, status, serialStatus, ports, hidStatus, hidDevices] = await Promise.all([
        api.getCallerIdSettings(),
        api.getCallerIdWebhookStatus?.() ?? Promise.resolve({ running: false, port: null }),
        api.callerIdSerialStatus?.() ?? Promise.resolve({ connected: false }),
        api.callerIdSerialListPorts?.() ?? Promise.resolve([]),
        api.callerIdHidStatus?.() ?? Promise.resolve({ connected: false }),
        api.callerIdHidListDevices?.() ?? Promise.resolve([]),
      ]);
      setCallerIdEnabled(Boolean(s.enabled));
      setCallerIdMode(
        s.inputMode === 'serial' ? 'serial' : s.inputMode === 'hid' ? 'hid' : 'webhook',
      );
      setCallerIdHidConnected(Boolean(hidStatus?.connected));
      setCallerIdHidDeviceFound(Array.isArray(hidDevices) && hidDevices.length > 0);
      setCallerIdPort(String(s.webhookPort || 5055));
      setCallerIdSecret(String(s.webhookSecret || ''));
      setCallerIdPhoneField(String(s.phoneField || 'caller'));
      setCallerIdSerialPort(String(s.serialPortName || ''));
      setCallerIdSerialBaud(String(s.serialBaudRate || 9600));
      setCallerIdSerialFormat(String(s.serialFormat || 'auto'));
      setCallerIdDuration(String(s.notifyDurationSec || 30));
      setCallerIdSound(s.playSoundEnabled !== false);
      setCallerIdWebhookRunning(Boolean(status?.running));
      setCallerIdSerialConnected(Boolean(serialStatus?.connected));
      setCallerIdSerialPorts(ports ?? []);
    } catch {}
  };

  const handleCallerIdSerialRefreshPorts = async () => {
    const api = window.electronAPI;
    if (!api?.callerIdSerialListPorts) return;
    try {
      const ports = await api.callerIdSerialListPorts();
      setCallerIdSerialPorts(ports ?? []);
      if (!ports?.length) toast.info('دستگاه USB یافت نشد');
    } catch {
      toast.error('خطا در خواندن پورت‌ها');
    }
  };

  const handleCallerIdSerialConnect = async () => {
    const api = window.electronAPI;
    if (!api?.callerIdSerialConnect) return;
    setCallerIdSerialConnecting(true);
    try {
      const result = await api.callerIdSerialConnect({
        enabled: true,
        portName: callerIdSerialPort,
        baudRate: Number(callerIdSerialBaud) || 9600,
        format: callerIdSerialFormat,
      });
      if (result.success) {
        setCallerIdSerialConnected(true);
        toast.success('دستگاه Caller ID متصل شد');
      } else {
        toast.error(`خطا: ${result.error || 'اتصال ناموفق'}`);
      }
    } catch {
      toast.error('خطا در اتصال به دستگاه');
    } finally {
      setCallerIdSerialConnecting(false);
    }
  };

  const handleCallerIdSerialDisconnect = async () => {
    const api = window.electronAPI;
    if (!api?.callerIdSerialDisconnect) return;
    try {
      await api.callerIdSerialDisconnect();
      setCallerIdSerialConnected(false);
      toast.info('دستگاه Caller ID قطع شد');
    } catch {
      toast.error('خطا در قطع اتصال');
    }
  };

  // ── HID handlers ────────────────────────────────────────────────────────────
  const handleCallerIdHidCheckDevice = async () => {
    const api = window.electronAPI;
    if (!api?.callerIdHidListDevices) return;
    try {
      const devices = await api.callerIdHidListDevices();
      const found = Array.isArray(devices) && devices.length > 0;
      setCallerIdHidDeviceFound(found);
      if (found) toast.success('دستگاه T-Line TK-202UH پیدا شد!');
      else toast.info('دستگاه T-Line یافت نشد — USB را چک کنید');
    } catch {
      toast.error('خطا در جستجوی دستگاه');
    }
  };

  const handleCallerIdHidConnect = async () => {
    const api = window.electronAPI;
    if (!api?.callerIdHidConnect) return;
    setCallerIdHidConnecting(true);
    try {
      const result = await api.callerIdHidConnect();
      if (result.success) {
        setCallerIdHidConnected(true);
        toast.success('دستگاه T-Line TK-202UH متصل شد — در انتظار تماس...');
      } else {
        toast.error(`خطا: ${result.error || 'اتصال ناموفق'}`);
      }
    } catch {
      toast.error('خطا در اتصال به دستگاه HID');
    } finally {
      setCallerIdHidConnecting(false);
    }
  };

  const handleCallerIdHidDisconnect = async () => {
    const api = window.electronAPI;
    if (!api?.callerIdHidDisconnect) return;
    try {
      await api.callerIdHidDisconnect();
      setCallerIdHidConnected(false);
      toast.info('دستگاه T-Line قطع شد');
    } catch {
      toast.error('خطا در قطع اتصال');
    }
  };

  const handleCallerIdSave = async () => {
    const api = window.electronAPI;
    if (!api?.saveCallerIdSettings) return;
    setCallerIdSaving(true);
    try {
      await api.saveCallerIdSettings({
        enabled: callerIdEnabled,
        inputMode: callerIdMode,
        webhookPort: Number(callerIdPort) || 5055,
        webhookSecret: callerIdSecret,
        phoneField: callerIdPhoneField || 'caller',
        serialPortName: callerIdSerialPort,
        serialBaudRate: Number(callerIdSerialBaud) || 9600,
        serialFormat: callerIdSerialFormat,
        notifyDurationSec: Number(callerIdDuration) || 30,
        playSoundEnabled: callerIdSound,
      });
      const status = await api.getCallerIdWebhookStatus?.();
      setCallerIdWebhookRunning(Boolean(status?.running));
      const serialStatus = await api.callerIdSerialStatus?.();
      setCallerIdSerialConnected(Boolean(serialStatus?.connected));
      toast.success('تنظیمات Caller ID ذخیره شد');
    } catch {
      toast.error('خطا در ذخیره تنظیمات Caller ID');
    } finally {
      setCallerIdSaving(false);
    }
  };

  return {
    callerIdEnabled,
    setCallerIdEnabled,
    callerIdMode,
    setCallerIdMode,
    callerIdPort,
    setCallerIdPort,
    callerIdSecret,
    setCallerIdSecret,
    callerIdPhoneField,
    setCallerIdPhoneField,
    callerIdSerialPort,
    setCallerIdSerialPort,
    callerIdSerialBaud,
    setCallerIdSerialBaud,
    callerIdSerialFormat,
    setCallerIdSerialFormat,
    callerIdSerialPorts,
    callerIdSerialConnected,
    callerIdSerialConnecting,
    callerIdHidConnected,
    callerIdHidConnecting,
    callerIdHidDeviceFound,
    callerIdDuration,
    setCallerIdDuration,
    callerIdSound,
    setCallerIdSound,
    callerIdSaving,
    callerIdWebhookRunning,
    loadCallerIdData,
    handleCallerIdSerialRefreshPorts,
    handleCallerIdSerialConnect,
    handleCallerIdSerialDisconnect,
    handleCallerIdHidCheckDevice,
    handleCallerIdHidConnect,
    handleCallerIdHidDisconnect,
    handleCallerIdSave,
  };
}
