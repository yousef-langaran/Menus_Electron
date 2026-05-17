import { toast as herouiToast } from '@heroui/react';

export interface ToastOptions {
  description?: string;
}

export const toast = {
  success: (message: string, options?: ToastOptions) => herouiToast.success(message, options),
  error:   (message: string, options?: ToastOptions) => herouiToast.danger(message, options),
  info:    (message: string, options?: ToastOptions) => herouiToast.info(message, options),
  warning: (message: string, options?: ToastOptions) => herouiToast.warning(message, options),
};
