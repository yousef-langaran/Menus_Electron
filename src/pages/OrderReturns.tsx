import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import { fetchOrderReturns, updateOrderReturn, deleteOrderReturn } from '../services/api';
import { Card, CardContent, Modal, ModalHeader, ModalBody, ModalFooter, Chip } from '@heroui/react';
import { Button } from '../ui/compat-button';
import { Select, SelectItem } from '../ui/compat-select';
import { toast } from '../utils/toast';

const RETURNS_PAGE_SIZE = 20;

const STATUS_OPTIONS = [
  { value: 'all', label: 'همه وضعیت‌ها' },
  { value: 'pending', label: 'در انتظار' },
  { value: 'approved', label: 'تایید شده' },
  { value: 'rejected', label: 'رد شده' },
  { value: 'completed', label: 'تکمیل شده' },
];

const STATUS_LABELS: Record<string, string> = {
  pending: 'در انتظار',
  approved: 'تایید شده',
  rejected: 'رد شده',
  completed: 'تکمیل شده',
};

const STATUS_COLORS: Record<string, 'default' | 'primary' | 'success' | 'warning' | 'danger'> = {
  pending: 'warning',
  approved: 'primary',
  rejected: 'danger',
  completed: 'success',
};

const REASON_LABELS: Record<string, string> = {
  customer_request: 'درخواست مشتری',
  wrong_order: 'سفارش اشتباه',
  quality_issue: 'مشکل کیفیت',
  damaged: 'آسیب دیده',
  other: 'سایر',
};

const formatPrice = (price?: number) =>
  typeof price === 'number' ? `${new Intl.NumberFormat('fa-IR').format(price)} تومان` : '-';

const formatDate = (value?: string) => (value ? new Date(value).toLocaleString('fa-IR') : '-');

export default function OrderReturnsPage() {
  const navigate = useNavigate();
  const { user, token, logout } = useAuthStore();
  const [statusFilter, setStatusFilter] = useState('all');
  const [returns, setReturns] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [selectedReturn, setSelectedReturn] = useState<any>(null);
  const [detailsModalOpen, setDetailsModalOpen] = useState(false);
  const [updateLoading, setUpdateLoading] = useState(false);
  const [rejectionReason, setRejectionReason] = useState('');
  const [showRejectionInput, setShowRejectionInput] = useState(false);

  const restaurantName = useMemo(() => {
    return user?.restaurants?.[0]?.name;
  }, [user]);

  const restaurantId = useMemo(() => {
    return user?.restaurants?.[0]?.id;
  }, [user]);

  useEffect(() => {
    if (!token) {
      navigate('/login');
      return;
    }
    loadReturns();
  }, [token, navigate, statusFilter, currentPage]);

  const loadReturns = async () => {
    if (!token || !restaurantName) return;

    setLoading(true);

    try {
      const params: any = {
        restaurantName,
        restaurantId,
        page: currentPage,
        limit: RETURNS_PAGE_SIZE,
      };

      if (statusFilter !== 'all') {
        params.status = statusFilter;
      }

      const response = await fetchOrderReturns(params, token);
      setReturns(response.data || []);
      setTotalPages(response.meta?.totalPages || 1);
    } catch (err: any) {
      console.error('Error loading returns:', err);
      if (err.response?.status === 401) {
        logout();
        navigate('/login');
      } else {
        toast.error(err.response?.data?.message || 'خطا در بارگذاری مرجوعی‌ها');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleViewDetails = (returnItem: any) => {
    setSelectedReturn(returnItem);
    setDetailsModalOpen(true);
  };

  const handleUpdateStatus = async (newStatus: string) => {
    if (!selectedReturn || !token) return;

    if (newStatus === 'rejected' && !rejectionReason.trim()) {
      toast.error('لطفاً دلیل رد مرجوعی را وارد کنید');
      return;
    }

    setUpdateLoading(true);
    try {
      const updateData: any = { status: newStatus };
      if (newStatus === 'rejected') {
        updateData.rejectionReason = rejectionReason;
      }
      await updateOrderReturn(selectedReturn.id, updateData, token);
      await loadReturns();
      setDetailsModalOpen(false);
      setSelectedReturn(null);
      setRejectionReason('');
      setShowRejectionInput(false);
    } catch (err: any) {
      console.error('Error updating return status:', err);
      toast.error(err.response?.data?.message || 'خطا در به‌روزرسانی وضعیت');
    } finally {
      setUpdateLoading(false);
    }
  };

  const handleDelete = async (returnId: number) => {
    if (!token) return;
    if (!confirm('آیا از حذف این مرجوعی اطمینان دارید؟')) return;

    try {
      await deleteOrderReturn(returnId, token);
      await loadReturns();
    } catch (err: any) {
      console.error('Error deleting return:', err);
      toast.error(err.response?.data?.message || 'خطا در حذف مرجوعی');
    }
  };

  return (
    <div className="p-6 max-w-7xl mx-auto" dir="rtl">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold">مرجوعی‌های سفارش</h1>
        <Button onClick={() => navigate('/orders')} variant="outline">
          بازگشت به سفارشات
        </Button>
      </div>

      <div className="mb-4 flex gap-4 items-center">
        <Select
          value={statusFilter}
          onChange={(e) => {
            setStatusFilter(e.target.value);
            setCurrentPage(1);
          }}
          className="w-64"
        >
          {STATUS_OPTIONS.map((opt) => (
            <SelectItem key={opt.value} value={opt.value}>
              {opt.label}
            </SelectItem>
          ))}
        </Select>
      </div>

      {loading ? (
        <div className="text-center py-8">در حال بارگذاری...</div>
      ) : returns.length === 0 ? (
        <div className="text-center py-8 text-gray-500">مرجوعی یافت نشد</div>
      ) : (
        <>
          <div className="grid gap-4">
            {returns.map((returnItem) => (
              <Card key={returnItem.id} className="shadow-md">
                <CardContent className="p-4">
                  <div className="flex justify-between items-start">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <h3 className="text-lg font-semibold">
                          شماره مرجوعی: {returnItem.returnNumber}
                        </h3>
                        <Chip color={STATUS_COLORS[returnItem.status] || 'default'} size="sm">
                          {STATUS_LABELS[returnItem.status] || returnItem.status}
                        </Chip>
                      </div>
                      <div className="text-sm text-gray-600 space-y-1">
                        <p>سفارش: {returnItem.order?.orderNumber}</p>
                        <p>دلیل: {REASON_LABELS[returnItem.reason] || returnItem.reason}</p>
                        <p>مبلغ مرجوعی: {formatPrice(returnItem.totalReturnAmount)}</p>
                        <p>تاریخ: {formatDate(returnItem.createdAt)}</p>
                        {returnItem.processedBy && (
                          <p>
                            پردازش شده توسط: {returnItem.processedBy.firstName}{' '}
                            {returnItem.processedBy.lastName}
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        onClick={() => handleViewDetails(returnItem)}
                        variant="outline"
                        size="sm"
                      >
                        جزئیات
                      </Button>
                      <Button
                        onClick={() => handleDelete(returnItem.id)}
                        variant="outline"
                        size="sm"
                        className="text-red-600 hover:text-red-700"
                      >
                        حذف
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {totalPages > 1 && (
            <div className="flex justify-center gap-2 mt-6">
              <Button
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                variant="outline"
              >
                قبلی
              </Button>
              <span className="px-4 py-2">
                صفحه {currentPage} از {totalPages}
              </span>
              <Button
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
                variant="outline"
              >
                بعدی
              </Button>
            </div>
          )}
        </>
      )}

      {/* Details Modal */}
      {selectedReturn && (
        <Modal isOpen={detailsModalOpen} onClose={() => setDetailsModalOpen(false)} size="2xl">
          <ModalHeader>جزئیات مرجوعی {selectedReturn.returnNumber}</ModalHeader>
          <ModalBody>
            <div className="space-y-4" dir="rtl">
              <div>
                <h4 className="font-semibold mb-2">اطلاعات کلی</h4>
                <div className="text-sm space-y-1">
                  <p>سفارش: {selectedReturn.order?.orderNumber}</p>
                  <p>دلیل: {REASON_LABELS[selectedReturn.reason] || selectedReturn.reason}</p>
                  <p>وضعیت: {STATUS_LABELS[selectedReturn.status] || selectedReturn.status}</p>
                  <p>مبلغ کل مرجوعی: {formatPrice(selectedReturn.totalReturnAmount)}</p>
                  <p>تاریخ ایجاد: {formatDate(selectedReturn.createdAt)}</p>
                  {selectedReturn.notes && <p>یادداشت: {selectedReturn.notes}</p>}
                </div>
              </div>

              <div>
                <h4 className="font-semibold mb-2">آیتم‌های مرجوعی</h4>
                <div className="space-y-2">
                  {selectedReturn.items?.map((item: any, idx: number) => (
                    <div key={idx} className="border rounded p-3 text-sm">
                      <p className="font-medium">{item.product?.name}</p>
                      <p>تعداد: {item.quantity}</p>
                      <p>قیمت واحد: {formatPrice(item.unitPrice)}</p>
                      <p>مبلغ کل: {formatPrice(item.totalPrice)}</p>
                      {item.itemNote && <p className="text-gray-600">یادداشت: {item.itemNote}</p>}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </ModalBody>
          <ModalFooter>
            <div className="flex flex-col gap-3 w-full">
              {showRejectionInput && (
                <div>
                  <label className="block text-sm font-medium mb-2">دلیل رد مرجوعی</label>
                  <textarea
                    value={rejectionReason}
                    onChange={(e) => setRejectionReason(e.target.value)}
                    className="w-full px-3 py-2 border rounded"
                    rows={3}
                    placeholder="لطفاً دلیل رد را توضیح دهید..."
                  />
                </div>
              )}
              <div className="flex gap-2 w-full justify-between">
              <div className="flex gap-2">
                {selectedReturn.status === 'pending' && (
                  <>
                    <Button
                      onClick={() => handleUpdateStatus('approved')}
                      disabled={updateLoading}
                      color="primary"
                    >
                      تایید
                    </Button>
                    <Button
                      onClick={() => {
                        if (!showRejectionInput) {
                          setShowRejectionInput(true);
                        } else {
                          handleUpdateStatus('rejected');
                        }
                      }}
                      disabled={updateLoading}
                      color="danger"
                    >
                      {showRejectionInput ? 'تایید رد' : 'رد'}
                    </Button>
                  </>
                )}
                {selectedReturn.status === 'approved' && (
                  <Button
                    onClick={() => handleUpdateStatus('completed')}
                    disabled={updateLoading}
                    color="success"
                  >
                    تکمیل
                  </Button>
                )}
              </div>
              <Button 
                onClick={() => {
                  setDetailsModalOpen(false);
                  setShowRejectionInput(false);
                  setRejectionReason('');
                }} 
                variant="outline"
              >
                بستن
              </Button>
            </div>
            </div>
          </ModalFooter>
        </Modal>
      )}
    </div>
  );
}
