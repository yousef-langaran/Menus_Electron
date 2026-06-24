import { useEffect, useState } from 'react';
import { Modal, ModalHeader, ModalBody, ModalFooter } from '@heroui/react';
import { ModalShell } from '../../ui/modal-shell';
import { Button } from '../../ui/compat-button';
import { Input } from '../../ui/compat-input';
import { CheckboxCompat } from '../../ui/compat-checkbox';
import { formatPriceInput, parseFormattedNumber } from '../../utils/money';
import type { LocalServiceJobItem, ServiceJobItemType } from '../../services/serviceJobsLocalDb';

const ITEM_TYPES: { value: ServiceJobItemType; label: string }[] = [
  { value: 'service', label: 'خدمت' },
  { value: 'product', label: 'محصول' },
  { value: 'labor', label: 'کارمزد' },
];

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onSave: (data: { itemType: ServiceJobItemType; description: string; quantity: number; unitPrice: number; deductFromInventory: boolean }) => Promise<void>;
  editItem?: LocalServiceJobItem | null;
}

export function AddJobItemModal({ isOpen, onClose, onSave, editItem }: Props) {
  const [itemType, setItemType] = useState<ServiceJobItemType>('service');
  const [description, setDescription] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [unitPrice, setUnitPrice] = useState('0');
  const [deductFromInventory, setDeductFromInventory] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (editItem) {
      setItemType(editItem.itemType);
      setDescription(editItem.description);
      setQuantity(String(editItem.quantity));
      setUnitPrice(String(editItem.unitPrice));
      setDeductFromInventory(editItem.deductFromInventory);
    } else {
      setItemType('service'); setDescription(''); setQuantity('1'); setUnitPrice('0'); setDeductFromInventory(false);
    }
  }, [editItem, isOpen]);

  const lineTotal = Math.round((parseFloat(quantity) || 0) * (parseInt(unitPrice, 10) || 0));

  const handleSave = async () => {
    const qty = parseFloat(quantity);
    const price = parseInt(unitPrice, 10);
    if (!description.trim() || isNaN(qty) || qty <= 0 || isNaN(price) || price < 0) return;
    setIsSaving(true);
    try {
      await onSave({ itemType, description: description.trim(), quantity: qty, unitPrice: price, deductFromInventory });
      onClose();
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onOpenChange={onClose}>
      <ModalShell size="md">
        <ModalHeader>{editItem ? 'ویرایش قلم' : 'افزودن قلم'}</ModalHeader>
        <ModalBody className="space-y-3">
          <div className="flex gap-2">
            {ITEM_TYPES.map((t) => (
              <button
                key={t.value}
                onClick={() => setItemType(t.value)}
                className={`flex-1 py-1.5 rounded-xl text-sm border transition-colors ${
                  itemType === t.value ? 'bg-primary-500 text-white border-primary-500' : 'border-default-200 text-default-600 hover:border-primary-300'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
          <Input label="شرح قلم *" value={description} onValueChange={setDescription} />
          <div className="grid grid-cols-2 gap-3">
            <Input label="تعداد" type="number" value={quantity} onValueChange={setQuantity} min="0.001" step="0.001" />
            <Input
              label="قیمت واحد (ریال)"
              value={formatPriceInput(unitPrice)}
              onValueChange={(v) => setUnitPrice(v === '' ? '' : String(parseFormattedNumber(v)))}
            />
          </div>
          <div className="flex justify-between items-center px-3 py-2 bg-default-100 rounded-xl text-sm">
            <span className="text-default-500">جمع این قلم:</span>
            <span className="font-bold font-mono">{lineTotal.toLocaleString('fa-IR')} ریال</span>
          </div>
          {itemType === 'product' && (
            <CheckboxCompat isSelected={deductFromInventory} onValueChange={setDeductFromInventory}>
              کسر از انبار هنگام صدور فاکتور
            </CheckboxCompat>
          )}
        </ModalBody>
        <ModalFooter>
          <Button variant="light" onPress={onClose} isDisabled={isSaving}>انصراف</Button>
          <Button color="primary" onPress={handleSave} isLoading={isSaving} isDisabled={!description.trim()}>
            {editItem ? 'ذخیره تغییرات' : 'افزودن قلم'}
          </Button>
        </ModalFooter>
      </ModalShell>
    </Modal>
  );
}
