import type { PrinterConfig } from '../../store/printerSettingsStore';
import { ModalHeader, ModalBody, ModalFooter } from '@heroui/react';
import { Modal } from '@/ui/compat-modal';
import { Button } from '../../ui/compat-button';
import { Select, SelectItem } from '../../ui/compat-select';
import { ModalShell } from '../../ui/modal-shell';

export interface OrderPreviewModalProps {
  previewVisible: boolean;
  closePreview: () => void;
  previewTitle: string;
  enabledPrinters: PrinterConfig[];
  previewPrinterName: string;
  handlePreviewPrinterChange: (newPrinterName: string) => Promise<void>;
  previewLoading: boolean;
  previewImage: string;
  previewHtml: string;
}

export function OrderPreviewModal({
  previewVisible,
  closePreview,
  previewTitle,
  enabledPrinters,
  previewPrinterName,
  handlePreviewPrinterChange,
  previewLoading,
  previewImage,
  previewHtml,
}: OrderPreviewModalProps) {
  return (
    <Modal isOpen={previewVisible} onOpenChange={(open) => !open && closePreview()}>
      <ModalShell size="full" scrollBehavior="inside">
        <ModalHeader className="flex flex-col gap-2">
          <div className="flex flex-row justify-between items-center w-full">
            <h3 className="text-lg font-semibold">{previewTitle || 'پیش‌نمایش رسید'}</h3>
            <Button size="sm" variant="light" isIconOnly onPress={closePreview}>
              ×
            </Button>
          </div>
          {enabledPrinters.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 w-full">
              <span className="text-sm text-muted">پیش‌نمایش با تنظیمات پرینتر:</span>
              <Select
                size="sm"
                className="max-w-56"
                selectedKeys={previewPrinterName ? [previewPrinterName] : []}
                onSelectionChange={(keys) => {
                  const v = Array.from(keys)[0] as string;
                  if (v) handlePreviewPrinterChange(v);
                }}
                variant="bordered"
                placeholder="انتخاب پرینتر"
              >
                {enabledPrinters.map((p) => (
                  <SelectItem key={p.name} textValue={p.displayName || p.name}>
                    {p.displayName || p.name}
                  </SelectItem>
                ))}
              </Select>
            </div>
          )}
        </ModalHeader>
        <ModalBody>
          {previewLoading ? (
            <div className="py-12 text-center text-muted">در حال آماده‌سازی پیش‌نمایش...</div>
          ) : previewImage ? (
            <img src={previewImage} alt="receipt-preview" className="max-w-full h-auto mx-auto" />
          ) : (
            <iframe
              title="receipt-preview"
              className="w-full min-h-[400px] border-0 rounded-lg"
              srcDoc={previewHtml || ''}
            />
          )}
        </ModalBody>
        <ModalFooter>
          <Button variant="flat" onPress={closePreview}>
            بستن
          </Button>
        </ModalFooter>
      </ModalShell>
    </Modal>
  );
}
