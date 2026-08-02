import { fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { CheckboxCompat } from '../compat-checkbox';
import { SwitchCompat } from '../compat-switch';

// HeroUI v3 renders the interactive element inside `.Content`; a wrapper that puts
// the control outside it (or omits Content when there is no label) renders nothing
// clickable at all. These tests pin that structure down.
describe('SwitchCompat', () => {
  it('exposes a switch role and toggles when clicked', () => {
    const onValueChange = vi.fn();
    render(
      <SwitchCompat isSelected={false} onValueChange={onValueChange}>
        حالت تاریک
      </SwitchCompat>,
    );

    const control = screen.getByRole('switch');
    expect(control).not.toBeChecked();

    fireEvent.click(control);
    expect(onValueChange).toHaveBeenCalledWith(true);
  });

  it('stays interactive without a label', () => {
    const onValueChange = vi.fn();
    render(<SwitchCompat isSelected aria-label="فعال‌سازی کارتخوان" onValueChange={onValueChange} />);

    const control = screen.getByRole('switch', { name: 'فعال‌سازی کارتخوان' });
    expect(control).toBeChecked();

    fireEvent.click(control);
    expect(onValueChange).toHaveBeenCalledWith(false);
  });

  it('reflects controlled state changes', () => {
    function Harness() {
      const [isSelected, setIsSelected] = useState(false);
      return (
        <SwitchCompat isSelected={isSelected} onValueChange={setIsSelected}>
          پخش صدا
        </SwitchCompat>
      );
    }

    render(<Harness />);
    const control = screen.getByRole('switch');

    fireEvent.click(control);
    expect(control).toBeChecked();

    fireEvent.click(control);
    expect(control).not.toBeChecked();
  });
});

describe('CheckboxCompat', () => {
  it('exposes a checkbox role and toggles when clicked', () => {
    const onValueChange = vi.fn();
    render(
      <CheckboxCompat isSelected={false} onValueChange={onValueChange}>
        رسید کامل
      </CheckboxCompat>,
    );

    const control = screen.getByRole('checkbox', { name: 'رسید کامل' });
    expect(control).not.toBeChecked();

    fireEvent.click(control);
    expect(onValueChange).toHaveBeenCalledWith(true);
  });

  it('renders the label inside the clickable content and applies classNames.label', () => {
    render(
      <CheckboxCompat isSelected={false} classNames={{ label: 'font-semibold' }}>
        چاپگر آشپزخانه
      </CheckboxCompat>,
    );

    const label = screen.getByText('چاپگر آشپزخانه');
    expect(label).toHaveClass('font-semibold');

    // The label text and the input must share the same clickable content element,
    // otherwise clicking the text does not toggle the box.
    const content = label.closest('[data-slot="checkbox-content"]');
    expect(content).not.toBeNull();
    expect(content).toContainElement(screen.getByRole('checkbox'));
  });

  it('stays interactive without a label', () => {
    const onValueChange = vi.fn();
    render(<CheckboxCompat isSelected aria-label="انتخاب چاپگر" onValueChange={onValueChange} />);

    fireEvent.click(screen.getByRole('checkbox', { name: 'انتخاب چاپگر' }));
    expect(onValueChange).toHaveBeenCalledWith(false);
  });
});
