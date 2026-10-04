import type { Dispatch, SetStateAction } from 'react';
import { ModalHeader, ModalBody, ModalFooter } from '@heroui/react';
import { Modal } from '@/ui/compat-modal';
import { Input } from '@/ui/compat-input';
import { Button } from '../../ui/compat-button';
import { Select, SelectItem } from '../../ui/compat-select';
import { ModalShell } from '../../ui/modal-shell';

export interface CreditPayModalProps {
  creditPayModalOpen: boolean;
  setCreditPayModalOpen: Dispatch<SetStateAction<boolean>>;
  creditPayOrder: any;
  creditPayAmount: string;
  setCreditPayAmount: Dispatch<SetStateAction<string>>;
  creditPayMethod: 'cash' | 'card' | 'online';
  setCreditPayMethod: Dispatch<SetStateAction<'cash' | 'card' | 'online'>>;
  cashBankAccounts: { id: number; name: string; accountType: string }[];
  creditPayAccountId: string;
  setCreditPayAccountId: Dispatch<SetStateAction<string>>;
  creditPayNotes: string;
  setCreditPayNotes: Dispatch<SetStateAction<string>>;
  creditPaySaving: boolean;
  handleCreditPay: () => Promise<void>;
}

export function CreditPayModal({
  creditPayModalOpen,
  setCreditPayModalOpen,
  creditPayOrder,
  creditPayAmount,
  setCreditPayAmount,
  creditPayMethod,
  setCreditPayMethod,
  cashBankAccounts,
  creditPayAccountId,
  setCreditPayAccountId,
  creditPayNotes,
  setCreditPayNotes,
  creditPaySaving,
  handleCreditPay,
}: CreditPayModalProps) {
  return (
    <Modal isOpen={creditPayModalOpen} onOpenChange={setCreditPayModalOpen}>
      <ModalShell size="md">
        <ModalHeader>دریافت پرداخت نسیه</ModalHeader>
        <ModalBody className="gap-4">
          {creditPayOrder && (
            <div className="bg-default-soft border border-border rounded-lg p-3 text-sm space-y-1">
              <div className="font-semibold">
                فاکتور: {creditPayOrder.orderNumber || `#${creditPayOrder.id}`}
              </div>
              <div className="text-muted">مشتری: {creditPayOrder.customerPhone || '—'}</div>
              <div className="text-muted">
                مبلغ کل:{' '}
                {Number(
                  creditPayOrder.finalAmount ?? creditPayOrder.totalAmount ?? 0,
                ).toLocaleString('fa-IR')}{' '}
                ریال
              </div>
              <div className="text-warning font-medium">
                مانده:{' '}
                {Number(
                  Math.max(
                    0,
                    (creditPayOrder.finalAmount ?? creditPayOrder.totalAmount ?? 0) -
                      (creditPayOrder.creditPaidAmount ?? 0),
                  ),
                ).toLocaleString('fa-IR')}{' '}
                ریال
              </div>
            </div>
          )}
          <Input
            type="number"
            label="مبلغ دریافتی (ریال)"
            value={creditPayAmount}
            onValueChange={setCreditPayAmount}
            min={1}
            isRequired
          />
          <div className="flex flex-col gap-2">
            <span className="text-sm font-medium text-foreground">روش پرداخت</span>
            <div className="flex gap-2 flex-wrap">
              {(
                [
                  ['cash', 'نقد (صندوق)'],
                  ['card', 'کارت'],
                  ['online', 'آنلاین'],
                ] as const
              ).map(([key, label]) => (
                <Button
                  key={key}
                  size="sm"
                  variant={creditPayMethod === key ? 'solid' : 'bordered'}
                  color="primary"
                  onPress={() => setCreditPayMethod(key)}
                >
                  {label}
                </Button>
              ))}
            </div>
          </div>
          {cashBankAccounts.length > 0 && (
            <Select
              label="حساب"
              selectedKeys={creditPayAccountId ? [creditPayAccountId] : []}
              onSelectionChange={(k) => setCreditPayAccountId(String(Array.from(k)[0] || ''))}
              variant="bordered"
            >
              {cashBankAccounts.map((a) => (
                <SelectItem key={String(a.id)}>
                  {a.name} ({a.accountType === 'cashbox' ? 'صندوق' : 'بانک'})
                </SelectItem>
              ))}
            </Select>
          )}
          <Input
            label="یادداشت (اختیاری)"
            value={creditPayNotes}
            onValueChange={setCreditPayNotes}
            placeholder="مثلاً: پرداخت نقدی در محل"
          />
        </ModalBody>
        <ModalFooter>
          <Button variant="flat" onPress={() => setCreditPayModalOpen(false)}>
            انصراف
          </Button>
          <Button
            color="success"
            isLoading={creditPaySaving}
            isDisabled={!creditPayAmount || Number(creditPayAmount) <= 0}
            onPress={() => void handleCreditPay()}
          >
            ثبت پرداخت
          </Button>
        </ModalFooter>
      </ModalShell>
    </Modal>
  );
}
