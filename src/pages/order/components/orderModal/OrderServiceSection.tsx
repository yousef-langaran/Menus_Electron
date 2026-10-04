import type { OrderModalState } from './shared';
import type { User } from '../../../../store/authStore';
import type { PosTable } from '../../../../services/api';
import { Truck, ShoppingBag, UserRound } from 'lucide-react';
import { Input } from '../../../../ui/compat-input';
import { Textarea } from '../../../../ui/compat-textarea';
import { CheckboxCompat as Checkbox } from '../../../../ui/compat-checkbox';
import { DeliveryDestination } from '../DeliveryDestination';

export interface OrderServiceSectionProps {
  serviceType: 'dine_in' | 'takeaway' | 'delivery';
  setServiceType: (type: 'dine_in' | 'takeaway' | 'delivery') => void;
  setTableNumber: (table: string) => void;
  setCustomerAddress: (address: string) => void;
  setDeliveryLocation: (location: { lat: number; lng: number } | null) => void;
  setDeliveryFeeOverride: (fee: number | null) => void;
  setDeliveryFeeReason: (reason: string) => void;
  set: (patch: Partial<OrderModalState>) => void;
  user: User | null;
  token: string | null;
  customerPhone: string;
  finalAmt: number;
  state: OrderModalState;
  customerAddress: string;
  deliveryLocation: { lat: number; lng: number } | null;
  deliveryFeeOverride: number | null;
  selectableTables: PosTable[];
  tableId: number | null;
  setTable: (table: { id: number; name: string } | null) => void;
  tableNumber: string;
}

export function OrderServiceSection({
  serviceType,
  setServiceType,
  setTableNumber,
  setCustomerAddress,
  setDeliveryLocation,
  setDeliveryFeeOverride,
  setDeliveryFeeReason,
  set,
  user,
  token,
  customerPhone,
  finalAmt,
  state,
  customerAddress,
  deliveryLocation,
  deliveryFeeOverride,
  selectableTables,
  tableId,
  setTable,
  tableNumber,
}: OrderServiceSectionProps) {
  return (
    <>
      {/* Service type */}
      <div className="flex flex-col gap-1.5">
        <span className="text-sm font-medium text-foreground">نوع سفارش</span>
        <div className="grid grid-cols-3 gap-2">
          {(
            [
              { key: 'delivery', label: 'ارسال', icon: Truck },
              { key: 'takeaway', label: 'بیرون‌بر', icon: ShoppingBag },
              { key: 'dine_in', label: 'حضوری', icon: UserRound },
            ] as const
          ).map(({ key, label, icon: Icon }) => {
            const isActive = serviceType === key;
            return (
              <button
                key={key}
                type="button"
                onClick={() => {
                  setServiceType(key);
                  setTableNumber('');
                  setCustomerAddress('');
                  setDeliveryLocation(null);
                  setDeliveryFeeOverride(null);
                  setDeliveryFeeReason('');
                  set({ customerAddresses: [], selectedAddressId: null });
                }}
                aria-pressed={isActive}
                className={[
                  'flex flex-col items-center justify-center gap-1 rounded-xl border py-2.5 text-xs font-semibold transition',
                  isActive
                    ? 'border-accent bg-accent text-accent-foreground shadow-sm'
                    : 'border-border bg-surface text-foreground/80 hover:border-accent/50 hover:bg-default-soft',
                ].join(' ')}
              >
                <Icon className="h-5 w-5" aria-hidden />
                {label}
              </button>
            );
          })}
        </div>
      </div>

      {serviceType === 'delivery' && (
        <DeliveryDestination
          restaurantId={user?.restaurants?.[0]?.id}
          token={token}
          customerPhone={customerPhone}
          cartSubtotal={finalAmt}
          savedAddresses={state.customerAddresses}
          address={customerAddress}
          onAddressChange={setCustomerAddress}
          location={deliveryLocation}
          onLocationChange={setDeliveryLocation}
          feeOverride={deliveryFeeOverride}
          onFeeOverrideChange={(fee, reason) => {
            setDeliveryFeeOverride(fee);
            setDeliveryFeeReason(reason);
          }}
        />
      )}

      {serviceType === 'dine_in' ? (
        selectableTables.length > 0 ? (
          <div className="flex flex-col gap-2">
            <span className="text-sm font-medium text-foreground">میز</span>
            <div className="grid grid-cols-4 gap-2 max-h-48 overflow-y-auto">
              {selectableTables.map((table) => {
                const selected = tableId === table.id;
                const occupied = table.status === 'occupied';
                return (
                  <button
                    key={table.id}
                    type="button"
                    onClick={() => setTable(selected ? null : { id: table.id, name: table.name })}
                    aria-pressed={selected}
                    className={`rounded-lg border px-2 py-2 text-sm transition-colors ${
                      selected
                        ? 'border-accent bg-accent/10 font-semibold'
                        : occupied
                          ? 'border-danger/40 bg-danger/5'
                          : 'border-border hover:border-border-secondary'
                    }`}
                  >
                    <span className="block truncate">{table.name}</span>
                    <span className="block text-[10px] text-muted">
                      {occupied
                        ? 'اشغال'
                        : table.status === 'reserved'
                          ? 'رزرو'
                          : `${table.capacity} نفره`}
                    </span>
                  </button>
                );
              })}
            </div>
            <span className="text-xs text-muted">
              انتخاب میز اختیاری است؛ میز اشغال هم برای سفارش تکمیلی قابل انتخاب است.
            </span>
          </div>
        ) : (
          <Input
            label="شماره میز (اختیاری)"
            placeholder="A12"
            value={tableNumber}
            onValueChange={setTableNumber}
            variant="bordered"
            classNames={{ input: 'text-right' }}
          />
        )
      ) : serviceType === 'takeaway' ? (
        <div className="flex flex-col gap-2">
          <span className="text-sm font-medium text-foreground">آدرس</span>
          {state.loadingAddresses && (
            <p className="text-muted text-sm">در حال بارگذاری آدرس‌ها...</p>
          )}
          {!state.loadingAddresses && state.customerAddresses.length > 0 && (
            <div className="flex flex-col gap-2">
              {state.customerAddresses.map((addr) => (
                <Checkbox
                  key={addr.id}
                  isSelected={state.selectedAddressId === addr.id}
                  onValueChange={() => {
                    set({ selectedAddressId: addr.id });
                    setCustomerAddress(addr.address);
                  }}
                >
                  <span className="text-sm">
                    {addr.label ? `${addr.label}: ` : ''}
                    {addr.address}
                  </span>
                </Checkbox>
              ))}
              <Checkbox
                isSelected={state.selectedAddressId === 'new'}
                onValueChange={() => {
                  set({ selectedAddressId: 'new' });
                  setCustomerAddress('');
                }}
              >
                آدرس جدید
              </Checkbox>
            </div>
          )}
          {(state.selectedAddressId === 'new' || state.customerAddresses.length === 0) && (
            <Textarea
              placeholder="آدرس تحویل"
              value={customerAddress}
              onValueChange={(v) => {
                setCustomerAddress(v);
                if (state.customerAddresses.length > 0) set({ selectedAddressId: 'new' });
              }}
              minRows={2}
              variant="bordered"
              classNames={{ input: 'text-right' }}
            />
          )}
        </div>
      ) : null}
    </>
  );
}
