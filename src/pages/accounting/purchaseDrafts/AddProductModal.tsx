import { ModalBody, ModalFooter, ModalHeader, Spinner } from '@heroui/react';
import { Modal } from '@/ui/compat-modal';
import { Button } from '../../../ui/compat-button';
import { Input } from '../../../ui/compat-input';
import { ModalShell } from '../../../ui/modal-shell';
import { Select, SelectItem } from '../../../ui/compat-select';
import { formatPriceInput, normalizePriceInput } from './shared';

export interface AddProductModalProps {
  addProductOpen: boolean;
  setAddProductOpen: (open: boolean) => void;
  isCheckingMasterProduct: boolean;
  addProductBarcode: string;
  addProductName: string;
  setAddProductName: (v: string) => void;
  categories: any[];
  addProductCategoryId: string;
  setAddProductCategoryId: (v: string) => void;
  addProductPurchasePrice: string;
  setAddProductPurchasePrice: (v: string) => void;
  addProductSalePrice: string;
  setAddProductSalePrice: (v: string) => void;
  addProductSubmitting: boolean;
  handleSubmitAddProduct: () => void | Promise<void>;
}

export function AddProductModal({
  addProductOpen,
  setAddProductOpen,
  isCheckingMasterProduct,
  addProductBarcode,
  addProductName,
  setAddProductName,
  categories,
  addProductCategoryId,
  setAddProductCategoryId,
  addProductPurchasePrice,
  setAddProductPurchasePrice,
  addProductSalePrice,
  setAddProductSalePrice,
  addProductSubmitting,
  handleSubmitAddProduct,
}: AddProductModalProps) {
  return (
    <Modal isOpen={addProductOpen} onOpenChange={setAddProductOpen} size="lg">
      <ModalShell>
        <ModalHeader>افزودن محصول جدید</ModalHeader>
        <ModalBody className="gap-3">
          {isCheckingMasterProduct && (
            <div className="flex items-center justify-center gap-2 text-muted text-sm py-2">
              <Spinner size="sm" />
              <span>در حال جستجو در محصولات پایه...</span>
            </div>
          )}
          <Input label="بارکد" value={addProductBarcode} isReadOnly />
          <Input
            label="نام محصول"
            value={addProductName}
            onValueChange={setAddProductName}
            isDisabled={isCheckingMasterProduct}
            isRequired
          />
          {categories.length === 0 ? (
            <p className="text-warning text-xs">
              هیچ دسته‌بندی‌ای یافت نشد — ابتدا از بخش محصولات یک دسته‌بندی بسازید یا با سرور
              همگام‌سازی کنید.
            </p>
          ) : (
            <Select
              label="دسته‌بندی"
              selectedKeys={addProductCategoryId ? [addProductCategoryId] : []}
              onSelectionChange={(k) => setAddProductCategoryId(String(Array.from(k)[0] || ''))}
              isDisabled={isCheckingMasterProduct}
            >
              {categories.map((c) => (
                <SelectItem key={String(c.id)}>{c.name_fa || c.name}</SelectItem>
              ))}
            </Select>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Input
              type="text"
              inputMode="numeric"
              label="قیمت خرید (برای این فاکتور)"
              value={formatPriceInput(addProductPurchasePrice)}
              onValueChange={(v) => setAddProductPurchasePrice(normalizePriceInput(v))}
              isDisabled={isCheckingMasterProduct}
              endContent={<span className="text-muted text-sm whitespace-nowrap">ریال</span>}
            />
            <Input
              type="text"
              inputMode="numeric"
              label="قیمت فروش"
              value={formatPriceInput(addProductSalePrice)}
              onValueChange={(v) => setAddProductSalePrice(normalizePriceInput(v))}
              isDisabled={isCheckingMasterProduct}
              endContent={<span className="text-muted text-sm whitespace-nowrap">ریال</span>}
            />
          </div>
        </ModalBody>
        <ModalFooter>
          <Button variant="flat" onPress={() => setAddProductOpen(false)}>
            انصراف
          </Button>
          <Button
            color="primary"
            isLoading={addProductSubmitting}
            isDisabled={isCheckingMasterProduct || categories.length === 0}
            onPress={handleSubmitAddProduct}
          >
            ثبت محصول
          </Button>
        </ModalFooter>
      </ModalShell>
    </Modal>
  );
}
