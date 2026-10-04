import type { ProductForm } from './shared';
import type { MasterProduct } from '../../services/api';
import type { LocalCategory } from '../../services/catalogLocalDb';
import type { Dispatch, SetStateAction, RefObject } from 'react';
import { ModalHeader, ModalBody, ModalFooter } from '@heroui/react';
import { Modal } from '@/ui/compat-modal';
import { Button } from '../../ui/compat-button';
import { Input } from '../../ui/compat-input';
import { ModalShell } from '../../ui/modal-shell';
import { Select, SelectItem } from '../../ui/compat-select';
import { NameAutocomplete } from '../../ui/NameAutocomplete';
import { searchMasterProducts } from '../../services/api';
import { formatPriceInput, normalizePriceInput, SCALE_UNITS, PRODUCT_UNITS } from './shared';

export interface ProductFormModalProps {
  modalOpen: boolean;
  setModalOpen: Dispatch<SetStateAction<boolean>>;
  form: ProductForm;
  setForm: Dispatch<SetStateAction<ProductForm>>;
  nameSuggestTimerRef: RefObject<NodeJS.Timeout | null>;
  setNameSuggestions: Dispatch<SetStateAction<MasterProduct[]>>;
  token: string | null;
  nameSuggestions: MasterProduct[];
  categories: LocalCategory[];
  saving: boolean;
  submit: () => Promise<void>;
}

export function ProductFormModal({
  modalOpen,
  setModalOpen,
  form,
  setForm,
  nameSuggestTimerRef,
  setNameSuggestions,
  token,
  nameSuggestions,
  categories,
  saving,
  submit,
}: ProductFormModalProps) {
  return (
    <Modal isOpen={modalOpen} onOpenChange={setModalOpen}>
      <ModalShell size="lg">
        <ModalHeader>{form.id !== undefined ? 'ویرایش محصول' : 'افزودن محصول'}</ModalHeader>
        <ModalBody className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <NameAutocomplete
            value={form.name_fa}
            onValueChange={(v) => {
              setForm((f) => ({ ...f, name_fa: v }));
              if (nameSuggestTimerRef.current) clearTimeout(nameSuggestTimerRef.current);
              if (!v.trim()) {
                setNameSuggestions([]);
                return;
              }
              nameSuggestTimerRef.current = setTimeout(async () => {
                const results = await searchMasterProducts(v, token ?? undefined);
                setNameSuggestions(results);
              }, 300);
            }}
            suggestions={nameSuggestions}
            onSelect={(s) => {
              setForm((f) => ({
                ...f,
                name_fa: s.name,
                name: f.name || s.name,
                barcode: f.barcode || s.barcode || '',
              }));
              setNameSuggestions([]);
            }}
          />
          <Input
            label="نام انگلیسی"
            value={form.name}
            onValueChange={(v) => setForm((f) => ({ ...f, name: v }))}
          />
          <Input
            label="بارکد"
            value={form.barcode}
            onValueChange={(v) => setForm((f) => ({ ...f, barcode: v }))}
          />
          <Input
            label="قیمت (ریال)"
            type="text"
            inputMode="numeric"
            value={formatPriceInput(form.price)}
            onValueChange={(v) => setForm((f) => ({ ...f, price: normalizePriceInput(v) }))}
          />
          <Select
            label="دسته‌بندی"
            selectedKeys={form.category_id ? [form.category_id] : []}
            onSelectionChange={(keys) =>
              setForm((f) => ({ ...f, category_id: String(Array.from(keys)[0] || '') }))
            }
          >
            {categories.map((c) => (
              <SelectItem key={String(c.id)}>
                {c.name_fa || c.name}
                {c._syncStatus !== 'synced' ? ' ⏳' : ''}
              </SelectItem>
            ))}
          </Select>
          <Select
            label="واحد شمارش"
            selectedKeys={[form.unit || 'عدد']}
            onSelectionChange={(keys) => {
              const unit = String(Array.from(keys)[0] || 'عدد');
              setForm((f) => ({
                ...f,
                unit,
                useScaleForWeight: SCALE_UNITS.includes(unit) ? f.useScaleForWeight : false,
              }));
            }}
          >
            {PRODUCT_UNITS.map((u) => (
              <SelectItem key={u}>{u}</SelectItem>
            ))}
          </Select>
          {SCALE_UNITS.includes(form.unit) && (
            <div className="md:col-span-2 flex items-center gap-2 rounded-lg border border-border bg-default-soft px-3 py-2">
              <input
                type="checkbox"
                id="useScaleForWeight"
                checked={form.useScaleForWeight}
                onChange={(e) => setForm((f) => ({ ...f, useScaleForWeight: e.target.checked }))}
                className="w-4 h-4 accent-accent cursor-pointer"
              />
              <label htmlFor="useScaleForWeight" className="text-sm cursor-pointer select-none">
                وزن از ترازو خوانده شود (هنگام انتخاب این محصول در فاکتور)
              </label>
            </div>
          )}
        </ModalBody>
        <ModalFooter>
          <Button variant="light" onPress={() => setModalOpen(false)}>
            انصراف
          </Button>
          <Button color="primary" isLoading={saving} onPress={submit}>
            {form.id !== undefined ? 'ذخیره تغییرات' : 'ثبت محصول'}
          </Button>
        </ModalFooter>
      </ModalShell>
    </Modal>
  );
}
