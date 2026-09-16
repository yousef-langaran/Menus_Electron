import { Modal } from '@heroui/react';
import type { ReactNode } from 'react';

const SIZE_MAP: Record<string, 'xs' | 'sm' | 'md' | 'lg' | 'full' | 'cover'> = {
  xs: 'xs',
  sm: 'sm',
  md: 'md',
  lg: 'lg',
  xl: 'lg',
  '2xl': 'lg',
  '3xl': 'full',
  '4xl': 'full',
  full: 'full',
};

export type ModalShellProps = {
  size?: keyof typeof SIZE_MAP | (string & {});
  scrollBehavior?: 'inside' | 'outside';
  /** برای عرض/ارتفاع سفارشی فراتر از پله‌های `size` — مثلاً `max-w-5xl max-h-[85vh]` (کلاس‌های Tailwind روی خودِ dialog اعمال می‌شوند و چون بعد از کلاس‌های اندازهٔ پیش‌فرض ادغام می‌شوند، آن‌ها را override می‌کنند) */
  dialogClassName?: string;
  children: ReactNode;
};

/** جایگزین `ModalContent` نسخهٔ ۲: Backdrop → Container → Dialog */
export function ModalShell({ size = 'md', scrollBehavior = 'inside', dialogClassName, children }: ModalShellProps) {
  const mapped = SIZE_MAP[String(size)] ?? 'md';
  return (
    <Modal.Backdrop>
      <Modal.Container size={mapped} scroll={scrollBehavior === 'outside' ? 'outside' : 'inside'}>
        <Modal.Dialog className={dialogClassName}>{children}</Modal.Dialog>
      </Modal.Container>
    </Modal.Backdrop>
  );
}
