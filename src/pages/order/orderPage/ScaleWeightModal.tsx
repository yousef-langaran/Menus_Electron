import type { Dispatch, SetStateAction } from 'react';
import { ModalHeader, ModalBody, ModalFooter } from '@heroui/react';
import { Modal } from '@/ui/compat-modal';
import { Button } from '../../../ui/compat-button';
import { ModalShell } from '../../../ui/modal-shell';

export interface ScaleWeightModalProps {
  scaleModalOpen: boolean;
  setScaleModalOpen: Dispatch<SetStateAction<boolean>>;
  setScaleModalProduct: Dispatch<any>;
  setScaleWeight: Dispatch<SetStateAction<number | null>>;
  scaleModalProduct: any;
  scaleReading: boolean;
  scaleError: string;
  setScaleError: Dispatch<SetStateAction<string>>;
  setScaleReading: Dispatch<SetStateAction<boolean>>;
  scaleWeight: number | null;
  formatPrice: (price: number) => string;
  staffCartUnitPrice: (product: any) => number;
  handleScaleConfirm: () => void;
}

export function ScaleWeightModal({
  scaleModalOpen,
  setScaleModalOpen,
  setScaleModalProduct,
  setScaleWeight,
  scaleModalProduct,
  scaleReading,
  scaleError,
  setScaleError,
  setScaleReading,
  scaleWeight,
  formatPrice,
  staffCartUnitPrice,
  handleScaleConfirm,
}: ScaleWeightModalProps) {
  return (
    <Modal
      isOpen={scaleModalOpen}
      onOpenChange={(open) => {
        if (!open) {
          setScaleModalOpen(false);
          setScaleModalProduct(null);
          setScaleWeight(null);
        }
      }}
    >
      <ModalShell size="sm">
        <ModalHeader>خواندن وزن از ترازو</ModalHeader>
        <ModalBody className="text-center space-y-4 py-4">
          {scaleModalProduct && (
            <p className="font-semibold text-foreground">
              {scaleModalProduct.name_fa || scaleModalProduct.name}
            </p>
          )}
          {scaleReading ? (
            <div className="flex flex-col items-center gap-2 text-muted">
              <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" />
              <span className="text-sm">در حال خواندن وزن...</span>
            </div>
          ) : scaleError ? (
            <div className="text-danger text-sm space-y-2">
              <p>{scaleError}</p>
              <Button
                size="sm"
                variant="flat"
                onPress={async () => {
                  setScaleError('');
                  setScaleReading(true);
                  try {
                    await window.electronAPI?.scaleClearWeight?.();
                    await window.electronAPI?.scaleRequestWeight?.();
                    const r = await window.electronAPI?.scaleReadWeight?.();
                    if (r?.success && r.weight != null) setScaleWeight(r.weight);
                    else setScaleError(r?.error || 'وزنی دریافت نشد');
                  } catch (e: any) {
                    setScaleError(String(e?.message || 'خطا'));
                  } finally {
                    setScaleReading(false);
                  }
                }}
              >
                تلاش مجدد
              </Button>
            </div>
          ) : scaleWeight != null ? (
            <div className="space-y-1">
              <p className="text-4xl font-bold text-accent tabular-nums">
                {scaleModalProduct?.unit === 'گرم'
                  ? `${Math.round(scaleWeight * 1000).toLocaleString('fa-IR')} گرم`
                  : `${scaleWeight.toFixed(3)} کیلوگرم`}
              </p>
              <p className="text-sm text-muted">
                مبلغ:{' '}
                {formatPrice(
                  staffCartUnitPrice(scaleModalProduct) *
                    (scaleModalProduct?.unit === 'گرم'
                      ? Math.round(scaleWeight * 1000)
                      : scaleWeight),
                )}
              </p>
            </div>
          ) : null}
        </ModalBody>
        <ModalFooter>
          <Button
            variant="light"
            onPress={() => {
              setScaleModalOpen(false);
              setScaleModalProduct(null);
              setScaleWeight(null);
            }}
          >
            انصراف
          </Button>
          <Button
            color="primary"
            isDisabled={scaleWeight == null || scaleReading}
            onPress={handleScaleConfirm}
          >
            تأیید و افزودن به فاکتور
          </Button>
        </ModalFooter>
      </ModalShell>
    </Modal>
  );
}
