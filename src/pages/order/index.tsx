import { useState, useEffect, useRef } from 'react';
import { useNavigate, useSearchParams, useLocation } from 'react-router-dom';
import { Card, CardContent, Modal, ModalHeader, ModalBody, ModalFooter } from '@heroui/react';
import { Button } from '../../ui/compat-button';
import { Input } from '../../ui/compat-input';
import { Select, SelectItem } from '../../ui/compat-select';
import { ModalShell } from '../../ui/modal-shell';
import { NameAutocomplete } from '../../ui/NameAutocomplete';
import { Panel, Group, Separator } from 'react-resizable-panels';
import { useAuthStore } from '../../store/authStore';
import { useOrderStore } from '../../store/orderStore';
import {
  createProduct, fetchOrderById, getMasterProductByBarcode, searchMasterProducts,
  getAssetBaseUrl, type MasterProduct,
} from '../../services/api';
import { MODULES } from '../../types';
import { hasModuleAccess, isOwnerOrAdmin } from '../../lib/electronPermissions';
import { toast } from '../../utils/toast';
import { useProductLoader } from './hooks/useProductLoader';
import { useOrderSubmit } from './hooks/useOrderSubmit';
import { OrderProductGrid } from './components/OrderProductGrid';
import { OrderCart } from './components/OrderCart';
import { OrderModal, type OrderModalState } from './components/OrderModal';

const PRODUCT_UNITS = [
  'عدد', 'کیلوگرم', 'گرم', 'لیتر', 'میلی‌لیتر',
  'متر', 'سانتی‌متر', 'بسته', 'جعبه', 'پرس', 'وعده', 'پیمانه', 'قوطی', 'بطری',
];

const normalizePriceInput = (value: string) =>
  String(value || '')
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 1632))
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 1776))
    .replace(/[^\d]/g, '');

const formatPriceInput = (value: string) => {
  const digits = normalizePriceInput(value);
  if (!digits) return '';
  return new Intl.NumberFormat('en-US').format(Number(digits));
};

const INITIAL_MODAL_STATE: OrderModalState = {
  isOpen: false, isOnline: true, userExists: null, isCheckingUser: false,
  loadedCustomerFirstName: '', loadedCustomerLastName: '',
  customerFirstNameInput: '', customerLastNameInput: '',
  showCustomerNameFields: false, customerAddresses: [], selectedAddressId: null,
  loadingAddresses: false, printOption: 'all', selectedPrinterNames: [],
  cardTerminalStatus: 'idle', cardTerminalError: '', cardTerminalRefId: '',
  cardTerminalProfiles: [], selectedCardTerminalId: '',
  cashBoxAccounts: [], selectedCashBoxId: null, selectedCashBoxName: 'صندوق',
  discountCodeError: '', availableDiscountCodes: [], loadingAvailableDiscountCodes: false,
  wheelVouchers: [], applyingVoucher: null,
};

function hasPermission(user: any, module: string) {
  return isOwnerOrAdmin(user) || hasModuleAccess(user, module, ['manage'], user?.restaurants?.[0]?.id);
}

export default function OrderPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const { user, token } = useAuthStore();
  const {
    cart, isSubmitting, clearCart, restoreDraft,
    setCustomerPhone, setCustomerAddress,
    submitOrder,
  } = useOrderStore();

  const editParam = searchParams.get('edit');
  const parsedEditId = editParam != null ? Number(editParam) : NaN;
  const editingOrderId = !Number.isNaN(parsedEditId) && parsedEditId > 0 ? parsedEditId : null;

  // Hooks
  const productLoader = useProductLoader();
  const { handleSubmit, playScanBeep, formatPrice } = useOrderSubmit();

  // UI state
  const [searchTerm, setSearchTerm] = useState('');
  const [modalState, setModalState] = useState<OrderModalState>(INITIAL_MODAL_STATE);
  const [orderEditLoading, setOrderEditLoading] = useState(false);
  const [orderEditError, setOrderEditError] = useState('');
  const prevEditingIdRef = useRef<number | null>(null);

  // Barcode / new product modal state
  const [showCreateProductModal, setShowCreateProductModal] = useState(false);
  const [creatingProduct, setCreatingProduct] = useState(false);
  const [newProductForm, setNewProductForm] = useState({ name_fa: '', name: '', price: '', category_id: '', barcode: '', unit: 'عدد' });
  const [isCheckingMasterProduct, setIsCheckingMasterProduct] = useState(false);
  const [nameSuggestions, setNameSuggestions] = useState<MasterProduct[]>([]);
  const nameSuggestTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Scale
  const [scaleModalOpen, setScaleModalOpen] = useState(false);
  const [scaleModalProduct, setScaleModalProduct] = useState<any>(null);
  const [scaleWeight, setScaleWeight] = useState<number | null>(null);
  const [scaleReading, setScaleReading] = useState(false);
  const [scaleError, setScaleError] = useState('');

  const canUseScale = !productLoader.isScaleIntegrationEnabled ||
    !productLoader.restrictScaleAccess ||
    hasPermission(user, MODULES.ELECTRON_PANEL);

  const canUseCardTerminal = !productLoader.isCardTerminalEnabled ||
    !productLoader.restrictCardTerminalAccess ||
    hasPermission(user, 'payment_terminal');

  // Load on mount
  useEffect(() => { void productLoader.loadProducts(); }, []);

  // Prefill from caller-ID overlay
  useEffect(() => {
    const prefill = (location.state as any)?.prefill;
    if (!prefill) return;
    if (prefill.customerPhone) setCustomerPhone(String(prefill.customerPhone));
    if (prefill.customerAddress) setCustomerAddress(String(prefill.customerAddress));
    if (prefill.customerName) {
      const parts = String(prefill.customerName).trim().split(/\s+/);
      setModalState((s) => ({
        ...s,
        loadedCustomerFirstName: parts[0] || '',
        loadedCustomerLastName: parts.slice(1).join(' ') || '',
        customerFirstNameInput: parts[0] || '',
        customerLastNameInput: parts.slice(1).join(' ') || '',
        userExists: true,
      }));
    }
    window.history.replaceState({}, '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.key]);

  // Load editing order
  useEffect(() => {
    const prev = prevEditingIdRef.current;
    if (prev != null && editingOrderId == null) {
      clearCart();
      setModalState((s) => ({ ...s, loadedCustomerFirstName: '', loadedCustomerLastName: '', userExists: null }));
      setOrderEditError('');
    }
    prevEditingIdRef.current = editingOrderId;
  }, [editingOrderId, clearCart]);

  useEffect(() => {
    if (editingOrderId == null) { setOrderEditLoading(false); return; }
    if (!token) { setOrderEditError('برای ویرایش فاکتور باید وارد شوید.'); return; }
    let cancelled = false;
    setOrderEditLoading(true);
    setOrderEditError('');
    fetchOrderById(editingOrderId, token)
      .then((order: any) => {
        if (cancelled) return;
        const cartItems = (order.items || []).filter((r: any) => r.product?.id).map((r: any) => ({
          productId: r.product.id, product: r.product,
          quantity: Number(r.quantity), price: Number(r.price),
          totalPrice: Number(r.price) * Number(r.quantity),
          itemOption: r.itemNote?.trim() ?? '',
        }));
        const codeVal = (order.discountCodeValue || '').trim();
        const disc = Number(order.discountAmount) || 0;
        const { restoreDraft, setDiscountType, setDiscountAmount, setDiscountCode, setAppliedDiscountCode } = useOrderStore.getState();
        restoreDraft({
          cart: cartItems,
          customerPhone: order.customerPhone || '',
          serviceType: order.serviceType === 'takeaway' ? 'takeaway' : 'dine_in',
          tableNumber: order.tableNumber || '',
          customerAddress: order.customerAddress || '',
          paymentMethod: order.paymentMethod || 'cash',
          notes: order.notes || '',
        });
        if (codeVal) { setDiscountType('code'); setDiscountCode(codeVal); setAppliedDiscountCode({ code: codeVal, discountAmount: disc }); }
        else { setDiscountType('fixed'); setDiscountAmount(disc); setAppliedDiscountCode(null); setDiscountCode(''); }
        const nameRaw = (order.customerName || '').trim();
        const parts = nameRaw.split(/\s+/).filter(Boolean);
        setModalState((s) => ({ ...s, loadedCustomerFirstName: parts[0] || '', loadedCustomerLastName: parts.slice(1).join(' ') || '', userExists: null }));
        setOrderEditLoading(false);
      })
      .catch((e: any) => {
        if (cancelled) return;
        setOrderEditLoading(false);
        setOrderEditError(e?.response?.data?.message || e?.message || 'خطا در بارگذاری سفارش');
      });
    return () => { cancelled = true; };
  }, [editingOrderId, token]);

  // Load card terminal profiles
  useEffect(() => {
    const load = async () => {
      try {
        const cfg = await window.electronAPI?.getCardTerminalConfig?.();
        const profiles = (cfg?.profiles || []).map((p: any) => ({ id: String(p.id), name: String(p.name || 'کارتخوان') }));
        setModalState((s) => ({ ...s, cardTerminalProfiles: profiles, selectedCardTerminalId: String(cfg?.defaultProfileId || profiles[0]?.id || '') }));
      } catch { setModalState((s) => ({ ...s, cardTerminalProfiles: [], selectedCardTerminalId: '' })); }
    };
    load();
  }, []);

  // Load cash boxes
  useEffect(() => {
    const load = async () => {
      try {
        const { accountingDb } = await import('../../services/accountingLocalDb');
        const rid = user?.restaurants?.[0]?.id;
        if (!rid) return;
        const accounts = await accountingDb.cashBankAccounts.where('restaurantId').equals(Number(rid))
          .filter((a: any) => a.accountType === 'cashbox' || a.accountType === 'cash').toArray();
        setModalState((s) => ({
          ...s, cashBoxAccounts: accounts || [],
          selectedCashBoxId: accounts?.[0]?.id ?? null,
          selectedCashBoxName: accounts?.[0]?.name || 'صندوق',
        }));
      } catch { setModalState((s) => ({ ...s, cashBoxAccounts: [] })); }
    };
    load();
  }, [user?.restaurants]);

  // Scale weight listener
  useEffect(() => {
    if (!scaleModalOpen || !window.electronAPI?.onScaleWeightUpdate) return;
    const unsub = window.electronAPI.onScaleWeightUpdate((weight) => {
      setScaleWeight(weight); setScaleReading(false); setScaleError('');
    });
    return () => unsub?.();
  }, [scaleModalOpen]);

  // Keyboard shortcuts
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSearchTerm('');
      if (e.key === 'Enter' && !modalState.isOpen && cart.length > 0) {
        const target = e.target as HTMLElement;
        if (!target.closest('input') && !target.closest('textarea') && !target.closest('button')) {
          setModalState((s) => ({ ...s, isOpen: true }));
          e.preventDefault();
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [modalState.isOpen, cart.length]);

  useEffect(() => {
    const onShortcut = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.shiftKey && e.key === 'Backspace') { e.preventDefault(); resetSession(); }
    };
    window.addEventListener('keydown', onShortcut);
    return () => window.removeEventListener('keydown', onShortcut);
  });

  useEffect(() => {
    const onReset = () => resetSession({ skipConfirm: true });
    window.addEventListener('menus-electron:reset-order-session', onReset);
    return () => window.removeEventListener('menus-electron:reset-order-session', onReset);
  });

  // Error toasts
  useEffect(() => { if (orderEditError) { toast.error(orderEditError); setOrderEditError(''); } }, [orderEditError]);

  const resetSession = (options?: { skipConfirm?: boolean }) => {
    if ((cart.length > 0 || editingOrderId != null) && !options?.skipConfirm) {
      if (!window.confirm('سبد خرید ریست شود؟')) return;
    }
    clearCart();
    setModalState(INITIAL_MODAL_STATE);
    setSearchTerm('');
    if (editingOrderId != null) navigate('/order');
  };

  const staffCartUnitPrice = (product: any) => Number(product?.price || 0);

  const openScaleModal = async (product: any) => {
    setScaleModalProduct(product); setScaleWeight(null); setScaleError(''); setScaleModalOpen(true); setScaleReading(true);
    try {
      await window.electronAPI?.scaleClearWeight?.();
      await window.electronAPI?.scaleRequestWeight?.();
      const result = await window.electronAPI?.scaleReadWeight?.();
      if (result?.success && result.weight != null) setScaleWeight(result.weight);
      else setScaleError(result?.error || 'وزنی دریافت نشد');
    } catch (err: any) { setScaleError(String(err?.message || 'خطا')); }
    finally { setScaleReading(false); }
  };

  const { addToCart, updateCartQuantity } = useOrderStore();

  const handleScaleConfirm = () => {
    if (!scaleModalProduct || scaleWeight == null) return;
    const qty = scaleModalProduct.unit === 'گرم' ? Math.round(scaleWeight * 1000) : scaleWeight;
    const existing = cart.find((i: any) => i.productId === scaleModalProduct.id);
    if (existing) updateCartQuantity(scaleModalProduct.id, existing.quantity + qty);
    else { addToCart(scaleModalProduct); updateCartQuantity(scaleModalProduct.id, qty); }
    setScaleModalOpen(false); setScaleModalProduct(null); setScaleWeight(null);
  };

  const handleProductClick = (product: any) => {
    if (product.useScaleForWeight && productLoader.isScaleIntegrationEnabled && canUseScale) void openScaleModal(product);
    else addToCart(product);
  };

  const handleBarcodeAdd = async (code: string) => {
    const normalizeBarcode = (v: string) => String(v || '').replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 1632)).replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 1776)).replace(/\s+/g, '').trim();
    const normalizedCode = normalizeBarcode(code);
    const matched = productLoader.products.find((p: any) => normalizeBarcode(String(p?.barcode || '')) === normalizedCode);
    if (!matched) {
      playScanBeep(false);
      setNewProductForm({ name_fa: '', name: '', price: '', category_id: '', barcode: normalizedCode, unit: 'عدد' });
      setIsCheckingMasterProduct(true);
      setShowCreateProductModal(true);
      try {
        const master = await getMasterProductByBarcode(normalizedCode, token || undefined);
        if (master) {
          const matchedCat = productLoader.productCategories.find((c: any) => (c.name_fa || c.name || '').toLowerCase() === (master.category || '').toLowerCase());
          setNewProductForm((f) => ({ ...f, name_fa: master.name || '', category_id: matchedCat ? String(matchedCat.id) : '' }));
        }
      } finally { setIsCheckingMasterProduct(false); }
      return;
    }
    addToCart(matched);
    playScanBeep(true);
  };

  const submitCreateProduct = async () => {
    if (!token) return;
    if (!newProductForm.name_fa.trim()) { toast.error('نام فارسی محصول الزامی است'); return; }
    if (!(Number(newProductForm.price) > 0)) { toast.error('قیمت محصول باید بیشتر از صفر باشد'); return; }
    if (!(Number(newProductForm.category_id) > 0)) { toast.error('دسته‌بندی محصول را انتخاب کنید'); return; }
    setCreatingProduct(true);
    try {
      const created = await createProduct({
        name_fa: newProductForm.name_fa.trim(), name: newProductForm.name.trim() || undefined,
        price: Number(newProductForm.price), category_id: Number(newProductForm.category_id),
        barcode: newProductForm.barcode.trim() || undefined, unit: newProductForm.unit || 'عدد',
        isAvailable: true, restaurantId: user?.restaurants?.[0]?.id ? Number(user.restaurants[0].id) : undefined,
      }, token);
      const catObj = productLoader.productCategories.find((c: any) => String(c.id) === String(newProductForm.category_id));
      const createdProduct = { ...(created || { id: Date.now(), ...newProductForm, price: Number(newProductForm.price) }), category: catObj || created?.category || {}, unit: newProductForm.unit || 'عدد' };
      productLoader.setProducts((prev) => [createdProduct, ...prev]);
      addToCart(createdProduct);
      setShowCreateProductModal(false);
      playScanBeep(true);
      toast.success('محصول جدید ثبت و به سبد اضافه شد');
    } catch (err: any) {
      playScanBeep(false);
      toast.error(err?.response?.data?.message || err?.message || 'ثبت محصول ناموفق بود');
    } finally { setCreatingProduct(false); }
  };

  const handleSendToCardTerminal = async () => {
    const restaurantId = user?.restaurants?.[0]?.id ? Number(user.restaurants[0].id) : undefined;
    const { getFinalAmount, customerPhone: phone, isSubmitting: sub } = useOrderStore.getState();
    if (productLoader.isMobileRequired && !phone.trim()) { setModalState((s) => ({ ...s, cardTerminalStatus: 'failed', cardTerminalError: 'ابتدا شماره تماس مشتری را وارد کنید.' })); return; }
    if (!window.electronAPI?.sendAmountToCardTerminal) { setModalState((s) => ({ ...s, cardTerminalStatus: 'failed', cardTerminalError: 'نسخه پنل از کارتخوان پشتیبانی نمی‌کند.' })); return; }
    const amount = Number(getFinalAmount() || 0);
    if (!(amount > 0)) { setModalState((s) => ({ ...s, cardTerminalStatus: 'failed', cardTerminalError: 'مبلغ باید بیشتر از صفر باشد.' })); return; }
    setModalState((s) => ({ ...s, cardTerminalStatus: 'sending', cardTerminalError: '', cardTerminalRefId: '' }));
    try {
      const result = await window.electronAPI!.sendAmountToCardTerminal({ amount, restaurantId, terminalProfileId: modalState.selectedCardTerminalId || undefined });
      if (result?.success) {
        setModalState((s) => ({ ...s, cardTerminalStatus: 'approved', cardTerminalRefId: result.refId || '' }));
        await handleOrderSubmit();
      } else {
        setModalState((s) => ({ ...s, cardTerminalStatus: 'failed', cardTerminalError: result?.error || 'کارتخوان جواب مثبت نداد.' }));
      }
    } catch (err: any) {
      setModalState((s) => ({ ...s, cardTerminalStatus: 'failed', cardTerminalError: err?.message || 'خطا در ارتباط با کارتخوان' }));
    }
  };

  const handleOrderSubmit = async () => {
    await handleSubmit({
      editingOrderId,
      isMobileRequired: productLoader.isMobileRequired,
      cardTerminalRefId: modalState.cardTerminalRefId,
      selectedCashBoxName: modalState.selectedCashBoxName,
      selectedCardTerminalId: modalState.selectedCardTerminalId,
      cardTerminalProfiles: modalState.cardTerminalProfiles,
      printOption: modalState.printOption,
      selectedPrinterNames: modalState.selectedPrinterNames,
      loadedCustomerFirstName: modalState.loadedCustomerFirstName,
      loadedCustomerLastName: modalState.loadedCustomerLastName,
      customerFirstNameInput: modalState.customerFirstNameInput,
      customerLastNameInput: modalState.customerLastNameInput,
      userExists: modalState.userExists,
      customerAddresses: modalState.customerAddresses,
      selectedAddressId: modalState.selectedAddressId,
      onSuccess: () => {
        setModalState(INITIAL_MODAL_STATE);
        clearCart();
      },
      onError: (msg) => toast.error(msg),
      onEditSuccess: () => {
        setModalState(INITIAL_MODAL_STATE);
        clearCart();
        setTimeout(() => toast.success('فاکتور به‌روز شد'), 50);
      },
    });
  };

  return (
    <div onClick={() => setSearchTerm('')} className="flex flex-col flex-1 min-h-0 bg-default-100">
      {/* Header */}
      <header className="shrink-0 bg-content1 border-b border-default-200 px-4 py-3 flex flex-wrap items-center justify-between gap-3 shadow-sm">
        <div className="flex flex-wrap items-center gap-3 min-w-0 flex-1">
          <h1 className="text-lg sm:text-xl font-bold text-foreground whitespace-nowrap">
            {editingOrderId != null ? `ویرایش فاکتور #${editingOrderId}` : 'ثبت سفارش'}
          </h1>
          <Input
            placeholder="جستجوی محصول..."
            value={searchTerm}
            onValueChange={(value) => setSearchTerm(value)}
            variant="bordered"
            classNames={{ input: 'text-right', base: 'max-w-[220px] sm:max-w-xs' }}
          />
        </div>
        {editingOrderId != null && (
          <Button variant="flat" color="warning" onPress={() => navigate('/orders')}>انصراف از ویرایش</Button>
        )}
      </header>

      {/* Access warnings */}
      {productLoader.isScaleIntegrationEnabled && !canUseScale && (
        <div className="px-6 py-3 bg-warning-50 text-warning-700 border-b border-warning-200 text-center" role="alert">
          اتصال ترازو برای این کاربر غیرفعال است.
        </div>
      )}
      {productLoader.isCardTerminalEnabled && !canUseCardTerminal && (
        <div className="px-6 py-3 bg-warning-50 text-warning-700 border-b border-warning-200 text-center" role="alert">
          دسترسی کارتخوان برای این کاربر غیرفعال است.
        </div>
      )}

      {/* Main layout */}
      <Group className="pt-2 min-h-0">
        {/* Mixing an unconstrained percentage panel with a pixel-constrained sibling
            (cart's minSize/maxSize below are px) left this panel with no defaultSize
            hint — react-resizable-panels couldn't reconcile the two on first layout
            and collapsed it to ~0 width instead of the intended leftover space. An
            explicit defaultSize + minSize makes the initial layout deterministic. */}
        <Panel defaultSize="70%" minSize="40%">
          <Card className="overflow-hidden flex flex-col min-h-0 h-[calc(100vh_-120px)]">
            <CardContent className="flex-1 min-h-0 overflow-hidden flex flex-row gap-0 p-0">
              <OrderProductGrid
                products={productLoader.products}
                categories={productLoader.categories}
                searchTerm={searchTerm}
                onProductClick={handleProductClick}
                onBarcodeAdd={handleBarcodeAdd}
                formatPrice={formatPrice}
                staffCartUnitPrice={staffCartUnitPrice}
                orderEditLoading={orderEditLoading}
                isLoading={productLoader.isLoading}
              />
            </CardContent>
          </Card>
        </Panel>
        <Separator className="px-2" />
        <Panel defaultSize={420} maxSize={500} minSize={350}>
          <OrderCart
            cartItemOptions={productLoader.cartItemOptions}
            formatPrice={formatPrice}
            onCheckout={() => setModalState((s) => ({ ...s, isOpen: true }))}
            isDisabled={orderEditLoading || Boolean(orderEditError && editingOrderId != null)}
            editingOrderId={editingOrderId}
          />
        </Panel>
      </Group>

      {/* Order modal */}
      <OrderModal
        state={modalState}
        setState={setModalState}
        editingOrderId={editingOrderId}
        isMobileRequired={productLoader.isMobileRequired}
        isCardTerminalEnabled={productLoader.isCardTerminalEnabled}
        allowDirectSendAmountToCardTerminal={productLoader.allowDirectSendAmountToCardTerminal}
        canUseCardTerminal={canUseCardTerminal}
        formatPrice={formatPrice}
        onSubmit={handleOrderSubmit}
        onSendToCardTerminal={handleSendToCardTerminal}
        onCardManualConfirm={async () => { setModalState((s) => ({ ...s, cardTerminalStatus: 'idle', cardTerminalError: '' })); await handleOrderSubmit(); }}
        onClose={() => setModalState((s) => ({ ...s, isOpen: false }))}
      />

      {/* New product from barcode modal */}
      <Modal isOpen={showCreateProductModal} onOpenChange={setShowCreateProductModal}>
        <ModalShell size="lg">
          <ModalHeader>افزودن محصول جدید با بارکد</ModalHeader>
          <ModalBody className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {isCheckingMasterProduct && <p className="text-default-500 text-sm text-center col-span-2 py-1">در حال جستجو در محصولات پایه...</p>}
            <Input label="بارکد" value={newProductForm.barcode} readOnly onValueChange={(v) => setNewProductForm((f) => ({ ...f, barcode: v }))} />
            <NameAutocomplete
              value={newProductForm.name_fa} autoFocus={!isCheckingMasterProduct} isDisabled={isCheckingMasterProduct}
              onValueChange={(v) => {
                setNewProductForm((f) => ({ ...f, name_fa: v }));
                if (nameSuggestTimerRef.current) clearTimeout(nameSuggestTimerRef.current);
                if (!v.trim()) { setNameSuggestions([]); return; }
                nameSuggestTimerRef.current = setTimeout(async () => {
                  const results = await searchMasterProducts(v, token || undefined);
                  setNameSuggestions(results);
                }, 300);
              }}
              suggestions={nameSuggestions}
              onSelect={(s) => { setNewProductForm((f) => ({ ...f, name_fa: s.name, name: f.name || s.name, barcode: f.barcode || s.barcode || '' })); setNameSuggestions([]); }}
            />
            <Input label="نام انگلیسی (اختیاری)" value={newProductForm.name} isDisabled={isCheckingMasterProduct} onValueChange={(v) => setNewProductForm((f) => ({ ...f, name: v }))} />
            <Input label="قیمت (ریال)" type="text" inputMode="numeric"
              value={formatPriceInput(newProductForm.price)} isDisabled={isCheckingMasterProduct}
              onValueChange={(v) => setNewProductForm((f) => ({ ...f, price: normalizePriceInput(v) }))} />
            <Select label="دسته‌بندی"
              selectedKeys={newProductForm.category_id ? [newProductForm.category_id] : []}
              isDisabled={isCheckingMasterProduct}
              onSelectionChange={(keys) => setNewProductForm((f) => ({ ...f, category_id: String(Array.from(keys)[0] || '') }))}>
              {productLoader.productCategories.map((c: any) => <SelectItem key={String(c.id)}>{c.name_fa || c.name}</SelectItem>)}
            </Select>
            <Select label="واحد شمارش" selectedKeys={[newProductForm.unit || 'عدد']} isDisabled={isCheckingMasterProduct}
              onSelectionChange={(keys) => setNewProductForm((f) => ({ ...f, unit: String(Array.from(keys)[0] || 'عدد') }))}>
              {PRODUCT_UNITS.map((u) => <SelectItem key={u}>{u}</SelectItem>)}
            </Select>
          </ModalBody>
          <ModalFooter>
            <Button variant="light" onPress={() => setShowCreateProductModal(false)}>انصراف</Button>
            <Button color="primary" isLoading={creatingProduct} isDisabled={isCheckingMasterProduct} onPress={submitCreateProduct}>ثبت و افزودن به سبد</Button>
          </ModalFooter>
        </ModalShell>
      </Modal>

      {/* Scale modal */}
      <Modal isOpen={scaleModalOpen} onOpenChange={(open) => { if (!open) { setScaleModalOpen(false); setScaleModalProduct(null); setScaleWeight(null); } }}>
        <ModalShell size="sm">
          <ModalHeader>خواندن وزن از ترازو</ModalHeader>
          <ModalBody className="text-center space-y-4 py-4">
            {scaleModalProduct && <p className="font-semibold text-foreground">{scaleModalProduct.name_fa || scaleModalProduct.name}</p>}
            {scaleReading ? (
              <div className="flex flex-col items-center gap-2 text-default-500">
                <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                <span className="text-sm">در حال خواندن وزن...</span>
              </div>
            ) : scaleError ? (
              <div className="text-danger-600 text-sm space-y-2">
                <p>{scaleError}</p>
                <Button size="sm" variant="flat" onPress={async () => {
                  setScaleError(''); setScaleReading(true);
                  try {
                    await window.electronAPI?.scaleClearWeight?.();
                    await window.electronAPI?.scaleRequestWeight?.();
                    const r = await window.electronAPI?.scaleReadWeight?.();
                    if (r?.success && r.weight != null) setScaleWeight(r.weight);
                    else setScaleError(r?.error || 'وزنی دریافت نشد');
                  } catch (e: any) { setScaleError(String(e?.message || 'خطا')); }
                  finally { setScaleReading(false); }
                }}>تلاش مجدد</Button>
              </div>
            ) : scaleWeight != null ? (
              <div className="space-y-1">
                <p className="text-4xl font-bold text-primary tabular-nums">
                  {scaleModalProduct?.unit === 'گرم'
                    ? `${Math.round(scaleWeight * 1000).toLocaleString('fa-IR')} گرم`
                    : `${scaleWeight.toFixed(3)} کیلوگرم`}
                </p>
                <p className="text-sm text-default-500">
                  مبلغ: {formatPrice(staffCartUnitPrice(scaleModalProduct) * (scaleModalProduct?.unit === 'گرم' ? Math.round(scaleWeight * 1000) : scaleWeight))}
                </p>
              </div>
            ) : null}
          </ModalBody>
          <ModalFooter>
            <Button variant="light" onPress={() => { setScaleModalOpen(false); setScaleModalProduct(null); setScaleWeight(null); }}>انصراف</Button>
            <Button color="primary" isDisabled={scaleWeight == null || scaleReading} onPress={handleScaleConfirm}>تأیید و افزودن به فاکتور</Button>
          </ModalFooter>
        </ModalShell>
      </Modal>
    </div>
  );
}
