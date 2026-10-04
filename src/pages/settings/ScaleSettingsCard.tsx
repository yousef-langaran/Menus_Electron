import type { Dispatch, SetStateAction } from 'react';
import { Card, CardContent } from '@heroui/react';
import { Button } from '../../ui/compat-button';
import { Input } from '../../ui/compat-input';
import { Select, SelectItem } from '../../ui/compat-select';

export interface ScaleSettingsCardProps {
  scaleConnected: boolean;
  scaleConnectionType: 'serial' | 'tcp';
  setScaleConnectionType: Dispatch<SetStateAction<'serial' | 'tcp'>>;
  scalePortName: string;
  setScalePortName: Dispatch<SetStateAction<string>>;
  scalePorts: { path: string; manufacturer?: string; friendlyName?: string }[];
  handleRefreshPorts: () => Promise<void>;
  scaleBaudRate: string;
  setScaleBaudRate: Dispatch<SetStateAction<string>>;
  scaleHost: string;
  setScaleHost: Dispatch<SetStateAction<string>>;
  scaleTcpPort: string;
  setScaleTcpPort: Dispatch<SetStateAction<string>>;
  scaleSaving: boolean;
  handleScaleSave: () => Promise<void>;
  handleScaleDisconnect: () => Promise<void>;
  scaleConnecting: boolean;
  handleScaleConnect: () => Promise<void>;
}

export function ScaleSettingsCard({
  scaleConnected,
  scaleConnectionType,
  setScaleConnectionType,
  scalePortName,
  setScalePortName,
  scalePorts,
  handleRefreshPorts,
  scaleBaudRate,
  setScaleBaudRate,
  scaleHost,
  setScaleHost,
  scaleTcpPort,
  setScaleTcpPort,
  scaleSaving,
  handleScaleSave,
  handleScaleDisconnect,
  scaleConnecting,
  handleScaleConnect,
}: ScaleSettingsCardProps) {
  return (
    <Card>
      <CardContent className="gap-3">
        <div className="flex items-center justify-between border-b-2 border-accent pb-2">
          <h2 className="text-lg font-semibold text-foreground">اتصال ترازو</h2>
          <span
            className={`text-xs px-2 py-1 rounded-full font-medium ${scaleConnected ? 'bg-success-soft text-success-soft-foreground' : 'bg-default-soft text-muted'}`}
          >
            {scaleConnected ? 'متصل' : 'قطع'}
          </span>
        </div>

        <Select
          label="نوع اتصال"
          selectedKeys={[scaleConnectionType]}
          onSelectionChange={(keys) =>
            setScaleConnectionType(String(Array.from(keys)[0] || 'serial') as 'serial' | 'tcp')
          }
          variant="bordered"
          size="sm"
          className="max-w-xs"
        >
          <SelectItem key="serial">سریال / USB (COM Port)</SelectItem>
          <SelectItem key="tcp">شبکه (TCP/IP)</SelectItem>
        </Select>

        {scaleConnectionType === 'serial' ? (
          <div className="flex gap-2 flex-wrap items-end">
            <Select
              label="پورت COM"
              selectedKeys={scalePortName ? [scalePortName] : []}
              onSelectionChange={(keys) => setScalePortName(String(Array.from(keys)[0] || ''))}
              variant="bordered"
              size="sm"
              className="flex-1 min-w-[140px]"
              placeholder={scalePorts.length === 0 ? 'پورتی یافت نشد' : 'انتخاب پورت'}
            >
              {scalePorts.map((p) => (
                <SelectItem key={p.path} textValue={p.path}>
                  {p.path}
                  {p.friendlyName
                    ? ` — ${p.friendlyName}`
                    : p.manufacturer
                      ? ` (${p.manufacturer})`
                      : ''}
                </SelectItem>
              ))}
            </Select>
            <Button size="sm" variant="flat" onPress={handleRefreshPorts}>
              بازخوانی پورت‌ها
            </Button>
            <Select
              label="Baud Rate"
              selectedKeys={[scaleBaudRate]}
              onSelectionChange={(keys) => setScaleBaudRate(String(Array.from(keys)[0] || '9600'))}
              variant="bordered"
              size="sm"
              className="w-32"
            >
              {['1200', '2400', '4800', '9600', '19200', '38400', '57600', '115200'].map((b) => (
                <SelectItem key={b}>{b}</SelectItem>
              ))}
            </Select>
          </div>
        ) : (
          <div className="flex gap-2 flex-wrap">
            <Input
              label="آدرس IP ترازو"
              value={scaleHost}
              onValueChange={setScaleHost}
              placeholder="192.168.1.100"
              variant="bordered"
              size="sm"
              className="flex-1 min-w-[180px]"
            />
            <Input
              label="پورت TCP"
              value={scaleTcpPort}
              onValueChange={setScaleTcpPort}
              placeholder="8000"
              variant="bordered"
              size="sm"
              className="w-28"
            />
          </div>
        )}

        <div className="flex gap-2 flex-wrap">
          <Button size="sm" variant="flat" isLoading={scaleSaving} onPress={handleScaleSave}>
            ذخیره تنظیمات
          </Button>
          {scaleConnected ? (
            <Button size="sm" color="danger" variant="flat" onPress={handleScaleDisconnect}>
              قطع اتصال
            </Button>
          ) : (
            <Button
              size="sm"
              color="primary"
              variant="flat"
              isLoading={scaleConnecting}
              onPress={handleScaleConnect}
            >
              اتصال و تست
            </Button>
          )}
        </div>

        <p className="text-xs text-muted">
          پس از تنظیم، دکمه «اتصال و تست» را بزنید. اگر موفق شد ترازو آماده استفاده در فاکتور است.
        </p>
      </CardContent>
    </Card>
  );
}
