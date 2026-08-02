import { Dropdown } from '@heroui/react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Select, SelectItem } from '../compat-select';

// HeroUI/React Aria پورتال‌ها (منوی ناوبار، Popover ِ Select و ...) را بیرون از #root
// رندر می‌کند و صفت dir را از لوکیل می‌گیرد، نه از CSS. پس اگر لوکیل اپ fa نباشد،
// این پورتال‌ها LTR می‌شوند — همان باگی که main.ts با سوییچ `lang=fa-IR` رفعش می‌کند.
describe('RTL overlays', () => {
  it('runs under the same locale the Electron shell forces', () => {
    expect(navigator.language).toBe('fa');
  });

  it('renders the navbar dropdown popover RTL', () => {
    render(
      <Dropdown.Root>
        <Dropdown.Trigger>سیستم</Dropdown.Trigger>
        <Dropdown.Popover>
          <Dropdown.Menu aria-label="سیستم">
            <Dropdown.Item id="/settings">تنظیمات</Dropdown.Item>
          </Dropdown.Menu>
        </Dropdown.Popover>
      </Dropdown.Root>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'سیستم' }));

    const popover = document.querySelector('[data-slot="dropdown-popover"], [role="dialog"]');
    expect(popover).not.toBeNull();
    expect(popover).toHaveAttribute('dir', 'rtl');
  });

  it('renders the select popover and list RTL', () => {
    render(
      <Select label="نوع اتصال" selectedKeys={['serial']} onSelectionChange={() => {}}>
        <SelectItem key="serial">سریال / USB</SelectItem>
        <SelectItem key="tcp">شبکه</SelectItem>
      </Select>,
    );

    fireEvent.click(screen.getByRole('button'));

    expect(document.querySelector('[data-slot="select-popover"]')).toHaveAttribute('dir', 'rtl');
    expect(document.querySelector('[data-slot="list-box"]')).toHaveAttribute('dir', 'rtl');
  });
});
