import { useState, useEffect, useRef } from 'react';
import { useNavigate, useSearchParams, useLocation } from 'react-router-dom';
import { Card, CardContent } from '@heroui/react';
import { Button } from '../../ui/compat-button';
import { Input } from '../../ui/compat-input';
import { Panel, Group, Separator } from 'react-resizable-panels';
import { useAuthStore } from '../../store/authStore';
import { useOrderStore } from '../../store/orderStore';
import {
  createProduct,
  fetchOrderById,
  getMasterProductByBarcode,
  type MasterProduct,
} from '../../services/api';
import { MODULES } from '../../types';
import { hasModuleAccess, isOwnerOrAdmin } from '../../lib/electronPermissions';
import { toast } from '../../utils/toast';
import { useProductLoader } from './hooks/useProductLoader';
import { useOrderSubmit } from './hooks/useOrderSubmit';
import { OrderProductGrid } from './components/OrderProductGrid';
import { OrderCart } from './components/OrderCart';
import { OrderModal, type OrderModalState } from './components/OrderModal';
import { OrderQuickActionsRail } from './components/OrderQuickActionsRail';
import { CreateProductModal } from './orderPage/CreateProductModal';
import { ScaleWeightModal } from './orderPage/ScaleWeightModal';
import { useOrderPageEffects } from './orderPage/useOrderPageEffects';

const INITIAL_MODAL_STATE: OrderModalState = {
  isOpen: false,
  isOnline: true,
  userExists: null,
  isCheckingUser: false,
  loadedCustomerFirstName: '',
  loadedCustomerLastName: '',
  customerFirstNameInput: '',
  customerLastNameInput: '',
  referralCode: '',
  referralAvailable: false,
  showCustomerNameFields: false,
  customerAddresses: [],
  selectedAddressId: null,
  loadingAddresses: false,
  printOption: 'all',
  selectedPrinterNames: [],
  cardTerminalStatus: 'idle',
  cardTerminalError: '',
  cardTerminalRefId: '',
  cardTerminalProfiles: [],
  selectedCardTerminalId: '',
  cashBoxAccounts: [],
  selectedCashBoxId: null,
  selectedCashBoxName: 'صندوق',
  discountCodeError: '',
  availableDiscountCodes: [],
  loadingAvailableDiscountCodes: false,
  wheelVouchers: [],
  applyingVoucher: null,
  cashbackBalance: 0,
  loadingCashback: false,
  pointsBalance: 0,
  loadingPointsRewards: false,
  availableRewards: [],
  redeemingTierId: null,
  selectedProductByTier: {},
};

function hasPermission(user: any, module: string) {
  return (
    isOwnerOrAdmin(user) || hasModuleAccess(user, module, ['manage'], user?.restaurants?.[0]?.id)
  );
}

export default function OrderPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const { user, token } = useAuthStore();
  const { cart, clearCart, setCustomerPhone, setCustomerAddress, setServiceType } = useOrderStore();

  const editParam = searchParams.get('edit');
  const parsedEditId = editParam != null ? Number(editParam) : NaN;
  const editingOrderId = !Number.isNaN(parsedEditId) && parsedEditId > 0 ? parsedEditId : null;

  // Hooks
  const productLoader = useProductLoader();
  const { handleSubmit, playScanBeep, formatPrice } = useOrderSubmit();
  const searchInputRef = useRef<HTMLInputElement>(null);
  /** برای نادیده‌گرفتن جواب دیرهنگام کارتخوان بعد از این‌که اپراتور با دکمهٔ لغو از انتظار خارج شده */
  const cardTerminalRequestIdRef = useRef(0);

  // UI state
  const [searchTerm, setSearchTerm] = useState('');
  const [modalState, setModalState] = useState<OrderModalState>(INITIAL_MODAL_STATE);
  const [orderEditLoading, setOrderEditLoading] = useState(false);
  const [orderEditError, setOrderEditError] = useState('');
  const prevEditingIdRef = useRef<number | null>(null);

  // Barcode / new product modal state
  const [showCreateProductModal, setShowCreateProductModal] = useState(false);
  const [creatingProduct, setCreatingProduct] = useState(false);
  const [newProductForm, setNewProductForm] = useState({
    name_fa: '',
    name: '',
    price: '',
    category_id: '',
    barcode: '',
    unit: 'عدد',
  });
  const [isCheckingMasterProduct, setIsCheckingMasterProduct] = useState(false);
  const [nameSuggestions, setNameSuggestions] = useState<MasterProduct[]>([]);
  const nameSuggestTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Scale
  const [scaleModalOpen, setScaleModalOpen] = useState(false);
  const [scaleModalProduct, setScaleModalProduct] = useState<any>(null);
  const [scaleWeight, setScaleWeight] = useState<number | null>(null);
  const [scaleReading, setScaleReading] = useState(false);
  const [scaleError, setScaleError] = useState('');

  const canUseScale =
    !productLoader.isScaleIntegrationEnabled ||
    !productLoader.restrictScaleAccess ||
    hasPermission(user, MODULES.ELECTRON_PANEL);

  const canUseCardTerminal =
    !productLoader.isCardTerminalEnabled ||
    !productLoader.restrictCardTerminalAccess ||
    hasPermission(user, 'payment_terminal');

  // Load on mount
  useEffect(() => {
    void productLoader.loadProducts();
  }, []);

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
      setModalState((s) => ({
        ...s,
        loadedCustomerFirstName: '',
        loadedCustomerLastName: '',
        userExists: null,
      }));
      setOrderEditError('');
    }
    prevEditingIdRef.current = editingOrderId;
  }, [editingOrderId, clearCart]);

  useEffect(() => {
    if (editingOrderId == null) {
      setOrderEditLoading(false);
      return;
    }
    if (!token) {
      setOrderEditError('برای ویرایش فاکتور باید وارد شوید.');
      return;
    }
    let cancelled = false;
    setOrderEditLoading(true);
    setOrderEditError('');
    fetchOrderById(editingOrderId, token)
      .then((order: any) => {
        if (cancelled) return;
        const cartItems = (order.items || [])
          .filter((r: any) => r.product?.id)
          .map((r: any) => ({
            productId: r.product.id,
            product: r.product,
            quantity: Number(r.quantity),
            price: Number(r.price),
            totalPrice: Number(r.price) * Number(r.quantity),
            itemOption: r.itemNote?.trim() ?? '',
          }));
        const codeVal = (order.discountCodeValue || '').trim();
        const disc = Number(order.discountAmount) || 0;
        const {
          restoreDraft,
          setDiscountType,
          setDiscountAmount,
          setDiscountCode,
          setAppliedDiscountCode,
        } = useOrderStore.getState();
        restoreDraft({
          cart: cartItems,
          customerPhone: order.customerPhone || '',
          serviceType: order.serviceType === 'takeaway' ? 'takeaway' : 'dine_in',
          tableNumber: order.tableNumber || '',
          tableId: order.tableId ?? order.table?.id ?? null,
          customerAddress: order.customerAddress || '',
          paymentMethod: order.paymentMethod || 'cash',
          notes: order.notes || '',
        });
        if (codeVal) {
          setDiscountType('code');
          setDiscountCode(codeVal);
          setAppliedDiscountCode({ code: codeVal, discountAmount: disc });
        } else {
          setDiscountType('fixed');
          setDiscountAmount(disc);
          setAppliedDiscountCode(null);
          setDiscountCode('');
        }
        const nameRaw = (order.customerName || '').trim();
        const parts = nameRaw.split(/\s+/).filter(Boolean);
        setModalState((s) => ({
          ...s,
          loadedCustomerFirstName: parts[0] || '',
          loadedCustomerLastName: parts.slice(1).join(' ') || '',
          userExists: null,
        }));
        setOrderEditLoading(false);
      })
      .catch((e: any) => {
        if (cancelled) return;
        setOrderEditLoading(false);
        setOrderEditError(e?.response?.data?.message || e?.message || 'خطا در بارگذاری سفارش');
      });
    return () => {
      cancelled = true;
    };
  }, [editingOrderId, token]);

  const resetSession = (options?: { skipConfirm?: boolean }) => {
    if ((cart.length > 0 || editingOrderId != null) && !options?.skipConfirm) {
      if (!window.confirm('سبد خرید ریست شود؟')) return;
    }
    clearCart();
    setModalState(INITIAL_MODAL_STATE);
    setSearchTerm('');
    if (editingOrderId != null) navigate('/order');
  };

  useOrderPageEffects({
    setModalState,
    user,
    scaleModalOpen,
    setScaleWeight,
    setScaleReading,
    setScaleError,
    setSearchTerm,
    modalState,
    cart,
    token,
    editingOrderId,
    navigate,
    resetSession,
    orderEditError,
    setOrderEditError,
  });

  const staffCartUnitPrice = (product: any) => Number(product?.price || 0);

  // نوار اکشن سریع — هر دکمه به یک مسیر/حالت واقعی همین صفحه وصل است
  const handleQuickSale = () => resetSession();
  const handleTableOrder = () => {
    setServiceType('dine_in');
    setModalState((s) => ({ ...s, isOpen: true }));
  };
  const handleCustomerOrder = () => {
    setServiceType('takeaway');
    setModalState((s) => ({ ...s, isOpen: true }));
  };
  const handlePreInvoice = () => {
    if (cart.length === 0) {
      toast.error('سبد خرید خالی است');
      return;
    }
    setModalState((s) => ({ ...s, isOpen: true }));
  };
  const handleQuickSearch = () => searchInputRef.current?.focus();
  // نوار اکشن سریع فعلاً در JSX کامنت شده؛ مرجع‌ها را نگه می‌داریم تا کد از بین نرود و noUnusedLocals خطا ندهد.
  void [
    OrderQuickActionsRail,
    handleQuickSale,
    handleTableOrder,
    handleCustomerOrder,
    handlePreInvoice,
    handleQuickSearch,
  ];
  void [
    OrderQuickActionsRail,
    handleQuickSale,
    handleTableOrder,
    handleCustomerOrder,
    handlePreInvoice,
    handleQuickSearch,
  ];

  const openScaleModal = async (product: any) => {
    setScaleModalProduct(product);
    setScaleWeight(null);
    setScaleError('');
    setScaleModalOpen(true);
    setScaleReading(true);
    try {
      await window.electronAPI?.scaleClearWeight?.();
      await window.electronAPI?.scaleRequestWeight?.();
      const result = await window.electronAPI?.scaleReadWeight?.();
      if (result?.success && result.weight != null) setScaleWeight(result.weight);
      else setScaleError(result?.error || 'وزنی دریافت نشد');
    } catch (err: any) {
      setScaleError(String(err?.message || 'خطا'));
    } finally {
      setScaleReading(false);
    }
  };

  const { addToCart, updateCartQuantity } = useOrderStore();

  const handleScaleConfirm = () => {
    if (!scaleModalProduct || scaleWeight == null) return;
    const qty = scaleModalProduct.unit === 'گرم' ? Math.round(scaleWeight * 1000) : scaleWeight;
    const existing = cart.find((i: any) => i.productId === scaleModalProduct.id);
    if (existing) updateCartQuantity(scaleModalProduct.id, existing.quantity + qty);
    else {
      addToCart(scaleModalProduct);
      updateCartQuantity(scaleModalProduct.id, qty);
    }
    setScaleModalOpen(false);
    setScaleModalProduct(null);
    setScaleWeight(null);
  };

  const handleProductClick = (product: any) => {
    if (product.useScaleForWeight && productLoader.isScaleIntegrationEnabled && canUseScale)
      void openScaleModal(product);
    else addToCart(product);
  };

  const handleBarcodeAdd = async (code: string) => {
    const normalizeBarcode = (v: string) =>
      String(v || '')
        .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 1632))
        .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 1776))
        .replace(/\s+/g, '')
        .trim();
    const normalizedCode = normalizeBarcode(code);
    const matched = productLoader.products.find(
      (p: any) => normalizeBarcode(String(p?.barcode || '')) === normalizedCode,
    );
    if (!matched) {
      playScanBeep(false);
      setNewProductForm({
        name_fa: '',
        name: '',
        price: '',
        category_id: '',
        barcode: normalizedCode,
        unit: 'عدد',
      });
      setIsCheckingMasterProduct(true);
      setShowCreateProductModal(true);
      try {
        const master = await getMasterProductByBarcode(normalizedCode, token || undefined);
        if (master) {
          const matchedCat = productLoader.productCategories.find(
            (c: any) =>
              (c.name_fa || c.name || '').toLowerCase() === (master.category || '').toLowerCase(),
          );
          setNewProductForm((f) => ({
            ...f,
            name_fa: master.name || '',
            category_id: matchedCat ? String(matchedCat.id) : '',
          }));
        }
      } finally {
        setIsCheckingMasterProduct(false);
      }
      return;
    }
    addToCart(matched);
    playScanBeep(true);
  };

  const submitCreateProduct = async () => {
    if (!token) return;
    if (!newProductForm.name_fa.trim()) {
      toast.error('نام فارسی محصول الزامی است');
      return;
    }
    if (!(Number(newProductForm.price) > 0)) {
      toast.error('قیمت محصول باید بیشتر از صفر باشد');
      return;
    }
    if (!(Number(newProductForm.category_id) > 0)) {
      toast.error('دسته‌بندی محصول را انتخاب کنید');
      return;
    }
    setCreatingProduct(true);
    try {
      const created = await createProduct(
        {
          name_fa: newProductForm.name_fa.trim(),
          name: newProductForm.name.trim() || undefined,
          price: Number(newProductForm.price),
          category_id: Number(newProductForm.category_id),
          barcode: newProductForm.barcode.trim() || undefined,
          unit: newProductForm.unit || 'عدد',
          isAvailable: true,
          restaurantId: user?.restaurants?.[0]?.id ? Number(user.restaurants[0].id) : undefined,
        },
        token,
      );
      const catObj = productLoader.productCategories.find(
        (c: any) => String(c.id) === String(newProductForm.category_id),
      );
      const createdProduct = {
        ...(created || { id: Date.now(), ...newProductForm, price: Number(newProductForm.price) }),
        category: catObj || created?.category || {},
        unit: newProductForm.unit || 'عدد',
      };
      productLoader.setProducts((prev) => [createdProduct, ...prev]);
      addToCart(createdProduct);
      setShowCreateProductModal(false);
      playScanBeep(true);
      toast.success('محصول جدید ثبت و به سبد اضافه شد');
    } catch (err: any) {
      playScanBeep(false);
      toast.error(err?.response?.data?.message || err?.message || 'ثبت محصول ناموفق بود');
    } finally {
      setCreatingProduct(false);
    }
  };

  const handleSendToCardTerminal = async () => {
    const restaurantId = user?.restaurants?.[0]?.id ? Number(user.restaurants[0].id) : undefined;
    const { getFinalAmount, customerPhone: phone } = useOrderStore.getState();
    if (productLoader.isMobileRequired && !phone.trim()) {
      setModalState((s) => ({
        ...s,
        cardTerminalStatus: 'failed',
        cardTerminalError: 'ابتدا شماره تماس مشتری را وارد کنید.',
      }));
      return;
    }
    if (!window.electronAPI?.sendAmountToCardTerminal) {
      setModalState((s) => ({
        ...s,
        cardTerminalStatus: 'failed',
        cardTerminalError: 'نسخه پنل از کارتخوان پشتیبانی نمی‌کند.',
      }));
      return;
    }
    const amount = Number(getFinalAmount() || 0);
    if (!(amount > 0)) {
      setModalState((s) => ({
        ...s,
        cardTerminalStatus: 'failed',
        cardTerminalError: 'مبلغ باید بیشتر از صفر باشد.',
      }));
      return;
    }
    const requestId = ++cardTerminalRequestIdRef.current;
    setModalState((s) => ({
      ...s,
      cardTerminalStatus: 'sending',
      cardTerminalError: '',
      cardTerminalRefId: '',
    }));
    try {
      const result = await window.electronAPI!.sendAmountToCardTerminal({
        amount,
        restaurantId,
        terminalProfileId: modalState.selectedCardTerminalId || undefined,
      });
      // اگر اپراتور در این فاصله دکمهٔ لغو را زده، جواب دیرهنگام کارتخوان دیگر معتبر نیست
      if (cardTerminalRequestIdRef.current !== requestId) return;
      if (result?.success) {
        setModalState((s) => ({
          ...s,
          cardTerminalStatus: 'approved',
          cardTerminalRefId: result.refId || '',
        }));
        await handleOrderSubmit();
      } else {
        setModalState((s) => ({
          ...s,
          cardTerminalStatus: 'failed',
          cardTerminalError: result?.error || 'کارتخوان جواب مثبت نداد.',
        }));
      }
    } catch (err: any) {
      if (cardTerminalRequestIdRef.current !== requestId) return;
      setModalState((s) => ({
        ...s,
        cardTerminalStatus: 'failed',
        cardTerminalError: err?.message || 'خطا در ارتباط با کارتخوان',
      }));
    }
  };

  /** اپراتور می‌تواند به‌جای صبر تا تایم‌اوت کارتخوان، همین حالا انتظار را قطع و کار را ادامه دهد
      (تلاش مجدد یا ثبت دستی) — جواب دیرهنگام کارتخوان توسط requestId نادیده گرفته می‌شود */
  const handleCancelCardTerminal = () => {
    cardTerminalRequestIdRef.current += 1;
    setModalState((s) => ({
      ...s,
      cardTerminalStatus: 'failed',
      cardTerminalError: 'ارتباط با کارتخوان توسط اپراتور لغو شد.',
    }));
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
      referralCode: modalState.referralCode,
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
    <div onClick={() => setSearchTerm('')} className="flex flex-col flex-1 min-h-0 bg-background">
      {/* Header */}
      <header className="shrink-0 bg-surface border-b border-border px-4 py-3 flex flex-wrap items-center justify-between gap-3 shadow-sm">
        <div className="flex flex-wrap items-center gap-3 min-w-0 flex-1">
          <h1 className="text-lg sm:text-xl font-bold text-foreground whitespace-nowrap">
            {editingOrderId != null ? `ویرایش فاکتور #${editingOrderId}` : 'ثبت سفارش'}
          </h1>
          <Input
            ref={searchInputRef}
            placeholder="جستجوی محصول... Ctrl+K"
            value={searchTerm}
            onValueChange={(value) => setSearchTerm(value)}
            variant="bordered"
            classNames={{ input: 'text-right', base: 'max-w-[220px] sm:max-w-xs' }}
          />
        </div>
        {editingOrderId != null && (
          <Button variant="flat" color="warning" onPress={() => navigate('/orders')}>
            انصراف از ویرایش
          </Button>
        )}
      </header>

      {/* Access warnings */}
      {productLoader.isScaleIntegrationEnabled && !canUseScale && (
        <div
          className="px-6 py-3 bg-warning-soft text-warning-soft-foreground border-b border-warning/30 text-center"
          role="alert"
        >
          اتصال ترازو برای این کاربر غیرفعال است.
        </div>
      )}
      {productLoader.isCardTerminalEnabled && !canUseCardTerminal && (
        <div
          className="px-6 py-3 bg-warning-soft text-warning-soft-foreground border-b border-warning/30 text-center"
          role="alert"
        >
          دسترسی کارتخوان برای این کاربر غیرفعال است.
        </div>
      )}

      {/* Main layout — راست‌به‌چپ: سبد سفارش (تمرکز اول صندوق‌دار) ← دسته/محصولات ← نوار اکشن سریع */}
      <div className="flex flex-row flex-1 min-h-0 pt-2">
        {/*<OrderQuickActionsRail*/}
        {/*  online={isOnline}*/}
        {/*  cartHasItems={cart.length > 0}*/}
        {/*  onQuickSale={handleQuickSale}*/}
        {/*  onTableOrder={handleTableOrder}*/}
        {/*  onPreInvoice={handlePreInvoice}*/}
        {/*  onCustomerOrder={handleCustomerOrder}*/}
        {/*  onQuickSearch={handleQuickSearch}*/}
        {/*/>*/}
        <Group className="flex-1 min-h-0">
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
      </div>

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
        cartItemOptions={productLoader.cartItemOptions}
        onSubmit={handleOrderSubmit}
        onSendToCardTerminal={handleSendToCardTerminal}
        onCardManualConfirm={async () => {
          setModalState((s) => ({ ...s, cardTerminalStatus: 'idle', cardTerminalError: '' }));
          await handleOrderSubmit();
        }}
        onCancelCardTerminal={handleCancelCardTerminal}
        onClose={() => setModalState((s) => ({ ...s, isOpen: false }))}
      />

      {/* New product from barcode modal */}
      <CreateProductModal
        showCreateProductModal={showCreateProductModal}
        setShowCreateProductModal={setShowCreateProductModal}
        isCheckingMasterProduct={isCheckingMasterProduct}
        newProductForm={newProductForm}
        setNewProductForm={setNewProductForm}
        nameSuggestTimerRef={nameSuggestTimerRef}
        setNameSuggestions={setNameSuggestions}
        token={token}
        nameSuggestions={nameSuggestions}
        productLoader={productLoader}
        creatingProduct={creatingProduct}
        submitCreateProduct={submitCreateProduct}
      />

      {/* Scale modal */}
      <ScaleWeightModal
        scaleModalOpen={scaleModalOpen}
        setScaleModalOpen={setScaleModalOpen}
        setScaleModalProduct={setScaleModalProduct}
        setScaleWeight={setScaleWeight}
        scaleModalProduct={scaleModalProduct}
        scaleReading={scaleReading}
        scaleError={scaleError}
        setScaleError={setScaleError}
        setScaleReading={setScaleReading}
        scaleWeight={scaleWeight}
        formatPrice={formatPrice}
        staffCartUnitPrice={staffCartUnitPrice}
        handleScaleConfirm={handleScaleConfirm}
      />
    </div>
  );
}
