import type { NavigateFunction } from 'react-router-dom';
import type { User } from '../../store/authStore';
import type { PrinterConfig } from '../../store/printerSettingsStore';
import type { Dispatch, SetStateAction } from 'react';
import { createCreditPayment, updateOrderStatus } from '../../services/api';
import {
  loadPrintTemplateSources,
  resolveTemplateForPrinter,
  normalizeTemplateLayout,
} from '../../utils/printTemplates';
import { toast } from '../../utils/toast';

export interface useOrdersActionsArgs {
  creditPayOrder: any;
  token: string | null;
  creditPayAmount: string;
  setCreditPaySaving: Dispatch<SetStateAction<boolean>>;
  restaurantName: any;
  user: User | null;
  creditPayNotes: string;
  creditPayAccountId: string;
  creditPayMethod: 'cash' | 'card' | 'online';
  setCreditPayModalOpen: Dispatch<SetStateAction<boolean>>;
  setCreditPayAmount: Dispatch<SetStateAction<string>>;
  setCreditPayNotes: Dispatch<SetStateAction<string>>;
  loadOnlineOrders: (isRefresh?: boolean) => Promise<void>;
  setStatusUpdateLoading: Dispatch<SetStateAction<number | null>>;
  setSyncInProgress: Dispatch<SetStateAction<boolean>>;
  logout: () => Promise<void>;
  navigate: NavigateFunction;
  loadOfflineOrders: () => Promise<void>;
  isOnline: boolean;
  restaurantNameFa: any;
  enabledPrinters: PrinterConfig[];
  primaryPrinter: PrinterConfig;
  setPreviewLoading: Dispatch<SetStateAction<boolean>>;
  setPreviewHtml: Dispatch<SetStateAction<string>>;
  setPreviewImage: Dispatch<SetStateAction<string>>;
  closePreview: () => void;
  previewPrinterName: string;
  setPreviewOrderPayload: Dispatch<any>;
  setPreviewTitle: Dispatch<SetStateAction<string>>;
  setPreviewPrinterName: Dispatch<SetStateAction<string>>;
  setPreviewVisible: Dispatch<SetStateAction<boolean>>;
  previewOrderPayload: any;
  receiptNumbersMap: Record<string, number>;
}

export function useOrdersActions({
  creditPayOrder,
  token,
  creditPayAmount,
  setCreditPaySaving,
  restaurantName,
  user,
  creditPayNotes,
  creditPayAccountId,
  creditPayMethod,
  setCreditPayModalOpen,
  setCreditPayAmount,
  setCreditPayNotes,
  loadOnlineOrders,
  setStatusUpdateLoading,
  setSyncInProgress,
  logout,
  navigate,
  loadOfflineOrders,
  isOnline,
  restaurantNameFa,
  enabledPrinters,
  primaryPrinter,
  setPreviewLoading,
  setPreviewHtml,
  setPreviewImage,
  closePreview,
  previewPrinterName,
  setPreviewOrderPayload,
  setPreviewTitle,
  setPreviewPrinterName,
  setPreviewVisible,
  previewOrderPayload,
  receiptNumbersMap,
}: useOrdersActionsArgs) {
  const handleCreditPay = async () => {
    if (!creditPayOrder || !token || !creditPayAmount) return;
    const amt = Number(String(creditPayAmount).replace(/,/g, ''));
    if (!amt || amt <= 0) return;
    setCreditPaySaving(true);
    try {
      const restaurantName = user?.restaurants?.[0]?.name || '';
      const result = await createCreditPayment(
        Number(creditPayOrder.id),
        {
          amount: amt,
          restaurantName,
          notes: creditPayNotes.trim() || undefined,
          cashBankAccountId: creditPayAccountId ? Number(creditPayAccountId) : undefined,
          paymentMethod: creditPayMethod,
        },
        token,
      );
      // Record to local cash transactions
      try {
        const { recordCreditPaymentTransaction } = await import('../../services/accountingLocalDb');
        const restaurantId = user?.restaurants?.[0]?.id;
        if (restaurantId) {
          await recordCreditPaymentTransaction({
            restaurantId: Number(restaurantId),
            accountType:
              creditPayMethod === 'cash' ? 'cash' : creditPayMethod === 'card' ? 'card' : 'online',
            amount: amt,
            orderId: creditPayOrder.id,
            orderNumber: creditPayOrder.orderNumber,
            customerPhone: creditPayOrder.customerPhone,
            description: creditPayNotes.trim() || undefined,
          });
        }
      } catch (localErr) {
        console.warn('[CreditPay] local tx record failed:', localErr);
      }
      toast.success(`پرداخت ${Number(amt).toLocaleString('fa-IR')} ریال ثبت شد`);
      if (result.isFullyPaid) toast.success('فاکتور کاملاً تسویه شد ✓');
      setCreditPayModalOpen(false);
      setCreditPayAmount('');
      setCreditPayNotes('');
      await loadOnlineOrders(true);
    } catch (e: any) {
      toast.error(e?.response?.data?.message || 'خطا در ثبت پرداخت');
    } finally {
      setCreditPaySaving(false);
    }
  };

  const handleStatusChange = async (orderId: number, status: string) => {
    setStatusUpdateLoading(orderId);
    try {
      await updateOrderStatus(orderId, status, token || undefined);
      await loadOnlineOrders(true);
    } catch (error: any) {
      console.error('Failed to update status:', error);
      toast.error(error?.response?.data?.message || 'خطا در تغییر وضعیت سفارش');
    } finally {
      setStatusUpdateLoading(null);
    }
  };

  const syncAndRefresh = async (auto = false) => {
    if (!window.electronAPI?.syncOrders) {
      await loadOnlineOrders();
      return;
    }

    setSyncInProgress(true);
    try {
      const result = await window.electronAPI.syncOrders(token || undefined);
      if (result) {
        const unauthorizedError = Array.isArray(result.errors)
          ? result.errors.find(
              (msg: string) => typeof msg === 'string' && /unauthorized/i.test(msg),
            )
          : null;

        if (unauthorizedError) {
          toast.warning(
            'نشست شما منقضی شده است. لطفاً دوباره وارد شوید و سپس همگام‌سازی را تکرار کنید.',
          );
          if (!auto) {
            await logout();
            navigate('/login');
          }
          return;
        }

        toast.success(`ارسال انجام شد: ${result.success} موفق، ${result.failed} ناموفق`);
      }
      await loadOfflineOrders();
      await loadOnlineOrders(true);
    } catch (error: any) {
      console.error('Sync error:', error);
      toast.error(error?.message || 'خطا در همگام‌سازی سفارشات آفلاین');
    } finally {
      setSyncInProgress(false);
    }
  };

  const handleManualSync = () => {
    if (!isOnline) {
      toast.warning('برای ارسال سفارشات آفلاین ابتدا باید آنلاین شوید.');
      return;
    }
    syncAndRefresh();
  };
  // دکمهٔ همگام‌سازی دستی فعلاً در UI نیست؛ مرجع را نگه می‌داریم (noUnusedLocals).
  void handleManualSync;

  const normalizeOrderForReceipt = (order: any, isOffline = false) => {
    if (isOffline) {
      const payload = { ...(order?.orderData || {}) };
      if (!payload.orderNumber) {
        payload.orderNumber = order.orderData?.orderNumber || order.id;
      }
      if (!payload.id) {
        payload.id = order.id;
      }
      if (!payload.createdAt) {
        payload.createdAt = order.createdAt;
      }
      if (!payload.items && order.orderData?.items) {
        payload.items = order.orderData.items;
      }
      payload.restaurantName = payload.restaurantName || restaurantNameFa || restaurantName || '';
      // صف آفلاین بدنهٔ ثبت سفارش را ذخیره می‌کند و آن بدنه فیلد جدا برای
      // ارزش افزوده ندارد (DTO سرور آن را نمی‌پذیرد). اما `finalAmount` ذخیره‌شده
      // شامل ارزش افزوده است، پس مبلغش از اختلاف با «جمع کل − تخفیف» درمی‌آید.
      if (payload.vatAmount == null) {
        const net = Number(payload.totalAmount || 0) - Number(payload.discountAmount || 0);
        const derived = Number(payload.finalAmount || 0) - net;
        payload.vatAmount = derived > 0 ? derived : 0;
      }
      return payload;
    }
    const payload = { ...order };
    if (!payload.orderNumber && payload.id != null) {
      payload.orderNumber = payload.orderNumber || payload.order_number || `ORD-${payload.id}`;
    }
    payload.restaurantName = payload.restaurantName || restaurantNameFa || restaurantName || '';
    return payload;
  };

  /** تنظیمات پیش‌نمایش بر اساس پرینتر انتخاب‌شده (قالب/کاغذ آن پرینتر) */
  const getPreviewOptionsForPrinter = async (printerName: string) => {
    const printer = enabledPrinters.find((p) => p.name === printerName) || primaryPrinter;
    let paperWidth = printer?.paperWidth ?? 80;
    let margin = printer?.margin ?? 5;
    let layout: { version: 2; rows: any[] } | undefined;
    if (window.electronAPI?.getPrintTemplatesMap) {
      const { templatesMap, defaultTemplate } = await loadPrintTemplateSources();
      // پیش‌نمایش همیشه رسید کامل است، پس قالبِ همان رسید را نشان می‌دهیم
      const template = resolveTemplateForPrinter(
        printerName,
        templatesMap,
        defaultTemplate,
        'full',
      );
      if (template) {
        paperWidth = template.paperWidth ?? paperWidth;
        margin = template.margin ?? margin;
        layout = normalizeTemplateLayout(template.layout);
      }
    }
    const isNarrow = paperWidth <= 62;
    const shiftLeftMm = isNarrow ? 12 : 14;
    const contentWidthMm = Math.max(32, paperWidth - margin * 2 - shiftLeftMm);
    const options: Record<string, unknown> = {
      paperWidth,
      margin,
      contentWidthMm,
      shiftLeftMm,
      receiptType: 'full' as const,
    };
    if (layout) options.layout = layout;
    return options;
  };

  const runPreviewWithPrinter = async (orderPayload: any, printerName: string) => {
    setPreviewLoading(true);
    try {
      const options = await getPreviewOptionsForPrinter(printerName);
      if (window.electronAPI?.generateReceiptPreview) {
        const result = await window.electronAPI.generateReceiptPreview(orderPayload, options);
        if (!result?.success) {
          throw new Error(result?.error || 'امکان ساخت پیش‌نمایش وجود ندارد.');
        }
        setPreviewHtml(result.html || '');
        setPreviewImage(result.imageDataUrl || '');
      } else {
        toast.error('پیش‌نمایش رسید فقط در نسخهٔ دسکتاپ (اپ الکترون) در دسترس است.');
        closePreview();
      }
    } catch (error: any) {
      console.error('Preview error:', error);
      toast.error(error?.message || 'خطا در ساخت پیش‌نمایش رسید');
      closePreview();
    } finally {
      setPreviewLoading(false);
    }
  };

  const openReceiptPreview = async (orderPayload: any, title: string, printerName?: string) => {
    const targetPrinter = printerName || previewPrinterName || primaryPrinter?.name || '';
    setPreviewOrderPayload(orderPayload);
    setPreviewTitle(title);
    setPreviewPrinterName(targetPrinter);
    setPreviewHtml('');
    setPreviewImage('');
    setPreviewVisible(true);
    await runPreviewWithPrinter(orderPayload, targetPrinter);
  };

  const handlePreviewPrinterChange = async (newPrinterName: string) => {
    setPreviewPrinterName(newPrinterName);
    if (previewOrderPayload) {
      await runPreviewWithPrinter(previewOrderPayload, newPrinterName);
    }
  };

  const handlePreviewOrder = (order: any, isOffline = false) => {
    const normalized = normalizeOrderForReceipt(order, isOffline);
    if (!isOffline && normalized.receiptCallNumber == null) {
      const fromMap = receiptNumbersMap[String(order.id)] ?? receiptNumbersMap[order.orderNumber];
      if (fromMap != null) normalized.receiptCallNumber = fromMap;
    }
    const title = isOffline
      ? `پیش‌نمایش سفارش آفلاین #${order?.id || ''}`
      : `پیش‌نمایش سفارش #${order?.orderNumber || order?.id || ''}`;
    openReceiptPreview(normalized, title);
  };

  return {
    handleCreditPay,
    handleStatusChange,
    normalizeOrderForReceipt,
    handlePreviewPrinterChange,
    handlePreviewOrder,
  };
}
