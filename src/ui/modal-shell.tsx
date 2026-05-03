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
  children: ReactNode;
};

/** جایگزین `ModalContent` نسخهٔ ۲: Backdrop → Container → Dialog */
export function ModalShell({ size = 'md', scrollBehavior = 'inside', children }: ModalShellProps) {
  const mapped = SIZE_MAP[String(size)] ?? 'md';
  return (
    <Modal.Backdrop>
      <Modal.Container size={mapped} scroll={scrollBehavior === 'outside' ? 'outside' : 'inside'}>
        <Modal.Dialog>{children}</Modal.Dialog>
      </Modal.Container>
    </Modal.Backdrop>
  );
}
