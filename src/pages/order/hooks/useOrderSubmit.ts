import { useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../../../store/authStore';
import { useOrderStore } from '../../../store/orderStore';
import { usePrinterSettingsStore } from '../../../store/printerSettingsStore';
import {
  addCustomer,
  updateCustomerProfile,
  createCustomerAddress,
} from '../../../services/api';
import { isValidIranMobile, normalizeIranMobile } from '../../../utils/iranMobile';
import { saveReceiptNumbersToStorage, getNextReceiptNumberBrowser } from '../../../utils/receiptNumbersStorage';
import { buildPrinterJobs, loadPrintTemplateSources } from '../../../utils/printTemplates';
import { toast } from '../../../utils/toast';

interface SubmitOptions {
  editingOrderId: number | null;
  isMobileRequired: boolean;
  cardTerminalRefId: string;
  selectedCashBoxName: string;
  selectedCardTerminalId: string;
  cardTerminalProfiles: Array<{ id: string; name: string }>;
  printOption: 'all' | 'none' | 'select';
  selectedPrinterNames: string[];
  loadedCustomerFirstName: string;
  loadedCustomerLastName: string;
  customerFirstNameInput: string;
  customerLastNameInput: string;
  userExists: boolean | null;
  customerAddresses: Array<{ id: number; address: string; label?: string; isDefault: boolean }>;
  selectedAddressId: number | 'new' | null;
  onSuccess: () => void;
  onError: (msg: string) => void;
  onEditSuccess: () => void;
}

export function useOrderSubmit() {
  const navigate = useNavigate();
  const { user, token } = useAuthStore();
  const {
    cart, customerPhone, serviceType, tableNumber, tableId, customerAddress,
    paymentMethod, notes, splitCash, splitCard, splitOnline, cashbackRedeemAmount,
    getTotalAmount, getFinalAmount, getDiscountAmount, getVatAmount,
    appliedDiscountCode, discountType,
    submitOrder, restoreDraft,
  } = useOrderStore();
  const { enabledPrinters, getPrinterReceipts } = usePrinterSettingsStore((s) => ({
    enabledPrinters: Object.values(s.configs).filter((c) => c.enabled),
    getPrinterReceipts: s.getPrinterReceipts,
  }));
  const audioCtxRef = useRef<AudioContext | null>(null);

  const formatPrice = (price: number) => new Intl.NumberFormat('fa-IR').format(price) + ' ریال';

  const runPrint = (orderData: any, orderKeys: string[], options: { printOption: 'all' | 'none' | 'select'; selectedPrinterNames: string[] }) => {
    const { printOption: opt, selectedPrinterNames: names } = options;
    (async () => {
      try {
        if (window.electronAPI) {
          let receiptNumber = 0;
          const shouldPrint = opt !== 'none';
          const printersToUse = opt === 'select' && names.length > 0
            ? enabledPrinters.filter((p) => names.includes(p.name))
            : opt === 'all' ? enabledPrinters : [];
          if (shouldPrint && printersToUse.length > 0) {
            const { templatesMap, defaultTemplate } = await loadPrintTemplateSources();
            const printerJobs = buildPrinterJobs(
              printersToUse,
              getPrinterReceipts,
              templatesMap,
              defaultTemplate,
            );
            if (printerJobs.length > 0) {
              const res = await window.electronAPI!.printReceipt(orderData, printerJobs, orderKeys);
              if (res?.status === 'PRINT_OK') receiptNumber = res.receiptNumber ?? 0;
              else throw new Error(res?.code || 'PRINT_UNKNOWN_ERROR');
            } else {
              receiptNumber = await window.electronAPI!.assignReceiptNumberForOrder(orderKeys);
            }
          } else {
            receiptNumber = await window.electronAPI!.assignReceiptNumberForOrder(orderKeys);
          }
          if (receiptNumber > 0 && orderKeys.length) saveReceiptNumbersToStorage(orderKeys, receiptNumber);
        } else {
          saveReceiptNumbersToStorage(orderKeys, getNextReceiptNumberBrowser());
        }
      } catch (err) {
        toast.error(`خطا در چاپ رسید (${err instanceof Error ? err.message : 'PRINT_UNKNOWN_ERROR'})`);
      }
    })();
  };

  const handleSubmit = async (opts: SubmitOptions) => {
    const {
      editingOrderId, isMobileRequired, cardTerminalRefId,
      selectedCashBoxName, selectedCardTerminalId, cardTerminalProfiles,
      printOption, selectedPrinterNames,
      loadedCustomerFirstName, loadedCustomerLastName,
      customerFirstNameInput, customerLastNameInput,
      userExists, customerAddresses, selectedAddressId,
      onSuccess, onError, onEditSuccess,
    } = opts;

    const normalizedPhone = normalizeIranMobile(customerPhone.trim());
    if (isMobileRequired && !customerPhone.trim()) {
      onError('شماره تماس را وارد کنید');
      return;
    }
    if (customerPhone.trim() && !isValidIranMobile(normalizedPhone)) {
      onError('فرمت شماره موبایل معتبر نیست. مثال: 09123456789');
      return;
    }

    const restaurantId = user?.restaurants?.[0]?.id;
    const restaurantName = user?.restaurants?.[0]?.name;
    const trimmedFirstName = customerFirstNameInput.trim();
    const trimmedLastName = customerLastNameInput.trim();

    // Sync customer profile
    try {
      if (token && (restaurantId || restaurantName) && normalizedPhone) {
        if (userExists === true) {
          await updateCustomerProfile(
            { restaurantId, restaurantName, phone: normalizedPhone },
            { firstName: trimmedFirstName, lastName: trimmedLastName },
            token,
          );
        } else if (userExists === false && (trimmedFirstName || trimmedLastName)) {
          await addCustomer(
            { restaurantId, restaurantName },
            { mobile: normalizedPhone, firstName: trimmedFirstName || undefined, lastName: trimmedLastName || undefined },
            token,
          );
        }
      }
    } catch (err: any) {
      onError(err?.response?.data?.message || err?.message || 'ذخیره اطلاعات مشتری ناموفق بود');
      return;
    }

    const snapshot = {
      customerPhone: normalizedPhone || customerPhone,
      serviceType, tableNumber, tableId, customerAddress, paymentMethod, notes,
      discountAmount: getDiscountAmount(),
      vatAmount: getVatAmount(),
      totalAmount: getTotalAmount(),
      finalAmount: getFinalAmount(),
      cashbackRedeemedAmount: cashbackRedeemAmount,
      items: cart.map((item) => ({
        product: item.product,
        productName: item.product.name_fa || item.product.name,
        quantity: item.quantity,
        price: item.price,
        itemNote: item.itemOption?.trim() || undefined,
        itemOption: item.itemOption || undefined,
      })),
    };

    const isEditingInvoice = editingOrderId != null;
    const restaurantNameForPrint = user?.restaurants?.[0]?.name_fa || restaurantName || '';

    const onOrderCreated = async (res: { orderId: number; orderNumber?: string; receiptCallNumber?: number; offline?: boolean; order?: any }) => {
      if (isEditingInvoice) return;
      const fullName = [trimmedFirstName || loadedCustomerFirstName, trimmedLastName || loadedCustomerLastName].filter(Boolean).join(' ').trim();
      const orderData = {
        id: res.orderId, orderNumber: res.orderNumber ?? `ORD-${res.orderId}`,
        receiptCallNumber: res.receiptCallNumber,
        restaurantName: restaurantNameForPrint,
        customerPhone: snapshot.customerPhone, customerName: fullName || snapshot.customerPhone,
        serviceType: snapshot.serviceType, tableNumber: snapshot.tableNumber,
        customerAddress: snapshot.customerAddress, paymentMethod: snapshot.paymentMethod,
        notes: snapshot.notes, items: snapshot.items,
        // totalAmount/discountAmount/finalAmount باید همگی از یک منبع بیایند، وگرنه
        // در رسید چاپی «جمع کل» و «مبلغ نهایی» حتی بدون تخفیف می‌توانند متفاوت باشند —
        // مثلاً وقتی سرور قیمت واحد را برای کاربر staff بازمحاسبه می‌کند
        // (resolveStaffOrderLineUnitPrice) و orderSubtotal سرور با totalAmount محاسبه‌شدهٔ
        // سبدِ سمتِ کلاینت یکی نیست. پس همیشه مقدار نهایی سرور را اولویت می‌دهیم.
        totalAmount: Number(res.order?.totalAmount ?? snapshot.totalAmount),
        discountAmount: Number(res.order?.discountAmount ?? snapshot.discountAmount ?? 0),
        vatAmount: Number(res.order?.vatAmount ?? snapshot.vatAmount ?? 0),
        finalAmount: Number(res.order?.finalAmount ?? snapshot.finalAmount ?? snapshot.totalAmount),
        cashbackEarnedAmount: Number(res.order?.cashbackEarnedAmount ?? 0),
        cashbackRedeemedAmount: Number(res.order?.cashbackRedeemedAmount ?? snapshot.cashbackRedeemedAmount ?? 0),
      };
      const orderKeys = res.offline
        ? [`offline-${res.orderId}`]
        : [String(res.orderId), res.orderNumber, orderData.orderNumber].filter(Boolean);
      runPrint(orderData, orderKeys, { printOption, selectedPrinterNames });

      // Record cash transactions
      try {
        const { recordOrderPaymentTransactions } = await import('../../../services/accountingLocalDb');
        const rid = restaurantId;
        const mixedHasCredit = paymentMethod === 'mixed' &&
          (splitCash + splitCard + splitOnline) < getFinalAmount() &&
          (splitCash + splitCard + splitOnline) > 0;
        if (rid) {
          await recordOrderPaymentTransactions({
            restaurantId: Number(rid), orderId: res.orderId, orderNumber: res.orderNumber,
            customerPhone: snapshot.customerPhone || undefined,
            paymentMethod: paymentMethod as any,
            finalAmount: snapshot.finalAmount, splitCash, splitCard, splitOnline,
            mixedHasCredit, referenceCode: cardTerminalRefId || undefined,
            cashAccountName: selectedCashBoxName,
            cardAccountName: cardTerminalProfiles.find((p) => p.id === selectedCardTerminalId)?.name || 'کارتخوان',
          });
        }
      } catch {}
    };

    const onOrderFailed = (errorMessage: string) => {
      onError(errorMessage);
      restoreDraft({
        cart: snapshot.items.map((item) => ({
          productId: item.product.id, product: item.product,
          quantity: item.quantity, price: item.price,
          totalPrice: item.quantity * item.price, itemOption: String(item.itemOption ?? ''),
        })),
        customerPhone: snapshot.customerPhone, serviceType: snapshot.serviceType,
        tableNumber: snapshot.tableNumber, tableId: snapshot.tableId,
        customerAddress: snapshot.customerAddress,
        paymentMethod: snapshot.paymentMethod, notes: snapshot.notes,
      });
    };

    const result = await submitOrder({ editingOrderId: editingOrderId ?? undefined, onOrderCreated, onOrderFailed });

    if (result.success) {
      if (isEditingInvoice) {
        const fullName = [trimmedFirstName || loadedCustomerFirstName, trimmedLastName || loadedCustomerLastName].filter(Boolean).join(' ').trim();
        const editedOrderData = {
          id: editingOrderId, orderNumber: `ORD-${editingOrderId}`,
          restaurantName: restaurantNameForPrint,
          customerPhone: snapshot.customerPhone, customerName: fullName || snapshot.customerPhone,
          serviceType: snapshot.serviceType, tableNumber: snapshot.tableNumber,
          customerAddress: snapshot.customerAddress, paymentMethod: snapshot.paymentMethod,
          notes: snapshot.notes, items: snapshot.items,
          totalAmount: snapshot.totalAmount, discountAmount: snapshot.discountAmount,
          vatAmount: snapshot.vatAmount, finalAmount: snapshot.finalAmount,
        };
        runPrint(editedOrderData, [String(editingOrderId)], { printOption, selectedPrinterNames });
        onEditSuccess();
        navigate('/orders');
        return;
      }

      // Save new delivery address
      const addressIsNew = snapshot.serviceType === 'takeaway' && snapshot.customerAddress?.trim() &&
        (selectedAddressId === 'new' || customerAddresses.length === 0);
      if (addressIsNew && token) {
        const isOnline = window.electronAPI ? await window.electronAPI.checkOnline() : navigator.onLine;
        if (isOnline) {
          const normalized = normalizeIranMobile(snapshot.customerPhone.trim());
          if ((restaurantId || restaurantName) && isValidIranMobile(normalized)) {
            createCustomerAddress(
              { restaurantId, restaurantName },
              { customerPhone: normalized, address: snapshot.customerAddress.trim() },
              token,
            ).catch(() => {});
          }
        }
      }

      toast.success('سفارش ثبت شد');
      onSuccess();
    } else {
      onError(result.error || 'خطا در ثبت سفارش');
    }
  };

  const playScanBeep = (ok: boolean) => {
    try {
      if (typeof window === 'undefined') return;
      const Ctx = window.AudioContext || (window as any).webkitAudioContext;
      if (!Ctx) return;
      if (!audioCtxRef.current) audioCtxRef.current = new Ctx();
      const ctx = audioCtxRef.current;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = ok ? 1046 : 280;
      gain.gain.value = 0.0001;
      osc.connect(gain);
      gain.connect(ctx.destination);
      const now = ctx.currentTime;
      gain.gain.exponentialRampToValueAtTime(ok ? 0.08 : 0.12, now + 0.005);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + (ok ? 0.09 : 0.18));
      osc.start(now);
      osc.stop(now + (ok ? 0.1 : 0.2));
    } catch {}
  };

  return { handleSubmit, playScanBeep, formatPrice, runPrint };
}
