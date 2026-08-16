import { Modal, ModalHeader, ModalBody, ModalFooter } from '@heroui/react';
import { Button } from '../ui/compat-button';
import { ModalShell } from '../ui/modal-shell';
import { useShortcutsHelpStore } from '../store/shortcutsHelpStore';
import { NAV_SHORTCUTS, OPERATION_SHORTCUTS } from '../constants/shortcuts';

function KeyChip({ keys }: { keys: string }) {
  return (
    <span className="inline-flex items-center rounded-md border border-default-300 bg-default-100 px-2 py-0.5 text-xs font-mono font-medium text-default-700 whitespace-nowrap">
      {keys}
    </span>
  );
}

/** راهنمای سراسری میانبرهای کیبورد — با F1 باز/بسته می‌شود؛ همچنین از منوی «سیستم» قابل‌دسترس است */
export function ShortcutsHelpModal() {
  const isOpen = useShortcutsHelpStore((s) => s.isOpen);
  const close = useShortcutsHelpStore((s) => s.close);

  return (
    <Modal isOpen={isOpen} onOpenChange={(open) => { if (!open) close(); }}>
      <ModalShell size="lg" scrollBehavior="inside">
        <ModalHeader className="flex flex-col gap-1 text-right">
          راهنمای میانبرهای کیبورد
        </ModalHeader>
        <ModalBody className="gap-6">
          <section>
            <h3 className="text-sm font-bold text-default-600 mb-2">رفتن به صفحات</h3>
            <div className="flex flex-col gap-1.5">
              {NAV_SHORTCUTS.map((s) => (
                <div key={s.keys} className="flex items-center justify-between gap-3 py-1 border-b border-default-100 last:border-0">
                  <span className="text-sm text-foreground">{s.label}</span>
                  <KeyChip keys={s.keys} />
                </div>
              ))}
            </div>
          </section>

          <section>
            <h3 className="text-sm font-bold text-default-600 mb-2">عملیات پرکاربرد</h3>
            <div className="flex flex-col gap-1.5">
              {OPERATION_SHORTCUTS.map((s, i) => (
                <div key={`${s.keys}-${i}`} className="flex items-center justify-between gap-3 py-1 border-b border-default-100 last:border-0">
                  <span className="text-sm text-foreground">
                    {s.label}
                    <span className="block text-xs text-default-400">{s.scope}</span>
                  </span>
                  <KeyChip keys={s.keys} />
                </div>
              ))}
            </div>
          </section>
        </ModalBody>
        <ModalFooter className="gap-2">
          <Button variant="flat" onPress={close}>بستن</Button>
        </ModalFooter>
      </ModalShell>
    </Modal>
  );
}
