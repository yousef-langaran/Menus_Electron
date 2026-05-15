import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Input } from './compat-input';
import type { MasterProduct } from '../services/api';

interface Props {
  value: string;
  onValueChange: (v: string) => void;
  onSelect: (product: MasterProduct) => void;
  suggestions: MasterProduct[];
  isDisabled?: boolean;
  autoFocus?: boolean;
  label?: string;
}

export function NameAutocomplete({
  value,
  onValueChange,
  onSelect,
  suggestions,
  isDisabled,
  autoFocus,
  label = 'نام فارسی',
}: Props) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const [hoveredId, setHoveredId] = useState<number | null>(null);
  // Portal into the nearest dialog (avoids React Aria blocking outside-dialog clicks)
  const [portalEl, setPortalEl] = useState<HTMLElement | null>(null);

  useEffect(() => {
    let el: HTMLElement | null = wrapperRef.current;
    while (el) {
      if (el.getAttribute('role') === 'dialog') {
        setPortalEl(el);
        return;
      }
      el = el.parentElement;
    }
    setPortalEl(document.body);
  }, []);

  const open = suggestions.length > 0 && rect !== null && portalEl !== null;

  useEffect(() => {
    if (suggestions.length === 0) {
      setRect(null);
      return;
    }
    setRect(wrapperRef.current?.getBoundingClientRect() ?? null);
  }, [suggestions]);

  useEffect(() => {
    if (!open) return;
    const handle = (e: PointerEvent) => {
      if (
        wrapperRef.current?.contains(e.target as Node) ||
        dropdownRef.current?.contains(e.target as Node)
      ) return;
      setRect(null);
    };
    document.addEventListener('pointerdown', handle);
    return () => document.removeEventListener('pointerdown', handle);
  }, [open]);

  return (
    <div ref={wrapperRef} className="w-full">
      <Input
        label={label}
        value={value}
        onValueChange={onValueChange}
        isDisabled={isDisabled}
        autoFocus={autoFocus}
      />

      {open &&
        createPortal(
          <div
            ref={dropdownRef}
            dir="rtl"
            style={{
              position: 'fixed',
              top: rect!.bottom + 4,
              right: window.innerWidth - rect!.right,
              width: rect!.width,
              zIndex: 99999,
              background: 'var(--color-overlay)',
              color: 'var(--color-overlay-foreground)',
              border: '1px solid var(--color-border)',
              borderRadius: '12px',
              boxShadow: '0 8px 32px rgba(0,0,0,0.18)',
              overflow: 'hidden',
              fontFamily: 'inherit',
            }}
          >
            <div style={{ maxHeight: '208px', overflowY: 'auto' }}>
              {suggestions.map((s, i) => (
                <div
                  key={s.id}
                  style={{
                    padding: '10px 16px',
                    cursor: 'pointer',
                    backgroundColor: hoveredId === s.id ? 'var(--color-surface-secondary)' : 'transparent',
                    borderBottom: i < suggestions.length - 1 ? '1px solid var(--color-border)' : 'none',
                    textAlign: 'right',
                    direction: 'rtl',
                    transition: 'background-color 100ms',
                    userSelect: 'none',
                  }}
                  onMouseEnter={() => setHoveredId(s.id)}
                  onMouseLeave={() => setHoveredId(null)}
                  onClick={() => {
                    onSelect(s);
                    setRect(null);
                  }}
                >
                  <div style={{ fontSize: '14px', fontWeight: 500, lineHeight: 1.4 }}>
                    {s.name}
                  </div>
                  {s.barcode && (
                    <div style={{ fontSize: '12px', color: 'var(--color-muted)', fontFamily: 'monospace', marginTop: '2px', direction: 'ltr', textAlign: 'left' }}>
                      {s.barcode}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>,
          portalEl!,
        )}
    </div>
  );
}
