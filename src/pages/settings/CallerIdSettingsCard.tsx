import type { Dispatch, SetStateAction } from 'react';
import { Card, CardContent, Tabs, TabListContainer, TabList, Tab } from '@heroui/react';
import { Button } from '../../ui/compat-button';
import { Input } from '../../ui/compat-input';
import { Select, SelectItem } from '../../ui/compat-select';
import { SwitchCompat as Switch } from '../../ui/compat-switch';

export interface CallerIdSettingsCardProps {
  callerIdEnabled: boolean;
  setCallerIdEnabled: Dispatch<SetStateAction<boolean>>;
  callerIdMode: 'serial' | 'webhook' | 'hid';
  setCallerIdMode: Dispatch<SetStateAction<'serial' | 'webhook' | 'hid'>>;
  callerIdPort: string;
  setCallerIdPort: Dispatch<SetStateAction<string>>;
  callerIdPhoneField: string;
  setCallerIdPhoneField: Dispatch<SetStateAction<string>>;
  callerIdSecret: string;
  setCallerIdSecret: Dispatch<SetStateAction<string>>;
  callerIdWebhookRunning: boolean;
  callerIdSerialPort: string;
  setCallerIdSerialPort: Dispatch<SetStateAction<string>>;
  callerIdSerialPorts: { path: string; manufacturer?: string; friendlyName?: string }[];
  handleCallerIdSerialRefreshPorts: () => Promise<void>;
  callerIdSerialBaud: string;
  setCallerIdSerialBaud: Dispatch<SetStateAction<string>>;
  callerIdSerialFormat: string;
  setCallerIdSerialFormat: Dispatch<SetStateAction<string>>;
  callerIdSerialConnected: boolean;
  handleCallerIdSerialDisconnect: () => Promise<void>;
  callerIdSerialConnecting: boolean;
  handleCallerIdSerialConnect: () => Promise<void>;
  callerIdHidDeviceFound: boolean;
  callerIdHidConnected: boolean;
  handleCallerIdHidCheckDevice: () => Promise<void>;
  handleCallerIdHidDisconnect: () => Promise<void>;
  callerIdHidConnecting: boolean;
  handleCallerIdHidConnect: () => Promise<void>;
  callerIdDuration: string;
  setCallerIdDuration: Dispatch<SetStateAction<string>>;
  callerIdSound: boolean;
  setCallerIdSound: Dispatch<SetStateAction<boolean>>;
  callerIdSaving: boolean;
  handleCallerIdSave: () => Promise<void>;
}

export function CallerIdSettingsCard({
  callerIdEnabled,
  setCallerIdEnabled,
  callerIdMode,
  setCallerIdMode,
  callerIdPort,
  setCallerIdPort,
  callerIdPhoneField,
  setCallerIdPhoneField,
  callerIdSecret,
  setCallerIdSecret,
  callerIdWebhookRunning,
  callerIdSerialPort,
  setCallerIdSerialPort,
  callerIdSerialPorts,
  handleCallerIdSerialRefreshPorts,
  callerIdSerialBaud,
  setCallerIdSerialBaud,
  callerIdSerialFormat,
  setCallerIdSerialFormat,
  callerIdSerialConnected,
  handleCallerIdSerialDisconnect,
  callerIdSerialConnecting,
  handleCallerIdSerialConnect,
  callerIdHidDeviceFound,
  callerIdHidConnected,
  handleCallerIdHidCheckDevice,
  handleCallerIdHidDisconnect,
  callerIdHidConnecting,
  handleCallerIdHidConnect,
  callerIdDuration,
  setCallerIdDuration,
  callerIdSound,
  setCallerIdSound,
  callerIdSaving,
  handleCallerIdSave,
}: CallerIdSettingsCardProps) {
  return (
    <Card>
      <CardContent>
        <div className="flex flex-col gap-4">
          {/* header + master toggle */}
          <div className="flex items-center justify-between">
            <div>
              <h2 className="font-semibold text-foreground">شناسایی تماس‌گیرنده (Caller ID)</h2>
              <p className="text-xs text-muted mt-0.5">
                هنگام تماس ورودی، اطلاعات مشتری و سوابق سفارش نمایش داده می‌شود.
              </p>
            </div>
            <Switch
              isSelected={callerIdEnabled}
              onValueChange={setCallerIdEnabled}
              size="sm"
              aria-label="فعال‌سازی Caller ID"
            />
          </div>

          {callerIdEnabled && (
            <div className="flex flex-col gap-4 border-t border-border pt-3">
              {/* mode selector */}
              <Tabs
                selectedKey={callerIdMode}
                onSelectionChange={(k) => setCallerIdMode(k as 'webhook' | 'serial' | 'hid')}
                aria-label="نوع ورودی Caller ID"
              >
                <TabListContainer>
                  <TabList>
                    <Tab id="webhook">🌐 VOIP / Webhook</Tab>
                    <Tab id="serial">🔌 دستگاه USB (COM)</Tab>
                    <Tab id="hid">📞 T-Line TK-202UH</Tab>
                  </TabList>
                </TabListContainer>
              </Tabs>

              {/* ─── Webhook mode ─── */}
              {callerIdMode === 'webhook' && (
                <div className="flex flex-col gap-3">
                  <div className="flex gap-2 flex-wrap items-end">
                    <Input
                      label="پورت webhook محلی"
                      value={callerIdPort}
                      onValueChange={setCallerIdPort}
                      placeholder="5055"
                      variant="bordered"
                      size="sm"
                      className="w-36"
                      description="سیستم VOIP به این پورت POST می‌زند"
                    />
                    <Input
                      label="نام فیلد شماره تماس"
                      value={callerIdPhoneField}
                      onValueChange={setCallerIdPhoneField}
                      placeholder="caller"
                      variant="bordered"
                      size="sm"
                      className="w-40"
                      description="نام فیلد در body JSON"
                    />
                  </div>
                  <Input
                    label="توکن احراز هویت (اختیاری)"
                    value={callerIdSecret}
                    onValueChange={setCallerIdSecret}
                    placeholder="X-Secret یا Bearer token"
                    variant="bordered"
                    size="sm"
                    type="password"
                    description="اگر خالی باشد همه درخواست‌ها پذیرفته می‌شوند"
                  />
                  <div className="flex items-center gap-2">
                    <span
                      className={`w-2 h-2 rounded-full ${callerIdWebhookRunning ? 'bg-green-500' : 'bg-gray-400'}`}
                    />
                    <span className="text-xs text-muted">
                      {callerIdWebhookRunning
                        ? `webhook فعال روی پورت ${callerIdPort}`
                        : 'webhook غیرفعال'}
                    </span>
                  </div>
                  <div className="rounded-xl bg-default-soft p-3 text-xs text-muted flex flex-col gap-1">
                    <p className="font-semibold text-foreground/70">
                      نحوه اتصال VOIP / FXO Gateway
                    </p>
                    <code className="bg-default rounded px-1.5 py-0.5 font-mono text-foreground/80 break-all">
                      POST http://127.0.0.1:{callerIdPort}/call
                    </code>
                    <code className="bg-default rounded px-1.5 py-0.5 font-mono text-foreground/80">
                      {`{"${callerIdPhoneField || 'caller'}": "09123456789"}`}
                    </code>
                  </div>
                </div>
              )}

              {/* ─── USB/Serial mode ─── */}
              {callerIdMode === 'serial' && (
                <div className="flex flex-col gap-3">
                  <p className="text-xs text-muted">
                    دستگاه‌های USB Caller ID موجود در بازار (جعبه تلفن با USB) را انتخاب کنید. پس از
                    وصل کردن USB، پورت‌ها را رفرش کنید.
                  </p>

                  <div className="flex gap-2 flex-wrap items-end">
                    <Select
                      label="دستگاه USB Caller ID"
                      placeholder="انتخاب پورت..."
                      variant="bordered"
                      size="sm"
                      className="flex-1 min-w-[160px]"
                      selectedKeys={callerIdSerialPort ? [callerIdSerialPort] : []}
                      onSelectionChange={(keys) =>
                        setCallerIdSerialPort(Array.from(keys)[0] as string)
                      }
                    >
                      {callerIdSerialPorts.map((p) => (
                        <SelectItem key={p.path} value={p.path}>
                          {p.path}
                          {p.friendlyName
                            ? ` — ${p.friendlyName}`
                            : p.manufacturer
                              ? ` (${p.manufacturer})`
                              : ''}
                        </SelectItem>
                      ))}
                    </Select>
                    <Button size="sm" variant="flat" onPress={handleCallerIdSerialRefreshPorts}>
                      رفرش پورت‌ها
                    </Button>
                  </div>

                  <div className="flex gap-2 flex-wrap items-end">
                    <Select
                      label="نرخ Baud"
                      variant="bordered"
                      size="sm"
                      className="w-36"
                      selectedKeys={[callerIdSerialBaud]}
                      onSelectionChange={(keys) =>
                        setCallerIdSerialBaud(Array.from(keys)[0] as string)
                      }
                    >
                      {['1200', '2400', '4800', '9600', '19200', '38400', '57600', '115200'].map(
                        (b) => (
                          <SelectItem key={b}>{b}</SelectItem>
                        ),
                      )}
                    </Select>
                    <Select
                      label="فرمت دستگاه"
                      variant="bordered"
                      size="sm"
                      className="flex-1 min-w-[180px]"
                      selectedKeys={[callerIdSerialFormat]}
                      onSelectionChange={(keys) =>
                        setCallerIdSerialFormat(Array.from(keys)[0] as string)
                      }
                    >
                      <SelectItem key="auto">خودکار (تشخیص فرمت)</SelectItem>
                      <SelectItem key="at-clip">مودم AT — +CLIP</SelectItem>
                      <SelectItem key="cid-nmbr">CID — NMBR=...</SelectItem>
                      <SelectItem key="caller-field">CALLER: / NUMBER:</SelectItem>
                      <SelectItem key="raw-number">شماره خالص</SelectItem>
                    </Select>
                  </div>

                  <div className="flex items-center gap-2">
                    <span
                      className={`w-2 h-2 rounded-full ${callerIdSerialConnected ? 'bg-green-500' : 'bg-gray-400'}`}
                    />
                    <span className="text-xs text-muted">
                      {callerIdSerialConnected ? `متصل روی ${callerIdSerialPort}` : 'قطع'}
                    </span>
                  </div>

                  <div className="flex gap-2 flex-wrap">
                    {callerIdSerialConnected ? (
                      <Button
                        size="sm"
                        color="danger"
                        variant="flat"
                        onPress={handleCallerIdSerialDisconnect}
                      >
                        قطع اتصال دستگاه
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        color="primary"
                        variant="flat"
                        isLoading={callerIdSerialConnecting}
                        onPress={handleCallerIdSerialConnect}
                      >
                        اتصال و تست دستگاه
                      </Button>
                    )}
                  </div>

                  <div className="rounded-xl bg-default-soft p-3 text-xs text-muted flex flex-col gap-1.5">
                    <p className="font-semibold text-foreground/70">دستگاه‌های USB سازگار</p>
                    <p>
                      اکثر جعبه‌های Caller ID موجود در بازار ایران با فرمت «خودکار» کار می‌کنند.
                    </p>
                    <p>
                      اگر دستگاه شما از نوع مودم USB است (AT commands)، گزینه «مودم AT» را انتخاب
                      کنید.
                    </p>
                    <p>در صورت اتصال، هر تماس ورودی را با تست واقعی بررسی کنید.</p>
                  </div>
                </div>
              )}

              {/* ─── T-Line TK-202UH HID mode ─── */}
              {callerIdMode === 'hid' && (
                <div className="flex flex-col gap-3">
                  <div className="rounded-xl bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 p-3 text-xs flex flex-col gap-1.5">
                    <p className="font-semibold text-blue-700 dark:text-blue-300">
                      📞 T-Line TK-202UH
                    </p>
                    <p className="text-foreground/70">دستگاه USB Caller ID مدل TK-202UH تیلداکیش</p>
                    <p className="text-muted">
                      قبل از اتصال، مطمئن شوید درایور <strong>WinUSB</strong> از طریق{' '}
                      <strong>Zadig</strong> روی این دستگاه نصب شده باشد. (منوی Options → List All
                      Devices → T-Line TK-202UH → WinUSB → Replace Driver)
                    </p>
                  </div>

                  <div className="flex items-center gap-3 flex-wrap">
                    <div className="flex items-center gap-2">
                      <span
                        className={`w-2.5 h-2.5 rounded-full ${callerIdHidDeviceFound ? 'bg-green-500' : 'bg-gray-400'}`}
                      />
                      <span className="text-xs text-muted">
                        {callerIdHidDeviceFound ? 'دستگاه پیدا شد' : 'دستگاه یافت نشد'}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span
                        className={`w-2.5 h-2.5 rounded-full ${callerIdHidConnected ? 'bg-green-500 animate-pulse' : 'bg-gray-400'}`}
                      />
                      <span className="text-xs text-muted">
                        {callerIdHidConnected ? 'در حال پایش تماس‌ها' : 'قطع'}
                      </span>
                    </div>
                  </div>

                  <div className="flex gap-2 flex-wrap">
                    <Button size="sm" variant="flat" onPress={handleCallerIdHidCheckDevice}>
                      🔍 شناسایی دستگاه
                    </Button>
                    {callerIdHidConnected ? (
                      <Button
                        size="sm"
                        color="danger"
                        variant="flat"
                        onPress={handleCallerIdHidDisconnect}
                      >
                        قطع اتصال
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        color="primary"
                        variant="flat"
                        isLoading={callerIdHidConnecting}
                        onPress={handleCallerIdHidConnect}
                        isDisabled={!callerIdHidDeviceFound}
                      >
                        اتصال و شروع پایش
                      </Button>
                    )}
                  </div>

                  <div className="rounded-xl bg-default-soft p-3 text-xs text-muted flex flex-col gap-1.5">
                    <p className="font-semibold text-foreground/70">راهنمای نصب Zadig</p>
                    <ol className="list-decimal list-inside flex flex-col gap-0.5 pr-1">
                      <li>دستگاه TK-202UH را به USB وصل کنید</li>
                      <li>
                        Zadig را از <strong>zadig.akeo.ie</strong> دانلود و اجرا کنید
                      </li>
                      <li>
                        از منوی Options گزینه <strong>List All Devices</strong> را فعال کنید
                      </li>
                      <li>
                        دستگاه <strong>T-LINE</strong> یا <strong>TK-202UH</strong> را انتخاب کنید
                      </li>
                      <li>
                        درایور را روی <strong>WinUSB</strong> تنظیم کنید و{' '}
                        <strong>Replace Driver</strong> را بزنید
                      </li>
                      <li>پس از نصب، «شناسایی دستگاه» را بزنید</li>
                    </ol>
                  </div>
                </div>
              )}

              {/* ─── تنظیمات عمومی ─── */}
              <div className="flex flex-col gap-2 border-t border-border pt-3">
                <Input
                  label="مدت نمایش اعلان (ثانیه)"
                  value={callerIdDuration}
                  onValueChange={setCallerIdDuration}
                  placeholder="30"
                  variant="bordered"
                  size="sm"
                  className="w-44"
                />
                <div className="flex items-center gap-2">
                  <Switch
                    isSelected={callerIdSound}
                    onValueChange={setCallerIdSound}
                    size="sm"
                    aria-label="پخش صدا"
                  />
                  <span className="text-sm text-foreground/70">پخش صدای زنگ هنگام تماس ورودی</span>
                </div>
              </div>
            </div>
          )}

          <Button size="sm" variant="flat" isLoading={callerIdSaving} onPress={handleCallerIdSave}>
            ذخیره تنظیمات Caller ID
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
