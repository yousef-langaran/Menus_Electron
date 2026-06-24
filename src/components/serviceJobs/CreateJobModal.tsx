import { useEffect, useRef, useState } from 'react';
import { Modal, ModalHeader, ModalBody, ModalFooter } from '@heroui/react';
import { ModalShell } from '../../ui/modal-shell';
import { Button } from '../../ui/compat-button';
import { Input } from '../../ui/compat-input';
import { Select, SelectItem } from '../../ui/compat-select';
import { Textarea } from '../../ui/compat-textarea';
import { CheckboxCompat } from '../../ui/compat-checkbox';
import { ShamsiDatePicker } from '../../ui/ShamsiDatePicker';
import { formatPriceInput, parseFormattedNumber } from '../../utils/money';
import { createServiceJobLocal, type LocalServiceBoard, type ServiceJobPriority } from '../../services/serviceJobsLocalDb';
import { getServiceJobStaffRemote, phoneLookupServiceJobRemote, registerServiceCustomerRemote } from '../../services/api';
import { resolveOnlineStatus } from '../../services/serviceJobsSync';
import { toast } from '../../utils/toast';

const PRIORITY_OPTIONS: { key: ServiceJobPriority; label: string }[] = [
  { key: 'low', label: 'کم' },
  { key: 'normal', label: 'معمولی' },
  { key: 'high', label: 'زیاد' },
  { key: 'urgent', label: 'فوری' },
];

interface Props {
  isOpen: boolean;
  onClose: () => void;
  board: LocalServiceBoard;
  defaultStatusId?: number;
  restaurantId: number;
  token: string;
  onCreated: () => void;
}

export function CreateJobModal({ isOpen, onClose, board, defaultStatusId, restaurantId, token, onCreated }: Props) {
  const [title, setTitle] = useState('');
  const [statusId, setStatusId] = useState<string>(String(defaultStatusId ?? board.statuses[0]?.id ?? ''));
  const [customerPhone, setCustomerPhone] = useState('');
  const [customerFirstName, setCustomerFirstName] = useState('');
  const [customerLastName, setCustomerLastName] = useState('');
  const [assigneeId, setAssigneeId] = useState('');
  const [priority, setPriority] = useState<ServiceJobPriority>('normal');
  const [dueDate, setDueDate] = useState('');
  const [estimatedAmount, setEstimatedAmount] = useState('');
  const [formData, setFormData] = useState<Record<string, any>>({});
  const [staff, setStaff] = useState<{ id: number; name: string }[]>([]);
  const [lookupResult, setLookupResult] = useState<{ found: boolean; customerId?: number; name?: string } | null>(null);
  const [isLookingUp, setIsLookingUp] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const lookupTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setStatusId(String(defaultStatusId ?? board.statuses[0]?.id ?? ''));
    resolveOnlineStatus().then((online) => {
      if (online) getServiceJobStaffRemote(restaurantId, token).then(setStaff).catch(() => {});
    });
  }, [isOpen, defaultStatusId, board, restaurantId, token]);

  useEffect(() => {
    if (lookupTimer.current) clearTimeout(lookupTimer.current);
    setLookupResult(null);
    const digits = customerPhone.replace(/\D/g, '');
    if (digits.length >= 10) {
      setIsLookingUp(true);
      lookupTimer.current = setTimeout(async () => {
        const online = await resolveOnlineStatus();
        if (!online) { setIsLookingUp(false); return; }
        try {
          const res = await phoneLookupServiceJobRemote(customerPhone.trim(), token);
          setLookupResult(res);
        } catch {
          // نادیده گرفته شود
        } finally {
          setIsLookingUp(false);
        }
      }, 600);
    }
    return () => { if (lookupTimer.current) clearTimeout(lookupTimer.current); };
  }, [customerPhone, token]);

  const reset = () => {
    setTitle(''); setCustomerPhone(''); setCustomerFirstName(''); setCustomerLastName(''); setAssigneeId('');
    setPriority('normal'); setDueDate(''); setEstimatedAmount(''); setFormData({}); setLookupResult(null);
  };

  const sortedFields = [...(board.formFields ?? [])].sort((a, b) => a.order - b.order);

  const handleFieldChange = (key: string, value: any) => {
    setFormData((prev) => {
      const next = { ...prev, [key]: value };
      sortedFields.forEach((f) => { if (f.dependsOnKey === key) delete next[f.key]; });
      return next;
    });
  };

  const phoneEntered = customerPhone.trim().length > 0;
  const needsNameEntry = phoneEntered && lookupResult !== null && !lookupResult.found;
  const nameMissing = needsNameEntry && (!customerFirstName.trim() || !customerLastName.trim());
  const pendingLookup = phoneEntered && isLookingUp;

  const handleSubmit = async () => {
    if (!title.trim() || !statusId || nameMissing || pendingLookup) return;
    setIsSubmitting(true);
    try {
      let resolvedCustomerId: number | null = lookupResult?.found ? (lookupResult.customerId ?? null) : null;
      let resolvedName: string | null = lookupResult?.found ? (lookupResult.name ?? null) : null;

      if (phoneEntered && !resolvedCustomerId) {
        const online = await resolveOnlineStatus();
        if (!online) {
          toast.error('برای ثبت مشتری جدید نیاز به اتصال اینترنت دارید');
          setIsSubmitting(false);
          return;
        }
        const res = await registerServiceCustomerRemote(
          restaurantId,
          { phone: customerPhone.trim(), firstName: customerFirstName.trim(), lastName: customerLastName.trim() },
          token,
        );
        resolvedCustomerId = res.customerId;
        resolvedName = res.name;
      }

      const status = board.statuses.find((s) => s.id === Number(statusId));
      const assignee = staff.find((s) => String(s.id) === assigneeId);
      await createServiceJobLocal({
        restaurantId,
        boardId: board.id,
        boardName: board.name,
        statusId: Number(statusId),
        statusLabel: status?.label ?? null,
        statusColor: status?.color ?? null,
        statusCategory: status?.category ?? null,
        title: title.trim(),
        customerName: resolvedName,
        customerPhone: phoneEntered ? customerPhone.trim() : null,
        customerId: resolvedCustomerId,
        assigneeId: assigneeId ? Number(assigneeId) : null,
        assigneeName: assignee?.name ?? null,
        priority,
        dueDate: dueDate || null,
        estimatedAmount: estimatedAmount ? Number(estimatedAmount) * 10 : 0,
        formData: Object.keys(formData).length ? formData : null,
      });
      reset();
      onClose();
      onCreated();
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onOpenChange={onClose}>
      <ModalShell size="lg">
        <ModalHeader>پرونده جدید — {board.name}</ModalHeader>
        <ModalBody className="space-y-3">
          <Input label="عنوان پرونده *" value={title} onValueChange={setTitle} placeholder="مثال: تعمیر آیفون ۱۵" />

          <Select
            label="وضعیت اولیه"
            selectedKeys={statusId ? [statusId] : []}
            onSelectionChange={(keys) => { const v = Array.from(keys)[0]; if (v) setStatusId(v); }}
          >
            {board.statuses.map((s) => <SelectItem key={String(s.id)}>{s.label}</SelectItem>)}
          </Select>

          <div className="space-y-1">
            <Input label="شماره موبایل مشتری" value={customerPhone} onValueChange={setCustomerPhone} dir="ltr" />
            {pendingLookup && <p className="text-xs text-default-400 px-1">در حال بررسی…</p>}
            {!pendingLookup && lookupResult?.found && (
              <p className="text-xs text-success-600 px-1">✓ مشتری: {lookupResult.name}</p>
            )}
          </div>

          {needsNameEntry && (
            <div className="grid grid-cols-2 gap-3">
              <Input label="نام *" value={customerFirstName} onValueChange={setCustomerFirstName} />
              <Input label="نام خانوادگی *" value={customerLastName} onValueChange={setCustomerLastName} />
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <Select
              label="اولویت"
              selectedKeys={[priority]}
              onSelectionChange={(keys) => { const v = Array.from(keys)[0] as ServiceJobPriority; if (v) setPriority(v); }}
            >
              {PRIORITY_OPTIONS.map((p) => <SelectItem key={p.key}>{p.label}</SelectItem>)}
            </Select>
            <ShamsiDatePicker label="تاریخ سررسید" value={dueDate} onChange={setDueDate} />
          </div>

          {staff.length > 0 && (
            <Select
              label="مسئول"
              selectedKeys={assigneeId ? [assigneeId] : []}
              onSelectionChange={(keys) => setAssigneeId(Array.from(keys)[0] as string ?? '')}
            >
              <SelectItem key="">بدون مسئول</SelectItem>
              {staff.map((s) => <SelectItem key={String(s.id)}>{s.name}</SelectItem>)}
            </Select>
          )}

          <Input
            label="مبلغ تخمینی (تومان)"
            value={formatPriceInput(estimatedAmount)}
            onValueChange={(v) => setEstimatedAmount(v === '' ? '' : String(parseFormattedNumber(v)))}
          />

          {sortedFields.map((field) => (
            <DynamicField key={field.key} field={field} value={formData[field.key]} onChange={(v) => handleFieldChange(field.key, v)} formData={formData} />
          ))}
        </ModalBody>
        <ModalFooter>
          <Button variant="light" onPress={onClose} isDisabled={isSubmitting}>انصراف</Button>
          <Button color="primary" onPress={handleSubmit} isLoading={isSubmitting} isDisabled={!title.trim() || nameMissing || pendingLookup}>
            ایجاد پرونده
          </Button>
        </ModalFooter>
      </ModalShell>
    </Modal>
  );
}

function getFieldOptions(field: LocalServiceBoard['formFields'][number], formData: Record<string, any>): string[] {
  if (!field.dependsOnKey) {
    return Array.isArray(field.options) ? field.options : [];
  }
  if (Array.isArray(field.options)) return [];
  const parentValue = formData[field.dependsOnKey];
  if (!parentValue) return [];
  return (field.options as Record<string, string[]> | null)?.[parentValue] ?? [];
}

function DynamicField({ field, value, onChange, formData }: {
  field: LocalServiceBoard['formFields'][number];
  value: any;
  onChange: (v: any) => void;
  formData: Record<string, any>;
}) {
  const label = field.label + (field.required ? ' *' : '');
  switch (field.fieldType) {
    case 'textarea':
      return <Textarea label={label} value={value ?? ''} onValueChange={onChange} rows={3} />;
    case 'number':
      return <Input label={label} type="number" value={value ?? ''} onValueChange={onChange} />;
    case 'date':
      return <ShamsiDatePicker label={label} value={value ?? ''} onChange={onChange} />;
    case 'select': {
      const opts = getFieldOptions(field, formData);
      const parentNotChosenYet = !!field.dependsOnKey && !formData[field.dependsOnKey];
      return (
        <Select
          label={label}
          selectedKeys={value ? [value] : []}
          isDisabled={parentNotChosenYet}
          onSelectionChange={(keys) => { const v = Array.from(keys)[0]; if (v) onChange(String(v)); }}
        >
          {opts.map((opt) => <SelectItem key={opt}>{opt}</SelectItem>)}
        </Select>
      );
    }
    case 'checkbox':
      return <CheckboxCompat isSelected={!!value} onValueChange={onChange}>{field.label}</CheckboxCompat>;
    case 'phone':
      return <Input label={label} type="tel" value={value ?? ''} onValueChange={onChange} dir="ltr" />;
    default:
      return <Input label={label} value={value ?? ''} onValueChange={onChange} />;
  }
}
