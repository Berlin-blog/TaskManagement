import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { cn } from '../lib/utils';
import { Icon, type IconName } from './icons';

export interface MenuItem {
  label: string;
  icon?: IconName;
  onClick: () => void;
  danger?: boolean;
  disabled?: boolean;
  hint?: string;
}

interface Props {
  items?: MenuItem[];
  children?: ReactNode;
  label?: string;
  trigger?: ReactNode;
  align?: 'start' | 'end';
  className?: string;
  buttonClassName?: string;
  closeOnClick?: boolean;
}

/** 通用更多菜单：固定定位到 body，避免被表格/卡片的 overflow 裁切 */
export function MoreMenu({
  items = [],
  children,
  label = '更多操作',
  trigger,
  align = 'end',
  className,
  buttonClassName,
  closeOnClick = true,
}: Props) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<() => void>(() => {});
  const id = useId();

  const place = () => {
    const el = triggerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const width = menuRef.current?.offsetWidth || 216;
    const height = menuRef.current?.offsetHeight || 260;
    let left = align === 'end' ? rect.right - width : rect.left;
    left = Math.max(8, Math.min(left, window.innerWidth - width - 8));
    let top = rect.bottom + 6;
    if (top + height > window.innerHeight - 8) {
      top = Math.max(8, rect.top - height - 6);
    }
    setPos({ top, left });
  };

  const close = () => setOpen(false);
  closeRef.current = close;

  useEffect(() => {
    if (!open) return;
    const raf = window.requestAnimationFrame(() => {
      place();
      menuRef.current?.querySelector<HTMLElement>('[role="menuitem"], button, select, input')?.focus();
    });
    const onPointerDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (triggerRef.current?.contains(target) || menuRef.current?.contains(target)) return;
      closeRef.current();
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        closeRef.current();
        triggerRef.current?.focus();
      }
    };
    const onScroll = () => closeRef.current();
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', onScroll);
    return () => {
      window.cancelAnimationFrame(raf);
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onScroll);
    };
  }, [open]);

  const renderItem = (item: MenuItem) => (
    <button
      key={item.label}
      role="menuitem"
      type="button"
      disabled={item.disabled}
      title={item.hint}
      onClick={() => {
        if (item.disabled) return;
        if (closeOnClick) close();
        item.onClick();
      }}
      className={cn(
        'flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-[13px] transition',
        item.danger ? 'text-rose-600 hover:bg-rose-50' : 'text-slate-700 hover:bg-slate-100',
        item.disabled && 'cursor-not-allowed opacity-40',
      )}
    >
      {item.icon && <Icon name={item.icon} className="h-4 w-4 shrink-0 opacity-70" />}
      <span className="min-w-0 flex-1">{item.label}</span>
      {item.hint && <span className="shrink-0 text-[11px] text-slate-500">{item.hint}</span>}
    </button>
  );

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        className={cn(
          'inline-flex h-8 min-w-8 items-center justify-center rounded-lg text-slate-500 transition hover:bg-slate-100 hover:text-slate-700',
          open && 'bg-slate-100 text-slate-700',
          buttonClassName,
        )}
      >
        {trigger ?? <Icon name="more" className="h-5 w-5" />}
      </button>
      {open && createPortal(
        <div
          ref={menuRef}
          id={id}
          role="menu"
          aria-label={label}
          style={{ top: pos.top, left: pos.left, width: 224 }}
          className={cn(
            'fixed z-[120] max-h-[min(70vh,420px)] overflow-y-auto rounded-xl border border-slate-100 bg-white p-1.5 shadow-xl',
            className,
          )}
          onClick={(e) => e.stopPropagation()}
          onKeyDown={(e) => {
            if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(e.key)) return;
            const nodes = Array.from(menuRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]:not([disabled])') ?? []);
            if (nodes.length === 0) return;
            e.preventDefault();
            const current = nodes.indexOf(document.activeElement as HTMLElement);
            const next = e.key === 'Home'
              ? 0
              : e.key === 'End'
                ? nodes.length - 1
                : e.key === 'ArrowDown'
                  ? (current + 1 + nodes.length) % nodes.length
                  : (current - 1 + nodes.length) % nodes.length;
            nodes[next]?.focus();
          }}
        >
          {children ?? items.map(renderItem)}
        </div>,
        document.body,
      )}
    </>
  );
}
