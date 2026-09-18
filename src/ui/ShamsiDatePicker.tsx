import { Calendar, DateField, DatePicker, Label } from '@heroui/react';
import { parseDate } from '@internationalized/date';
import type { DateValue } from '@internationalized/date';
import { I18nProvider } from 'react-aria-components';

interface ShamsiDatePickerProps {
  label: string;
  value: string;           // ISO YYYY-MM-DD (or empty)
  onChange: (iso: string) => void;
  isRequired?: boolean;
  isReadOnly?: boolean;
  className?: string;
  size?: 'sm' | 'md' | 'lg';
}

const DAY_ABBR: Record<string, string> = {
  'شنبه': 'ش',
  'یکشنبه': 'ی',
  'دوشنبه': 'د',
  'سه‌شنبه': 'س',
  'چهارشنبه': 'چ',
  'پنجشنبه': 'پ',
  'جمعه': 'ج',
};

function toCalendarDate(iso: string): DateValue | null {
  if (!iso) return null;
  // مقدار ممکن است از سرور به‌صورت تایم‌استمپ کامل بیاید
  // (مثل 2026-06-05T00:00:00.000Z)؛ parseDate فقط YYYY-MM-DD می‌پذیرد.
  const datePart = iso.slice(0, 10);
  try { return parseDate(datePart); } catch { return null; }
}

export function ShamsiDatePicker({
  label,
  value,
  onChange,
  isRequired,
  isReadOnly,
  className,
  size = 'md',
}: ShamsiDatePickerProps) {
  return (
    <I18nProvider locale="fa-IR-u-ca-persian">
      <DatePicker
        className={['w-full', className].filter(Boolean).join(' ')}
        value={toCalendarDate(value)}
        onChange={(d) => onChange(d ? d.toString() : '')}
        isRequired={isRequired}
        isReadOnly={isReadOnly}
      >
        <Label className="text-sm font-medium text-foreground-700 mb-1 block">
          {label}
        </Label>

        {/* ─── Input Field ─── */}
        <DateField.Group
          fullWidth
          className="flex items-center w-full rounded-xl bg-default-soft hover:bg-default transition-colors px-3 gap-1 data-[focus-within]:bg-default-soft data-[focus-within]:outline-2 data-[focus-within]:outline-accent/50 data-[focus-within]:outline"
          style={{
            minHeight: size === 'lg' ? '56px' : size === 'sm' ? '36px' : '44px',
            direction: 'ltr',
          }}
        >
          <DateField.Input size={size} className="flex-1 bg-transparent text-sm py-0" dir="ltr">
            {(segment) => (
              <DateField.Segment
                segment={segment}
                className="rounded px-0.5 focus:bg-accent/10 focus:outline-none"
              />
            )}
          </DateField.Input>
          <DateField.Suffix className="flex items-center shrink-0">
            <DatePicker.Trigger className="flex items-center justify-center w-8 h-8 rounded-lg hover:bg-default transition-colors text-muted cursor-pointer">
              <DatePicker.TriggerIndicator />
            </DatePicker.Trigger>
          </DateField.Suffix>
        </DateField.Group>

        {/* ─── Calendar Popover ─── */}
        <DatePicker.Popover className="z-[9999] rounded-2xl shadow-xl border border-border bg-background p-0 overflow-hidden">
          <Calendar
            aria-label={label}
            className="w-[300px] p-4"
          >
            {/* Header: swap slots so RTL flex renders › (next) on RIGHT and ‹ (previous) on LEFT */}
            <Calendar.Header className="flex items-center justify-between mb-3">
              <Calendar.NavButton
                slot="next"
                className="flex items-center justify-center w-8 h-8 rounded-lg hover:bg-default-soft transition-colors text-foreground/70 cursor-pointer"
              />
              <Calendar.YearPickerTrigger className="flex items-center gap-1 px-3 py-1 rounded-lg hover:bg-default-soft transition-colors cursor-pointer">
                <Calendar.YearPickerTriggerHeading className="text-sm font-bold text-foreground" />
                <Calendar.YearPickerTriggerIndicator className="text-muted text-xs" />
              </Calendar.YearPickerTrigger>
              <Calendar.NavButton
                slot="previous"
                className="flex items-center justify-center w-8 h-8 rounded-lg hover:bg-default-soft transition-colors text-foreground/70 cursor-pointer"
              />
            </Calendar.Header>

            {/* Day grid */}
            <Calendar.Grid className="w-full border-collapse">
              <Calendar.GridHeader>
                {(day) => (
                  <Calendar.HeaderCell className="text-xs font-semibold text-muted text-center w-9 h-8 pb-1">
                    {DAY_ABBR[day] ?? day}
                  </Calendar.HeaderCell>
                )}
              </Calendar.GridHeader>
              <Calendar.GridBody>
                {(date) => (
                  <Calendar.Cell
                    date={date}
                    className="w-9 h-9 rounded-lg text-sm text-center cursor-pointer transition-colors
                      hover:bg-default-soft
                      data-[selected=true]:bg-accent data-[selected=true]:text-accent-foreground data-[selected=true]:font-semibold
                      data-[today=true]:font-bold data-[today=true]:text-accent
                      data-[outside-month=true]:text-muted
                      data-[disabled=true]:opacity-40 data-[disabled=true]:cursor-not-allowed"
                  />
                )}
              </Calendar.GridBody>
            </Calendar.Grid>

            {/* Year picker overlay */}
            <Calendar.YearPickerGrid className="mt-2">
              <Calendar.YearPickerGridBody>
                {({ year }) => (
                  <Calendar.YearPickerCell
                    year={year}
                    className="px-2 py-1 rounded-lg text-sm text-center cursor-pointer hover:bg-default-soft transition-colors
                      data-[selected=true]:bg-accent data-[selected=true]:text-accent-foreground data-[selected=true]:font-semibold"
                  />
                )}
              </Calendar.YearPickerGridBody>
            </Calendar.YearPickerGrid>
          </Calendar>
        </DatePicker.Popover>
      </DatePicker>
    </I18nProvider>
  );
}
