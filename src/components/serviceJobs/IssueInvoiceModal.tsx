import { useState } from 'react';
import { Modal, ModalHeader, ModalBody, ModalFooter } from '@heroui/react';
import { ModalShell } from '../../ui/modal-shell';
import { Button } from '../../ui/compat-button';
import { Input } from '../../ui/compat-input';
import type { LocalServiceJobItem } from '../../services/serviceJobsLocalDb';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  items: LocalServiceJobItem[];
  onConfirm: (opts: { warehouseId?: number; vatRate?: number; saleDate?: string }) => Promise<void>;
}

export function IssueInvoiceModal({ isOpen, onClose, items, onConfirm }: Props) {
  const [vatRate, setVatRate] = useState('');
  const [warehouseId, setWarehouseId] = useState('');
  const [isIssuing, setIsIssuing] = useState(false);

  const invoiceableTotal = items.reduce((s, i) => s + i.lineTotal, 0);
  const vatAmount = vatRate ? Math.round((invoiceableTotal * parseFloat(vatRate)) / 100) : 0;
  const grandTotal = invoiceableTotal + vatAmount;

  const handleConfirm = async () => {
    setIsIssuing(true);
    try {
      await onConfirm({
        vatRate: vatRate ? parseFloat(vatRate) : undefined,
        warehouseId: warehouseId ? parseInt(warehouseId, 10) : undefined,
        saleDate: new Date().toISOString().split('T')[0],
      });
    } finally {
      setIsIssuing(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onOpenChange={onClose}>
      <ModalShell size="md">
        <ModalHeader>صدور فاکتور فروش</ModalHeader>
        <ModalBody className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <Input label="نرخ VAT (٪) — اختیاری" type="number" value={vatRate} onValueChange={setVatRate} min="0" max="100" />
            <Input label="شناسه انبار — اختیاری" type="number" value={warehouseId} onValueChange={setWarehouseId} min="1" />
          </div>
          <div className="bg-default-100 rounded-xl px-3 py-3 space-y-1.5 text-sm">
            <div className="flex justify-between text-default-500">
              <span>جمع اقلام</span>
              <span className="font-mono">{invoiceableTotal.toLocaleString('fa-IR')} ریال</span>
            </div>
            {vatAmount > 0 && (
              <div className="flex justify-between text-default-500">
                <span>مالیات ({vatRate}٪)</span>
                <span className="font-mono">{vatAmount.toLocaleString('fa-IR')} ریال</span>
              </div>
            )}
            <div className="flex justify-between font-bold pt-1 border-t border-default-200">
              <span>جمع فاکتور</span>
              <span className="font-mono">{grandTotal.toLocaleString('fa-IR')} ریال</span>
            </div>
          </div>
          <p className="text-xs text-default-400 text-center">پس از تأیید، موجودی انبار برای اقلام علامت‌گذاری‌شده کسر می‌شود</p>
        </ModalBody>
        <ModalFooter>
          <Button variant="light" onPress={onClose} isDisabled={isIssuing}>انصراف</Button>
          <Button color="primary" onPress={handleConfirm} isLoading={isIssuing} isDisabled={items.length === 0}>
            صدور فاکتور
          </Button>
        </ModalFooter>
      </ModalShell>
    </Modal>
  );
}
