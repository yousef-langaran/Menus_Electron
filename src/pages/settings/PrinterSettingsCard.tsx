import type { PrinterConfig } from '../../store/printerSettingsStore';
import type { ReceiptConfig } from '../../store/printerSettingsStore';
import type { PrintTemplateItem } from '../../services/api';
import type { ReceiptType } from '../../store/printerSettingsStore';
import { Card, CardContent } from '@heroui/react';
import { Button } from '../../ui/compat-button';
import { Input } from '../../ui/compat-input';
import { Select, SelectItem } from '../../ui/compat-select';
import { CheckboxCompat as Checkbox } from '../../ui/compat-checkbox';
import { SwitchCompat as Switch } from '../../ui/compat-switch';
import { printTemplateKey } from '../../utils/printTemplates';

export interface PrinterSettingsCardProps {
  loadPrinters: () => Promise<void>;
  autoPrintOnNewOrder: boolean;
  setAutoPrintOnNewOrder: (enabled: boolean) => void;
  isLoadingPrinters: boolean;
  availablePrinters: { name: string; displayName?: string; description?: string }[];
  configs: Record<string, PrinterConfig>;
  getPrinterReceipts: (printerName: string) => ReceiptConfig[];
  printerTemplatesMap: Record<
    string,
    {
      id: number;
      name: string;
      paperWidth: number;
      paperLength: number;
      margin: number;
      layout?: unknown;
    } | null
  >;
  defaultTemplate: { id: number; name: string } | null;
  setPrinterEnabled: (printer: { name: string; displayName?: string }, enabled: boolean) => void;
  loadingTemplates: boolean;
  handlePrinterTemplateChange: (
    printerName: string,
    templateId: string | null,
    receiptType?: 'full' | 'kitchen',
  ) => Promise<void>;
  savingTemplateForPrinter: string | null;
  printTemplates: PrintTemplateItem[];
  updatePrinterConfig: (printerName: string, partial: Partial<PrinterConfig>) => void;
  setReceiptEnabled: (printerName: string, receiptType: ReceiptType, enabled: boolean) => void;
  setReceiptCopies: (printerName: string, receiptType: ReceiptType, copies: number) => void;
  receiptTemplateValue: (printerName: string, receiptType: 'full' | 'kitchen') => string;
  effectiveReceiptTemplateName: (printerName: string, receiptType: 'full' | 'kitchen') => string;
}

export function PrinterSettingsCard({
  loadPrinters,
  autoPrintOnNewOrder,
  setAutoPrintOnNewOrder,
  isLoadingPrinters,
  availablePrinters,
  configs,
  getPrinterReceipts,
  printerTemplatesMap,
  defaultTemplate,
  setPrinterEnabled,
  loadingTemplates,
  handlePrinterTemplateChange,
  savingTemplateForPrinter,
  printTemplates,
  updatePrinterConfig,
  setReceiptEnabled,
  setReceiptCopies,
  receiptTemplateValue,
  effectiveReceiptTemplateName,
}: PrinterSettingsCardProps) {
  return (
    <Card>
      <CardContent className="gap-4">
        <div className="flex justify-between items-center">
          <h2 className="text-lg font-semibold text-foreground border-b-2 border-accent pb-2">
            تنظیمات پرینتر
          </h2>
          <Button size="sm" variant="light" color="primary" onPress={loadPrinters}>
            بروزرسانی لیست
          </Button>
        </div>
        <div className="flex items-center justify-between rounded-lg border border-border p-3">
          <div className="flex flex-col">
            <span className="font-medium text-foreground">چاپ خودکار سفارش‌های آنلاین جدید</span>
            <span className="text-sm text-muted">
              به‌محض رسیدن هر سفارش آنلاین جدید، رسیدهای فعال روی پرینترهای فعال بدون نیاز به کلیک
              دستی چاپ می‌شوند.
            </span>
          </div>
          <Switch isSelected={autoPrintOnNewOrder} onValueChange={setAutoPrintOnNewOrder} />
        </div>
        {isLoadingPrinters ? (
          <p className="text-muted">در حال دریافت لیست پرینترها...</p>
        ) : availablePrinters.length === 0 ? (
          <p className="text-muted">هیچ پرینتری یافت نشد.</p>
        ) : (
          <div className="flex flex-col gap-4">
            {availablePrinters.map((printer) => {
              const config = configs[printer.name];
              const isEnabled = !!config?.enabled;
              const receipts = getPrinterReceipts(printer.name);
              const fullReceipt = receipts.find((r) => r.type === 'full');
              const kitchenReceipt = receipts.find((r) => r.type === 'kitchen');
              // انتخاب صریح این پرینتر؛ اگر انتخابی نشده باشد قالب پیش‌فرض برنامه اعمال می‌شود
              const hasExplicitTemplate = Object.prototype.hasOwnProperty.call(
                printerTemplatesMap,
                printer.name,
              );
              const effectiveTemplate = hasExplicitTemplate
                ? printerTemplatesMap[printer.name]
                : defaultTemplate;
              const templateValue = effectiveTemplate ? String(effectiveTemplate.id) : 'none';
              return (
                <Card key={printer.name} className="shadow-sm border border-border">
                  <CardContent className="gap-4">
                    <div className="flex flex-col gap-1">
                      <Checkbox
                        isSelected={isEnabled}
                        onValueChange={(checked) => setPrinterEnabled(printer, checked)}
                        classNames={{ label: 'font-semibold' }}
                      >
                        {printer.displayName || printer.name}
                      </Checkbox>
                      {printer.description && (
                        <p className="text-sm text-muted mr-6">{printer.description}</p>
                      )}
                    </div>
                    {isEnabled && (
                      <div className="flex flex-col gap-4 pr-6 border-t border-border pt-4">
                        {loadingTemplates ? (
                          <p className="text-sm text-muted">در حال بارگذاری قالب‌ها...</p>
                        ) : (
                          <Select
                            label="قالب چاپ این پرینتر"
                            placeholder="بدون قالب (تنظیمات دستی زیر)"
                            selectedKeys={[templateValue]}
                            onSelectionChange={(keys) => {
                              const v = Array.from(keys)[0] as string | undefined;
                              handlePrinterTemplateChange(
                                printer.name,
                                v === 'none' || !v ? null : v,
                              );
                            }}
                            isDisabled={savingTemplateForPrinter === printer.name}
                            variant="bordered"
                            size="sm"
                          >
                            <SelectItem key="none" textValue="بدون قالب">
                              بدون قالب (تنظیمات دستی زیر)
                            </SelectItem>
                            {printTemplates.map((t) => (
                              <SelectItem
                                key={String(t.id)}
                                textValue={`${t.name} (${t.paperWidth}×${t.paperLength} mm)`}
                              >
                                {t.name} ({t.paperWidth}×{t.paperLength} mm)
                              </SelectItem>
                            ))}
                          </Select>
                        )}
                        {!loadingTemplates && (
                          <p className="text-xs text-muted -mt-2">
                            قالب پایهٔ این پرینتر؛ هر رسید می‌تواند در بخش «نوع رسید» قالب متفاوت
                            خودش را داشته باشد.
                          </p>
                        )}
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                          <Input
                            type="number"
                            label="عرض کاغذ (mm)"
                            value={String(config?.paperWidth ?? 80)}
                            onValueChange={(v) =>
                              updatePrinterConfig(printer.name, { paperWidth: Number(v) || 80 })
                            }
                            min={40}
                            max={120}
                            variant="bordered"
                            size="sm"
                          />
                          <Input
                            type="number"
                            label="طول کاغذ (mm)"
                            value={String(config?.paperLength ?? 200)}
                            onValueChange={(v) =>
                              updatePrinterConfig(printer.name, {
                                paperLength: Number(v) || 200,
                              })
                            }
                            min={80}
                            max={800}
                            variant="bordered"
                            size="sm"
                          />
                          <Input
                            type="number"
                            label="حاشیه (mm)"
                            value={String(config?.margin ?? 5)}
                            onValueChange={(v) =>
                              updatePrinterConfig(printer.name, { margin: Number(v) || 5 })
                            }
                            min={0}
                            max={20}
                            variant="bordered"
                            size="sm"
                          />
                        </div>
                        <div className="border-t border-border pt-4 space-y-3">
                          <h3 className="text-sm font-medium text-foreground">نوع رسید</h3>
                          <div className="flex flex-col gap-3">
                            <div className="flex flex-col gap-3 p-3 rounded-lg bg-default-soft border border-border">
                              <div className="flex flex-wrap items-center gap-3">
                                <Checkbox
                                  isSelected={fullReceipt?.enabled ?? true}
                                  onValueChange={(checked) =>
                                    setReceiptEnabled(printer.name, 'full', checked)
                                  }
                                >
                                  رسید کامل (با قیمت)
                                </Checkbox>
                                {(fullReceipt?.enabled ?? true) && (
                                  <Input
                                    type="number"
                                    size="sm"
                                    className="w-20"
                                    min={1}
                                    max={5}
                                    value={String(fullReceipt?.copies ?? 1)}
                                    onValueChange={(v) =>
                                      setReceiptCopies(printer.name, 'full', Number(v) || 1)
                                    }
                                    aria-label="تعداد رسید کامل"
                                  />
                                )}
                              </div>
                              {(fullReceipt?.enabled ?? true) && !loadingTemplates && (
                                <div className="flex flex-col gap-1">
                                  <Select
                                    label="قالب این رسید"
                                    selectedKeys={[receiptTemplateValue(printer.name, 'full')]}
                                    onSelectionChange={(keys) => {
                                      const v = Array.from(keys)[0] as string | undefined;
                                      handlePrinterTemplateChange(
                                        printer.name,
                                        v ?? 'inherit',
                                        'full',
                                      );
                                    }}
                                    isDisabled={
                                      savingTemplateForPrinter ===
                                      printTemplateKey(printer.name, 'full')
                                    }
                                    variant="bordered"
                                    size="sm"
                                  >
                                    <SelectItem key="inherit" textValue="مثل قالب پرینتر">
                                      مثل قالب پرینتر
                                    </SelectItem>
                                    <SelectItem key="none" textValue="بدون قالب">
                                      بدون قالب (تنظیمات دستی بالا)
                                    </SelectItem>
                                    {printTemplates.map((t) => (
                                      <SelectItem
                                        key={String(t.id)}
                                        textValue={`${t.name} (${t.paperWidth}×${t.paperLength} mm)`}
                                      >
                                        {t.name} ({t.paperWidth}×{t.paperLength} mm)
                                      </SelectItem>
                                    ))}
                                  </Select>
                                  <p className="text-xs text-muted">
                                    الان با «{effectiveReceiptTemplateName(printer.name, 'full')}»
                                    چاپ می‌شود
                                  </p>
                                </div>
                              )}
                            </div>
                            <div className="flex flex-col gap-3 p-3 rounded-lg bg-default-soft border border-border">
                              <div className="flex flex-wrap items-center gap-3">
                                <Checkbox
                                  isSelected={kitchenReceipt?.enabled ?? false}
                                  onValueChange={(checked) =>
                                    setReceiptEnabled(printer.name, 'kitchen', checked)
                                  }
                                >
                                  رسید آشپزخانه (بدون قیمت)
                                </Checkbox>
                                {(kitchenReceipt?.enabled ?? false) && (
                                  <Input
                                    type="number"
                                    size="sm"
                                    className="w-20"
                                    min={1}
                                    max={5}
                                    value={String(kitchenReceipt?.copies ?? 1)}
                                    onValueChange={(v) =>
                                      setReceiptCopies(printer.name, 'kitchen', Number(v) || 1)
                                    }
                                    aria-label="تعداد رسید آشپزخانه"
                                  />
                                )}
                              </div>
                              {(kitchenReceipt?.enabled ?? false) && !loadingTemplates && (
                                <div className="flex flex-col gap-1">
                                  <Select
                                    label="قالب این رسید"
                                    selectedKeys={[receiptTemplateValue(printer.name, 'kitchen')]}
                                    onSelectionChange={(keys) => {
                                      const v = Array.from(keys)[0] as string | undefined;
                                      handlePrinterTemplateChange(
                                        printer.name,
                                        v ?? 'inherit',
                                        'kitchen',
                                      );
                                    }}
                                    isDisabled={
                                      savingTemplateForPrinter ===
                                      printTemplateKey(printer.name, 'kitchen')
                                    }
                                    variant="bordered"
                                    size="sm"
                                  >
                                    <SelectItem key="inherit" textValue="مثل قالب پرینتر">
                                      مثل قالب پرینتر
                                    </SelectItem>
                                    <SelectItem key="none" textValue="بدون قالب">
                                      بدون قالب (تنظیمات دستی بالا)
                                    </SelectItem>
                                    {printTemplates.map((t) => (
                                      <SelectItem
                                        key={String(t.id)}
                                        textValue={`${t.name} (${t.paperWidth}×${t.paperLength} mm)`}
                                      >
                                        {t.name} ({t.paperWidth}×{t.paperLength} mm)
                                      </SelectItem>
                                    ))}
                                  </Select>
                                  <p className="text-xs text-muted">
                                    الان با «{effectiveReceiptTemplateName(printer.name, 'kitchen')}
                                    » چاپ می‌شود
                                  </p>
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
        <p className="text-muted text-sm">
          برای هر پرینتر می‌توانید قالب چاپ و نوع/تعداد رسید را جداگانه تنظیم کنید. اگر از یک پرینتر
          دو فیش می‌گیرید، برای هرکدام در بخش «نوع رسید» قالب دلخواه خودش را انتخاب کنید؛ در غیر این
          صورت هر دو با قالب پایهٔ پرینتر چاپ می‌شوند. این تنظیمات برای چاپ خودکار رسید هنگام ثبت
          سفارش استفاده می‌شود.
        </p>
      </CardContent>
    </Card>
  );
}
