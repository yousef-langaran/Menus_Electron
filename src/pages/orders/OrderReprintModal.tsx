import type { PrinterConfig } from '../../store/printerSettingsStore';
import type { Dispatch, SetStateAction } from 'react';
import { ModalHeader, ModalBody, ModalFooter } from '@heroui/react';
import { Modal } from '@/ui/compat-modal';
import { Button } from '../../ui/compat-button';
import { ModalShell } from '../../ui/modal-shell';
import { CheckboxCompat as Checkbox } from '../../ui/compat-checkbox';

export interface OrderReprintModalProps {
  reprintModalOpen: boolean;
  setReprintModalOpen: Dispatch<SetStateAction<boolean>>;
  reprintOrder: any;
  reprintIsOffline: boolean;
  enabledPrinters: PrinterConfig[];
  reprintSelectedPrinters: string[];
  setReprintSelectedPrinters: Dispatch<SetStateAction<string[]>>;
  doReprint: () => Promise<void>;
  reprintLoading: boolean;
}

export function OrderReprintModal({
  reprintModalOpen,
  setReprintModalOpen,
  reprintOrder,
  reprintIsOffline,
  enabledPrinters,
  reprintSelectedPrinters,
  setReprintSelectedPrinters,
  doReprint,
  reprintLoading,
}: OrderReprintModalProps) {
  return (
    <Modal isOpen={reprintModalOpen} onOpenChange={setReprintModalOpen}>
      <ModalShell size="md">
        <ModalHeader>چاپ مجدد – انتخاب پرینتر</ModalHeader>
        <ModalBody className="gap-3">
          <p className="text-sm text-muted">با کدام پرینتر چاپ مجدد انجام شود؟</p>
          {reprintOrder && (
            <p className="text-sm font-medium">
              سفارش #
              {reprintIsOffline ? reprintOrder.id : reprintOrder.orderNumber || reprintOrder.id}
            </p>
          )}
          <div className="flex flex-col gap-2">
            {enabledPrinters.map((printer) => (
              <Checkbox
                key={printer.name}
                isSelected={reprintSelectedPrinters.includes(printer.name)}
                onValueChange={(checked) => {
                  if (checked) {
                    setReprintSelectedPrinters((prev) => [...prev, printer.name]);
                  } else {
                    setReprintSelectedPrinters((prev) => prev.filter((n) => n !== printer.name));
                  }
                }}
              >
                {printer.displayName || printer.name}
              </Checkbox>
            ))}
          </div>
        </ModalBody>
        <ModalFooter>
          <Button variant="flat" onPress={() => setReprintModalOpen(false)}>
            انصراف
          </Button>
          <Button
            color="primary"
            onPress={doReprint}
            isDisabled={reprintSelectedPrinters.length === 0}
            isLoading={reprintLoading}
          >
            چاپ با پرینترهای انتخاب‌شده
          </Button>
        </ModalFooter>
      </ModalShell>
    </Modal>
  );
}
