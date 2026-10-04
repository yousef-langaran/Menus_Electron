import { useState } from 'react';
import { toast } from '../../utils/toast';

export function useScaleSettings() {
  const [scaleConnectionType, setScaleConnectionType] = useState<'serial' | 'tcp'>('serial');
  const [scalePortName, setScalePortName] = useState('');
  const [scaleBaudRate, setScaleBaudRate] = useState('9600');
  const [scaleHost, setScaleHost] = useState('');
  const [scaleTcpPort, setScaleTcpPort] = useState('8000');
  const [scalePorts, setScalePorts] = useState<
    Array<{ path: string; manufacturer?: string; friendlyName?: string }>
  >([]);
  const [scaleConnected, setScaleConnected] = useState(false);
  const [scaleConnecting, setScaleConnecting] = useState(false);
  const [scaleSaving, setScaleSaving] = useState(false);

  const loadScaleData = async () => {
    const api = window.electronAPI;
    if (!api?.scaleLoadSettings) return;
    try {
      const [settings, status, ports] = await Promise.all([
        api.scaleLoadSettings(),
        api.scaleStatus?.() ?? Promise.resolve({ connected: false, latestWeight: null }),
        api.scaleListPorts?.() ?? Promise.resolve([]),
      ]);
      if (settings) {
        setScaleConnectionType(settings.connectionType === 'tcp' ? 'tcp' : 'serial');
        setScalePortName(settings.portName || '');
        setScaleBaudRate(String(settings.baudRate || 9600));
        setScaleHost(settings.host || '');
        setScaleTcpPort(String(settings.tcpPort || 8000));
      }
      setScaleConnected(status?.connected ?? false);
      setScalePorts(ports ?? []);
    } catch {}
  };

  const handleScaleSave = async () => {
    const api = window.electronAPI;
    if (!api?.scaleSaveSettings) return;
    setScaleSaving(true);
    try {
      await api.scaleSaveSettings({
        connectionType: scaleConnectionType,
        portName: scalePortName,
        baudRate: Number(scaleBaudRate) || 9600,
        host: scaleHost,
        tcpPort: Number(scaleTcpPort) || 8000,
      });
      toast.success('تنظیمات ترازو ذخیره شد');
    } catch {
      toast.error('خطا در ذخیره تنظیمات ترازو');
    } finally {
      setScaleSaving(false);
    }
  };

  const handleScaleConnect = async () => {
    const api = window.electronAPI;
    if (!api?.scaleConnect) return;
    setScaleConnecting(true);
    try {
      await api.scaleSaveSettings?.({
        connectionType: scaleConnectionType,
        portName: scalePortName,
        baudRate: Number(scaleBaudRate) || 9600,
        host: scaleHost,
        tcpPort: Number(scaleTcpPort) || 8000,
      });
      const result = await api.scaleConnect({
        connectionType: scaleConnectionType,
        portName: scalePortName,
        baudRate: Number(scaleBaudRate) || 9600,
        host: scaleHost,
        tcpPort: Number(scaleTcpPort) || 8000,
      });
      if (result.success) {
        setScaleConnected(true);
        toast.success('ترازو با موفقیت متصل شد');
      } else {
        toast.error(`خطا: ${result.error || 'اتصال ناموفق'}`);
      }
    } catch (err: any) {
      toast.error(String(err?.message || 'خطا در اتصال ترازو'));
    } finally {
      setScaleConnecting(false);
    }
  };

  const handleScaleDisconnect = async () => {
    const api = window.electronAPI;
    if (!api?.scaleDisconnect) return;
    try {
      await api.scaleDisconnect();
      setScaleConnected(false);
      toast.info('ترازو قطع شد');
    } catch {
      toast.error('خطا در قطع ترازو');
    }
  };

  const handleRefreshPorts = async () => {
    const api = window.electronAPI;
    if (!api?.scaleListPorts) return;
    try {
      const ports = await api.scaleListPorts();
      setScalePorts(ports ?? []);
      if (ports.length === 0) toast.info('پورت سریال یافت نشد');
    } catch {
      toast.error('خطا در دریافت پورت‌ها');
    }
  };

  return {
    scaleConnectionType,
    setScaleConnectionType,
    scalePortName,
    setScalePortName,
    scaleBaudRate,
    setScaleBaudRate,
    scaleHost,
    setScaleHost,
    scaleTcpPort,
    setScaleTcpPort,
    scalePorts,
    scaleConnected,
    scaleConnecting,
    scaleSaving,
    loadScaleData,
    handleScaleSave,
    handleScaleConnect,
    handleScaleDisconnect,
    handleRefreshPorts,
  };
}
