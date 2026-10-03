import { Modal as HeroModal } from '@heroui/react';
import type { ComponentProps, ElementType, ReactNode } from 'react';

type ModalRootProps = ComponentProps<typeof HeroModal>;

export type CompatModalProps = Omit<ModalRootProps, 'children'> & {
  children?: ReactNode;
  /**
   * API قدیمی v2: در v3 فقط `onOpenChange` به ریشهٔ Modal وصل است؛ بدون این پل،
   * بستن با Esc/بک‌دراپ هرگز `onClose` را صدا نمی‌زد.
   */
  onClose?: () => void;
  /** پراپ‌های قدیمی v2 روی ریشه معنا ندارند (اندازه را `ModalShell` تعیین می‌کند) و نادیده گرفته می‌شوند */
  size?: string;
  className?: string;
  classNames?: Record<string, string | undefined>;
  backdrop?: string;
  placement?: string;
  scrollBehavior?: string;
  hideCloseButton?: boolean;
  isDismissable?: boolean;
  isKeyboardDismissDisabled?: boolean;
};

function CompatModal({
  onClose,
  onOpenChange,
  size: _size,
  className: _className,
  classNames: _classNames,
  backdrop: _backdrop,
  placement: _placement,
  scrollBehavior: _scrollBehavior,
  hideCloseButton: _hideCloseButton,
  isDismissable,
  isKeyboardDismissDisabled,
  children,
  ...props
}: CompatModalProps) {
  const Root = HeroModal as unknown as ElementType;
  return (
    <Root
      {...props}
      isDismissable={isDismissable}
      isKeyboardDismissDisabled={isKeyboardDismissDisabled}
      onOpenChange={(open: boolean) => {
        onOpenChange?.(open);
        if (!open) onClose?.();
      }}
    >
      {children}
    </Root>
  );
}

/** مثل `Modal` نسخهٔ v3 (با زیرکامپوننت‌های Backdrop/Container/Dialog) + پل `onClose` */
export const Modal = Object.assign(CompatModal, HeroModal);
