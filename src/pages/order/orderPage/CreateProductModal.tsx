import type { MasterProduct } from '../../../services/api';
import type { Dispatch, SetStateAction, RefObject } from 'react';
import { ModalHeader, ModalBody, ModalFooter } from '@heroui/react';
import { Modal } from '@/ui/compat-modal';
import { Button } from '../../../ui/compat-button';
import { Input } from '../../../ui/compat-input';
import { Select, SelectItem } from '../../../ui/compat-select';
import { ModalShell } from '../../../ui/modal-shell';
import { NameAutocomplete } from '../../../ui/NameAutocomplete';
import { searchMasterProducts } from '../../../services/api';
import { formatPriceInput, normalizePriceInput, PRODUCT_UNITS } from './shared';

export interface CreateProductModalProps {
  showCreateProductModal: boolean;
  setShowCreateProductModal: Dispatch<SetStateAction<boolean>>;
  isCheckingMasterProduct: boolean;
  newProductForm: {
    name_fa: string;
    name: string;
    price: string;
    category_id: string;
    barcode: string;
    unit: string;
  };
  setNewProductForm: Dispatch<
    SetStateAction<{
      name_fa: string;
      name: string;
      price: string;
      category_id: string;
      barcode: string;
      unit: string;
    }>
  >;
  nameSuggestTimerRef: RefObject<NodeJS.Timeout | null>;
  setNameSuggestions: Dispatch<SetStateAction<MasterProduct[]>>;
  token: string | null;
  nameSuggestions: MasterProduct[];
  productLoader: {
    products: any[];
    setProducts: Dispatch<SetStateAction<any[]>>;
    categories: string[];
    productCategories: any[];
    cartItemOptions: string[];
    isLoading: boolean;
    error: string;
    isMobileRequired: boolean;
    isScaleIntegrationEnabled: boolean;
    restrictScaleAccess: boolean;
    isCardTerminalEnabled: boolean;
    restrictCardTerminalAccess: boolean;
    allowDirectSendAmountToCardTerminal: boolean;
    loadProducts: () => Promise<void>;
  };
  creatingProduct: boolean;
  submitCreateProduct: () => Promise<void>;
}

export function CreateProductModal({
  showCreateProductModal,
  setShowCreateProductModal,
  isCheckingMasterProduct,
  newProductForm,
  setNewProductForm,
  nameSuggestTimerRef,
  setNameSuggestions,
  token,
  nameSuggestions,
  productLoader,
  creatingProduct,
  submitCreateProduct,
}: CreateProductModalProps) {
  return (
    <Modal isOpen={showCreateProductModal} onOpenChange={setShowCreateProductModal}>
      <ModalShell size="lg">
        <ModalHeader>افزودن محصول جدید با بارکد</ModalHeader>
        <ModalBody className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {isCheckingMasterProduct && (
            <p className="text-muted text-sm text-center col-span-2 py-1">
              در حال جستجو در محصولات پایه...
            </p>
          )}
          <Input
            label="بارکد"
            value={newProductForm.barcode}
            readOnly
            onValueChange={(v) => setNewProductForm((f) => ({ ...f, barcode: v }))}
          />
          <NameAutocomplete
            value={newProductForm.name_fa}
            autoFocus={!isCheckingMasterProduct}
            isDisabled={isCheckingMasterProduct}
            onValueChange={(v) => {
              setNewProductForm((f) => ({ ...f, name_fa: v }));
              if (nameSuggestTimerRef.current) clearTimeout(nameSuggestTimerRef.current);
              if (!v.trim()) {
                setNameSuggestions([]);
                return;
              }
              nameSuggestTimerRef.current = setTimeout(async () => {
                const results = await searchMasterProducts(v, token || undefined);
                setNameSuggestions(results);
              }, 300);
            }}
            suggestions={nameSuggestions}
            onSelect={(s) => {
              setNewProductForm((f) => ({
                ...f,
                name_fa: s.name,
                name: f.name || s.name,
                barcode: f.barcode || s.barcode || '',
              }));
              setNameSuggestions([]);
            }}
          />
          <Input
            label="نام انگلیسی (اختیاری)"
            value={newProductForm.name}
            isDisabled={isCheckingMasterProduct}
            onValueChange={(v) => setNewProductForm((f) => ({ ...f, name: v }))}
          />
          <Input
            label="قیمت (ریال)"
            type="text"
            inputMode="numeric"
            value={formatPriceInput(newProductForm.price)}
            isDisabled={isCheckingMasterProduct}
            onValueChange={(v) =>
              setNewProductForm((f) => ({ ...f, price: normalizePriceInput(v) }))
            }
          />
          <Select
            label="دسته‌بندی"
            selectedKeys={newProductForm.category_id ? [newProductForm.category_id] : []}
            isDisabled={isCheckingMasterProduct}
            onSelectionChange={(keys) =>
              setNewProductForm((f) => ({ ...f, category_id: String(Array.from(keys)[0] || '') }))
            }
          >
            {productLoader.productCategories.map((c: any) => (
              <SelectItem key={String(c.id)}>{c.name_fa || c.name}</SelectItem>
            ))}
          </Select>
          <Select
            label="واحد شمارش"
            selectedKeys={[newProductForm.unit || 'عدد']}
            isDisabled={isCheckingMasterProduct}
            onSelectionChange={(keys) =>
              setNewProductForm((f) => ({ ...f, unit: String(Array.from(keys)[0] || 'عدد') }))
            }
          >
            {PRODUCT_UNITS.map((u) => (
              <SelectItem key={u}>{u}</SelectItem>
            ))}
          </Select>
        </ModalBody>
        <ModalFooter>
          <Button variant="light" onPress={() => setShowCreateProductModal(false)}>
            انصراف
          </Button>
          <Button
            color="primary"
            isLoading={creatingProduct}
            isDisabled={isCheckingMasterProduct}
            onPress={submitCreateProduct}
          >
            ثبت و افزودن به سبد
          </Button>
        </ModalFooter>
      </ModalShell>
    </Modal>
  );
}
