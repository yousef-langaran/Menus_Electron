import { useCallback, useEffect, useRef, useState } from 'react';
import { Modal, ModalHeader, ModalBody, ModalFooter } from '@heroui/react';
import { ModalShell } from '../../ui/modal-shell';
import { Button } from '../../ui/compat-button';
import { Input } from '../../ui/compat-input';
import { Select, SelectItem } from '../../ui/compat-select';
import { ShamsiDatePicker } from '../../ui/ShamsiDatePicker';
import { formatPriceInput, parseFormattedNumber } from '../../utils/money';
import {
  getLocalServiceJobItems,
  getJobOpsState,
  addServiceJobItemLocal,
  updateServiceJobItemLocal,
  removeServiceJobItemLocal,
  updateServiceJobLocal,
  type LocalServiceBoard,
  type LocalServiceJob,
  type LocalServiceJobItem,
  type ServiceJobPriority,
} from '../../services/serviceJobsLocalDb';
import { getServiceJobStaffRemote, issueServiceJobInvoiceRemote, addServiceJobAttachmentRemote } from '../../services/api';
import { refreshServiceJobDetail, resolveOnlineStatus } from '../../services/serviceJobsSync';
import { AddJobItemModal } from './AddJobItemModal';
import { IssueInvoiceModal } from './IssueInvoiceModal';
import { toast } from '../../utils/toast';

const PRIORITY_OPTIONS: { key: ServiceJobPriority; label: string }[] = [
  { key: 'low', label: 'کم' }, { key: 'normal', label: 'معمولی' }, { key: 'high', label: 'زیاد' }, { key: 'urgent', label: 'فوری' },
];

interface Props {
  job: LocalServiceJob;
  board: LocalServiceBoard;
  restaurantId: number;
  token: string;
  onClose: () => void;
  onUpdated: () => void;
}

export function JobDetailPanel({ job, board, restaurantId, token, onClose, onUpdated }: Props) {
  const [localJob, setLocalJob] = useState(job);
  const [items, setItems] = useState<LocalServiceJobItem[]>([]);
  const [editItem, setEditItem] = useState<LocalServiceJobItem | null>(null);
  const [opState, setOpState] = useState<{ hasPending: boolean; hasFailed: boolean; errors: string[] }>({ hasPending: false, hasFailed: false, errors: [] });
  const [isOnline, setIsOnline] = useState(true);
  const [remoteExtra, setRemoteExtra] = useState<{ attachments: any[]; activities: any[] } | null>(null);
  const [isLoadingRemote, setIsLoadingRemote] = useState(false);

  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [editTitle, setEditTitle] = useState(job.title);
  const [editCustomerName, setEditCustomerName] = useState(job.customerName ?? '');
  const [editCustomerPhone, setEditCustomerPhone] = useState(job.customerPhone ?? '');
  const [editPriority, setEditPriority] = useState<ServiceJobPriority>(job.priority);
  const [editDueDate, setEditDueDate] = useState(job.dueDate ?? '');
  const [editEstimated, setEditEstimated] = useState(job.estimatedAmount > 0 ? String(Math.round(job.estimatedAmount / 10)) : '');
  const [editAssigneeId, setEditAssigneeId] = useState(job.assigneeId != null ? String(job.assigneeId) : '');
  const [staff, setStaff] = useState<{ id: number; name: string }[]>([]);

  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [isAddItemOpen, setIsAddItemOpen] = useState(false);
  const [isIssueInvoiceOpen, setIsIssueInvoiceOpen] = useState(false);
  const addItemModal = { isOpen: isAddItemOpen, onOpen: () => setIsAddItemOpen(true), onClose: () => setIsAddItemOpen(false) };
  const issueInvoiceModal = { isOpen: isIssueInvoiceOpen, onOpen: () => setIsIssueInvoiceOpen(true), onClose: () => setIsIssueInvoiceOpen(false) };

  const loadLocal = useCallback(async () => {
    const [its, ops] = await Promise.all([getLocalServiceJobItems(localJob.id), getJobOpsState(localJob.id)]);
    setItems(its);
    setOpState(ops);
  }, [localJob.id]);

  useEffect(() => { loadLocal(); }, [loadLocal]);

  useEffect(() => {
    resolveOnlineStatus().then(async (online) => {
      setIsOnline(online);
      if (!online) return;
      getServiceJobStaffRemote(restaurantId, token).then(setStaff).catch(() => {});
      if (localJob.id > 0) {
        setIsLoadingRemote(true);
        try {
          const serverJob = await refreshServiceJobDetail(localJob.id, restaurantId, token);
          setRemoteExtra({ attachments: serverJob.attachments ?? [], activities: serverJob.activities ?? [] });
          await loadLocal();
        } catch {
          // اگر پرونده هنوز روی سرور سینک نشده یا خطا رخ داد، نادیده بگیر
        } finally {
          setIsLoadingRemote(false);
        }
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const status = board.statuses.find((s) => s.id === localJob.statusId);

  const startEdit = () => {
    setEditTitle(localJob.title);
    setEditCustomerName(localJob.customerName ?? '');
    setEditCustomerPhone(localJob.customerPhone ?? '');
    setEditPriority(localJob.priority);
    setEditDueDate(localJob.dueDate ?? '');
    setEditEstimated(localJob.estimatedAmount > 0 ? String(Math.round(localJob.estimatedAmount / 10)) : '');
    setEditAssigneeId(localJob.assigneeId != null ? String(localJob.assigneeId) : '');
    setIsEditing(true);
  };

  const saveEdit = async () => {
    if (!editTitle.trim()) return;
    setIsSaving(true);
    try {
      const assignee = staff.find((s) => String(s.id) === editAssigneeId);
      await updateServiceJobLocal(localJob.id, {
        title: editTitle.trim(),
        customerName: editCustomerName.trim() || null,
        customerPhone: editCustomerPhone.trim() || null,
        priority: editPriority,
        dueDate: editDueDate || null,
        estimatedAmount: editEstimated ? Number(editEstimated) * 10 : 0,
        assigneeId: editAssigneeId ? Number(editAssigneeId) : null,
        assigneeName: assignee?.name ?? null,
      });
      setLocalJob((prev) => ({
        ...prev,
        title: editTitle.trim(),
        customerName: editCustomerName.trim() || null,
        customerPhone: editCustomerPhone.trim() || null,
        priority: editPriority,
        dueDate: editDueDate || null,
        estimatedAmount: editEstimated ? Number(editEstimated) * 10 : 0,
        assigneeId: editAssigneeId ? Number(editAssigneeId) : null,
        assigneeName: assignee?.name ?? null,
      }));
      setIsEditing(false);
      await loadLocal();
      onUpdated();
      toast.success(isOnline ? 'پرونده به‌روزرسانی شد' : 'ذخیره شد — در انتظار سینک');
    } finally {
      setIsSaving(false);
    }
  };

  const handleAddItem = async (data: { itemType: any; description: string; quantity: number; unitPrice: number; deductFromInventory: boolean }) => {
    await addServiceJobItemLocal(restaurantId, localJob.id, data);
    await loadLocal();
    onUpdated();
    toast.success(isOnline ? 'قلم اضافه شد' : 'ذخیره شد — در انتظار سینک');
  };

  const handleEditItem = async (data: { itemType: any; description: string; quantity: number; unitPrice: number; deductFromInventory: boolean }) => {
    if (!editItem) return;
    await updateServiceJobItemLocal(restaurantId, localJob.id, editItem.id, data);
    setEditItem(null);
    await loadLocal();
    onUpdated();
    toast.success(isOnline ? 'قلم ویرایش شد' : 'ذخیره شد — در انتظار سینک');
  };

  const handleRemoveItem = async (item: LocalServiceJobItem) => {
    if (!confirm(`قلم «${item.description}» حذف شود؟`)) return;
    await removeServiceJobItemLocal(restaurantId, localJob.id, item.id);
    await loadLocal();
    onUpdated();
  };

  const handleIssueInvoice = async (opts: { warehouseId?: number; vatRate?: number; saleDate?: string }) => {
    try {
      const serverJob = await issueServiceJobInvoiceRemote(localJob.id, restaurantId, opts, token);
      setLocalJob((prev) => ({ ...prev, finalAmount: serverJob.finalAmount, salesInvoiceId: serverJob.salesInvoiceId }));
      issueInvoiceModal.onClose();
      onUpdated();
      toast.success('فاکتور با موفقیت صادر شد');
    } catch (e: any) {
      toast.error(e?.response?.data?.message || 'خطا در صدور فاکتور');
    }
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsUploading(true);
    try {
      await addServiceJobAttachmentRemote(localJob.id, restaurantId, file, token);
      const serverJob = await refreshServiceJobDetail(localJob.id, restaurantId, token);
      setRemoteExtra({ attachments: serverJob.attachments ?? [], activities: serverJob.activities ?? [] });
      toast.success('فایل پیوست شد');
    } catch {
      toast.error('خطا در بارگذاری فایل — نیاز به اتصال اینترنت دارد');
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const subtotal = items.reduce((s, i) => s + i.lineTotal, 0);

  return (
    <Modal isOpen onOpenChange={onClose}>
      <ModalShell size="3xl">
        <ModalHeader>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-mono text-xs text-default-400">{localJob.jobNumber ?? '(در صف ثبت)'}</span>
            <span className="font-bold">{localJob.title}</span>
            {status && (
              <span className="text-xs px-2 py-1 rounded-lg font-medium" style={status.color ? { backgroundColor: status.color + '22', color: status.color } : undefined}>
                {status.label}
              </span>
            )}
            {opState.hasFailed && <span className="text-xs px-2 py-1 rounded-lg bg-danger-100 text-danger-700">خطای سینک</span>}
            {opState.hasPending && !opState.hasFailed && <span className="text-xs px-2 py-1 rounded-lg bg-warning-100 text-warning-700">در صف سینک</span>}
          </div>
        </ModalHeader>
        <ModalBody className="space-y-4">
          {opState.hasFailed && opState.errors.length > 0 && (
            <div className="text-xs text-danger-600 bg-danger-50 border border-danger-200 rounded-lg px-3 py-2">
              {opState.errors.join(' — ')}
            </div>
          )}

          {/* اطلاعات اصلی */}
          <div className="border border-default-200 rounded-xl p-4 space-y-3">
            {isEditing ? (
              <div className="space-y-3">
                <Input label="عنوان" value={editTitle} onValueChange={setEditTitle} />
                <div className="grid grid-cols-2 gap-3">
                  <Input label="نام مشتری" value={editCustomerName} onValueChange={setEditCustomerName} />
                  <Input label="شماره تماس" value={editCustomerPhone} onValueChange={setEditCustomerPhone} dir="ltr" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <Select label="اولویت" selectedKeys={[editPriority]} onSelectionChange={(keys) => { const v = Array.from(keys)[0] as ServiceJobPriority; if (v) setEditPriority(v); }}>
                    {PRIORITY_OPTIONS.map((p) => <SelectItem key={p.key}>{p.label}</SelectItem>)}
                  </Select>
                  <ShamsiDatePicker label="تاریخ سررسید" value={editDueDate} onChange={setEditDueDate} />
                </div>
                <Input
                  label="مبلغ تخمینی (تومان)"
                  value={formatPriceInput(editEstimated)}
                  onValueChange={(v) => setEditEstimated(v === '' ? '' : String(parseFormattedNumber(v)))}
                />
                {staff.length > 0 && (
                  <Select label="مسئول" selectedKeys={editAssigneeId ? [editAssigneeId] : []} onSelectionChange={(keys) => setEditAssigneeId(Array.from(keys)[0] as string ?? '')}>
                    <SelectItem key="">بدون مسئول</SelectItem>
                    {staff.map((s) => <SelectItem key={String(s.id)}>{s.name}</SelectItem>)}
                  </Select>
                )}
                <div className="flex justify-end gap-2">
                  <Button variant="light" size="sm" onPress={() => setIsEditing(false)} isDisabled={isSaving}>انصراف</Button>
                  <Button color="primary" size="sm" onPress={saveEdit} isLoading={isSaving} isDisabled={!editTitle.trim()}>ذخیره</Button>
                </div>
              </div>
            ) : (
              <>
                <div className="flex justify-between items-start">
                  <div className="grid grid-cols-2 gap-2 text-sm flex-1">
                    <InfoRow label="مشتری" value={localJob.customerName || localJob.customerPhone} />
                    <InfoRow label="تلفن" value={localJob.customerPhone} />
                    <InfoRow label="مسئول" value={localJob.assigneeName} />
                    <InfoRow label="اولویت" value={PRIORITY_OPTIONS.find((p) => p.key === localJob.priority)?.label} />
                    <InfoRow label="موعد" value={localJob.dueDate ? new Date(localJob.dueDate).toLocaleDateString('fa-IR') : undefined} />
                    {localJob.estimatedAmount > 0 && <InfoRow label="تخمین" value={`${localJob.estimatedAmount.toLocaleString('fa-IR')} ریال`} />}
                    {localJob.salesInvoiceId && <InfoRow label="فاکتور" value={`#${localJob.salesInvoiceId}`} />}
                  </div>
                  <button onClick={startEdit} className="text-default-400 hover:text-primary-500 text-sm px-2 py-1 rounded-lg">ویرایش</button>
                </div>
                {localJob.formData && Object.keys(localJob.formData).length > 0 && (
                  <div className="pt-2 border-t border-default-100 grid grid-cols-2 gap-2 text-sm">
                    {board.formFields.filter((f) => localJob.formData?.[f.key] !== undefined).map((f) => (
                      <InfoRow key={f.key} label={f.label} value={String(localJob.formData![f.key])} />
                    ))}
                  </div>
                )}
              </>
            )}
          </div>

          {/* اقلام */}
          <div className="border border-default-200 rounded-xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-sm">اقلام پرونده</h3>
              {!localJob.salesInvoiceId && (
                <Button size="sm" variant="flat" onPress={() => { setEditItem(null); addItemModal.onOpen(); }}>افزودن قلم</Button>
              )}
            </div>
            {items.length === 0 ? (
              <p className="text-sm text-default-400 text-center py-4">قلمی ثبت نشده</p>
            ) : (
              <div className="divide-y divide-default-100">
                {items.map((item) => (
                  <div key={item.id} className="flex items-center justify-between py-2 text-sm">
                    <div className="min-w-0 flex-1">
                      <p>{item.description}</p>
                      <p className="text-xs text-default-400">{item.quantity} × {item.unitPrice.toLocaleString('fa-IR')} = {item.lineTotal.toLocaleString('fa-IR')} ریال</p>
                    </div>
                    {!localJob.salesInvoiceId && (
                      <div className="flex gap-2 flex-shrink-0">
                        <button onClick={() => { setEditItem(item); addItemModal.onOpen(); }} className="text-default-400 hover:text-primary-500 text-xs">ویرایش</button>
                        <button onClick={() => handleRemoveItem(item)} className="text-default-400 hover:text-danger-500 text-xs">حذف</button>
                      </div>
                    )}
                  </div>
                ))}
                <div className="flex justify-between pt-2 text-sm font-bold">
                  <span>جمع</span>
                  <span className="font-mono">{subtotal.toLocaleString('fa-IR')} ریال</span>
                </div>
              </div>
            )}
            {!localJob.salesInvoiceId && items.length > 0 && (
              isOnline ? (
                <div className="flex justify-end">
                  <Button size="sm" color="primary" onPress={issueInvoiceModal.onOpen}>صدور فاکتور فروش</Button>
                </div>
              ) : (
                <p className="text-xs text-warning-600 text-left">صدور فاکتور نیاز به اتصال اینترنت دارد</p>
              )
            )}
          </div>

          {/* پیوست‌ها */}
          <div className="border border-default-200 rounded-xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-sm">پیوست‌ها {remoteExtra && `(${remoteExtra.attachments.length})`}</h3>
              {isOnline && localJob.id > 0 ? (
                <>
                  <input ref={fileInputRef} type="file" className="hidden" onChange={handleUpload} />
                  <Button size="sm" variant="flat" onPress={() => fileInputRef.current?.click()} isLoading={isUploading}>افزودن فایل</Button>
                </>
              ) : (
                <span className="text-xs text-warning-600">نیاز به اتصال اینترنت</span>
              )}
            </div>
            {isLoadingRemote ? (
              <p className="text-sm text-default-400 text-center py-2">در حال بارگذاری…</p>
            ) : !remoteExtra ? (
              <p className="text-sm text-default-400 text-center py-2">فقط آنلاین قابل مشاهده</p>
            ) : remoteExtra.attachments.length === 0 ? (
              <p className="text-sm text-default-400 text-center py-2">فایلی پیوست نشده</p>
            ) : (
              <div className="space-y-1">
                {remoteExtra.attachments.map((att: any) => (
                  <div key={att.id} className="text-sm flex justify-between">
                    <span>{att.originalName ?? 'فایل'}</span>
                    <span className="text-xs text-default-400">{new Date(att.createdAt).toLocaleDateString('fa-IR')}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* تاریخچه */}
          <div className="border border-default-200 rounded-xl p-4 space-y-2">
            <h3 className="font-semibold text-sm">تاریخچه فعالیت‌ها</h3>
            {!remoteExtra ? (
              <p className="text-sm text-default-400 text-center py-2">فقط آنلاین قابل مشاهده</p>
            ) : remoteExtra.activities.length === 0 ? (
              <p className="text-sm text-default-400 text-center py-2">فعالیتی ثبت نشده</p>
            ) : (
              <div className="space-y-1.5 text-sm">
                {remoteExtra.activities.map((act: any) => (
                  <div key={act.id} className="flex justify-between text-default-600">
                    <span>{act.note || act.type}</span>
                    <span className="text-xs text-default-400">{new Date(act.createdAt).toLocaleDateString('fa-IR')}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </ModalBody>
        <ModalFooter>
          <Button variant="light" onPress={onClose}>بستن</Button>
        </ModalFooter>
      </ModalShell>

      <AddJobItemModal
        isOpen={addItemModal.isOpen}
        onClose={() => { addItemModal.onClose(); setEditItem(null); }}
        onSave={editItem ? handleEditItem : handleAddItem}
        editItem={editItem}
      />
      <IssueInvoiceModal
        isOpen={issueInvoiceModal.isOpen}
        onClose={issueInvoiceModal.onClose}
        items={items}
        onConfirm={handleIssueInvoice}
      />
    </Modal>
  );
}

function InfoRow({ label, value }: { label: string; value?: string | null }) {
  if (!value) return null;
  return (
    <div className="flex gap-1.5 min-w-0">
      <span className="text-default-400 flex-shrink-0">{label}:</span>
      <span className="text-default-800 truncate">{value}</span>
    </div>
  );
}
