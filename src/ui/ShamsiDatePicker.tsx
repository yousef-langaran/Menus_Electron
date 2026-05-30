import { Calendar, DateField, DatePicker, Label } from '@heroui/react';
import { parseDate } from '@internationalized/date';
import type { DateValue } from '@internationalized/date';
import { I18nProvider } from 'react-aria-components';

interface ShamsiDatePickerProps {
  label: string;
  value: string;           // ISO YYYY-MM-DD (or empty)
  onChange: (iso: string) => void;
  isRequired?: boolean;
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
  try { return parseDate(iso); } catch { return null; }
}

export function ShamsiDatePicker({
  label,
  value,
  onChange,
  isRequired,
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
      >
        <Label className="text-sm font-medium text-foreground-700 mb-1 block">
          {label}
        </Label>

        {/* ─── Input Field ─── */}
        <DateField.Group
          fullWidth
          className="flex items-center w-full rounded-xl bg-default-100 hover:bg-default-200 transition-colors px-3 gap-1 data-[focus-within]:bg-default-100 data-[focus-within]:outline-2 data-[focus-within]:outline-primary/50 data-[focus-within]:outline"
          style={{
            minHeight: size === 'lg' ? '56px' : size === 'sm' ? '36px' : '44px',
            direction: 'ltr',
          }}
        >
          <DateField.Input size={size} className="flex-1 bg-transparent text-sm py-0" dir="ltr">
            {(segment) => (
              <DateField.Segment
                segment={segment}
                className="rounded px-0.5 focus:bg-primary/10 focus:outline-none"
              />
            )}
          </DateField.Input>
          <DateField.Suffix className="flex items-center shrink-0">
            <DatePicker.Trigger className="flex items-center justify-center w-8 h-8 rounded-lg hover:bg-default-300 transition-colors text-default-500 cursor-pointer">
              <DatePicker.TriggerIndicator />
            </DatePicker.Trigger>
          </DateField.Suffix>
        </DateField.Group>

        {/* ─── Calendar Popover ─── */}
        <DatePicker.Popover className="z-[200] rounded-2xl shadow-xl border border-default-200 bg-background p-0 overflow-hidden">
          <Calendar
            aria-label={label}
            className="w-[300px] p-4"
          >
            {/* Header: month/year + nav */}
            <Calendar.Header className="flex items-center justify-between mb-3">
              <Calendar.NavButton
                slot="previous"
                className="flex items-center justify-center w-8 h-8 rounded-lg hover:bg-default-100 transition-colors text-default-600 cursor-pointer"
              />
              <Calendar.YearPickerTrigger className="flex items-center gap-1 px-3 py-1 rounded-lg hover:bg-default-100 transition-colors cursor-pointer">
                <Calendar.YearPickerTriggerHeading className="text-sm font-bold text-foreground" />
                <Calendar.YearPickerTriggerIndicator className="text-default-500 text-xs" />
              </Calendar.YearPickerTrigger>
              <Calendar.NavButton
                slot="next"
                className="flex items-center justify-center w-8 h-8 rounded-lg hover:bg-default-100 transition-colors text-default-600 cursor-pointer"
              />
            </Calendar.Header>

            {/* Day grid */}
            <Calendar.Grid className="w-full border-collapse">
              <Calendar.GridHeader>
                {(day) => (
                  <Calendar.HeaderCell className="text-xs font-semibold text-default-400 text-center w-9 h-8 pb-1">
                    {DAY_ABBR[day] ?? day}
                  </Calendar.HeaderCell>
                )}
              </Calendar.GridHeader>
              <Calendar.GridBody>
                {(date) => (
                  <Calendar.Cell
                    date={date}
                    className="w-9 h-9 rounded-lg text-sm text-center cursor-pointer transition-colors
                      hover:bg-default-100
                      data-[selected=true]:bg-primary data-[selected=true]:text-primary-foreground data-[selected=true]:font-semibold
                      data-[today=true]:font-bold data-[today=true]:text-primary
                      data-[outside-month=true]:text-default-300
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
                    className="px-2 py-1 rounded-lg text-sm text-center cursor-pointer hover:bg-default-100 transition-colors
                      data-[selected=true]:bg-primary data-[selected=true]:text-primary-foreground data-[selected=true]:font-semibold"
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
