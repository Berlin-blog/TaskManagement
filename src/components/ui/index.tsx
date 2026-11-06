import type { ReactNode } from 'react';
import { useState, useEffect, useRef } from 'react';
import { cn } from '../../lib/utils';

export function Card({ className, children }: { className?: string; children: ReactNode }) {
  const hasPadding = (className ?? '').split(/\s+/).some((c) => /^p[xytblr]?-/.test(c));
  return <div className={cn('card', !hasPadding && 'p-5', className)}>{children}</div>;
}

export function CardTitle({ children, className }: { children: ReactNode; className?: string }) {
  return <h3 className={cn('mb-3 text-sm font-semibold text-slate-800', className)}>{children}</h3>;
}

/**
 * 页面标题 + 当前范围 + 主操作
 * 标题回答「我在哪」，scope 回答「当前看的是哪批数据」，actions 只保留一个主操作。
 */
export function PageHeader({
  title,
  subtitle,
  meta,
  scope,
  actions,
  className,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  meta?: ReactNode;
  /** 当前范围，例如周、月份、筛选结果数 */
  scope?: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <header className={cn('page-header', className)}>
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="page-title">{title}</h1>
          {meta}
        </div>
        {subtitle && <div className="page-subtitle mt-1.5 max-w-3xl">{subtitle}</div>}
        {scope && <div className="scope-row mt-3">{scope}</div>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2 sm:justify-end">{actions}</div>}
    </header>
  );
}

/** 分区标题，用于“概览 / 分析”等页面层级 */
export function SectionTitle({
  title,
  subtitle,
  action,
  className,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex items-end justify-between gap-3', className)}>
      <div>
        <h2 className="section-heading">{title}</h2>
        {subtitle && <p className="section-caption">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

/** 分段切换：用于密度、视图、状态等轻量切换 */
export function Segmented<T extends string>({
  value,
  options,
  onChange,
  ariaLabel,
  className,
}: {
  value: T;
  options: { value: T; label: ReactNode; count?: number }[];
  onChange: (value: T) => void;
  ariaLabel: string;
  className?: string;
}) {
  return (
    <div className={cn('inline-flex items-center gap-0.5 rounded-lg bg-slate-100 p-0.5', className)} role="group" aria-label={ariaLabel}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          aria-pressed={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            'inline-flex min-h-7 items-center gap-1 rounded-md px-2.5 text-xs font-medium transition',
            value === o.value ? 'bg-white text-slate-800 shadow-soft' : 'text-slate-500 hover:text-slate-700',
          )}
        >
          {o.label}
          {o.count !== undefined && (
            <span className={cn(
              'rounded-full px-1 text-[10px] tabular-nums',
              value === o.value ? 'bg-slate-100 text-slate-500' : 'text-slate-400',
            )}>
              {o.count}
            </span>
          )}
        </button>
      ))}
    </div>
  );
}

export function ProgressBar({
  value,
  className,
  barClassName,
  label,
}: {
  value: number;
  className?: string;
  barClassName?: string;
  label?: string;
}) {
  const safe = Math.max(0, Math.min(100, value));
  return (
    <div
      className={cn('h-2 w-full overflow-hidden rounded-full bg-slate-100', className)}
      role="progressbar"
      aria-valuenow={safe}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={label ?? '进度'}
    >
      <div
        className={cn('h-full rounded-full bg-brand-600 transition-all duration-500', barClassName)}
        style={{ width: `${safe}%` }}
      />
    </div>
  );
}

export function Button({
  variant = 'outline',
  className,
  children,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'ghost' | 'outline' | 'danger' }) {
  const map = { primary: 'btn-primary', ghost: 'btn-ghost', outline: 'btn-outline', danger: 'btn-danger' };
  return (
    <button type={props.type ?? 'button'} className={cn(map[variant], className)} {...props}>
      {children}
    </button>
  );
}

export function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={cn('input', props.className)} />;
}

export function Select({ children, className, ...props }: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select {...props} className={cn('select', className)} style={{ backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%2364748b' stroke-width='2'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E\")", backgroundPosition: 'right 0.6rem center', ...props.style }}>
      {children}
    </select>
  );
}

export function Badge({ className, children, ...props }: React.HTMLAttributes<HTMLSpanElement> & { className?: string; children: ReactNode }) {
  return <span {...props} className={cn('badge whitespace-nowrap', className)}>{children}</span>;
}

export function EmptyState({
  title,
  hint,
  action,
  icon,
}: {
  title: string;
  hint?: string;
  action?: ReactNode;
  icon?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center px-5 py-14 text-center">
      <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl border border-slate-200/70 bg-slate-50 text-xl text-slate-500">
        {icon ?? '📋'}
      </div>
      <p className="text-sm font-semibold text-slate-700">{title}</p>
      {hint && <p className="mt-1.5 max-w-sm text-xs leading-relaxed text-slate-500">{hint}</p>}
      {action && <div className="mt-5 flex flex-wrap justify-center gap-2">{action}</div>}
    </div>
  );
}

/** 加载占位：替换“加载中…”纯文字，减少布局跳动 */
export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('skeleton-shimmer animate-pulse rounded-lg bg-slate-100', className)} />;
}

export function PageSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div className="space-y-4" aria-label="加载中">
      <div className="space-y-2">
        <Skeleton className="h-6 w-40" />
        <Skeleton className="h-3.5 w-64" />
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="card p-4"><Skeleton className="h-3 w-16" /><Skeleton className="mt-2 h-7 w-20" /></div>
        ))}
      </div>
      <div className="card space-y-2 p-4">
        <Skeleton className="h-8 w-full" />
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="flex items-center gap-3">
            <Skeleton className="h-4 w-4 rounded" />
            <Skeleton className="h-4 flex-1" />
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-4 w-24" />
          </div>
        ))}
      </div>
    </div>
  );
}

// 弹窗栈：嵌套弹窗（如附件弹窗上再弹确认框）时只有最上层响应 Esc
let modalSeq = 0;
const modalStack: number[] = [];

export function Modal({
  open,
  onClose,
  title,
  children,
  footer,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    if (!open) return;
    const id = ++modalSeq;
    modalStack.push(id);
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const focusTimer = window.setTimeout(() => {
      const first = panelRef.current?.querySelector<HTMLElement>(
        'input:not([type="hidden"]),textarea,select,button:not([disabled]),a[href]',
      );
      first?.focus();
    }, 20);

    const onKeyDown = (e: KeyboardEvent) => {
      // 只让最上层弹窗响应 Esc / Tab 循环
      if (modalStack[modalStack.length - 1] !== id) return;
      if (e.key === 'Escape') {
        e.preventDefault();
        closeRef.current();
        return;
      }
      if (e.key !== 'Tab' || !panelRef.current) return;
      const focusables = Array.from(
        panelRef.current.querySelectorAll<HTMLElement>(
          'input:not([type="hidden"]),textarea,select,button:not([disabled]),a[href]',
        ),
      ).filter((el) => el.offsetParent !== null);
      if (focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', onKeyDown);
    return () => {
      window.clearTimeout(focusTimer);
      document.removeEventListener('keydown', onKeyDown);
      const index = modalStack.indexOf(id);
      if (index >= 0) modalStack.splice(index, 1);
      document.body.style.overflow = prevOverflow;
      previouslyFocused?.focus?.();
    };
  }, [open]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-900/30 backdrop-blur-sm" onClick={onClose} />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="modal-panel card relative z-10 max-h-[calc(100dvh-2rem)] w-full max-w-lg overflow-hidden p-0"
      >
        <div className="flex items-center justify-between border-b border-slate-200/70 px-5 py-3.5">
          <h2 className="text-sm font-semibold text-slate-800">{title}</h2>
          <button
            type="button"
            className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 transition hover:bg-slate-100 hover:text-slate-700"
            onClick={onClose}
            aria-label="关闭"
          >
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
            </svg>
          </button>
        </div>
        <div className="max-h-[calc(100dvh-12rem)] overflow-y-auto px-5 py-4">{children}</div>
        {footer && <div className="flex justify-end gap-2 border-t border-slate-200/70 bg-slate-50/50 px-5 py-3">{footer}</div>}
      </div>
    </div>
  );
}

// ---------- Toast ----------
export type ToastType = 'success' | 'error' | 'info';

export interface ToastOptions {
  label?: string;
  onClick?: () => void;
  duration?: number;
  type?: ToastType;
}

interface ToastState {
  msg: string;
  options: ToastOptions;
}

let _toastSetter: ((msg: string, options?: ToastOptions) => void) | null = null;

/** 全局触发 toast 提示，可带动作按钮（如撤销） */
export function toast(msg: string, options?: ToastOptions) {
  if (_toastSetter) _toastSetter(msg, options);
}

const TOAST_STYLE: Record<ToastType, { icon: ReactNode; iconClass: string; borderClass: string }> = {
  success: {
    icon: (
      <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2.6" aria-hidden="true">
        <path d="M5 12l4 4L19 6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
    iconClass: 'bg-emerald-50 text-emerald-600 ring-emerald-100',
    borderClass: 'border-slate-200/80',
  },
  error: {
    icon: <span className="text-sm font-bold">!</span>,
    iconClass: 'bg-rose-50 text-rose-600 ring-rose-100',
    borderClass: 'border-rose-200/80',
  },
  info: {
    icon: <span className="text-sm font-bold">i</span>,
    iconClass: 'bg-brand-50 text-brand-600 ring-brand-100',
    borderClass: 'border-slate-200/80',
  },
};

export function ToastHost() {
  const [state, setState] = useState<ToastState | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    _toastSetter = (m: string, options?: ToastOptions) => {
      setState({ msg: m, options: options ?? {} });
      setVisible(true);
    };
    return () => { _toastSetter = null; };
  }, []);

  const duration = state?.options.duration ?? (state?.options.onClick ? 8000 : 2200);

  useEffect(() => {
    if (!visible || !state) return;
    const id = setTimeout(() => setVisible(false), duration);
    return () => clearTimeout(id);
  }, [visible, state, duration]);

  if (!visible || !state) return null;
  const type = state.options.type ?? 'success';
  const style = TOAST_STYLE[type];
  return (
    <div className="fixed inset-x-4 bottom-[calc(5rem+env(safe-area-inset-bottom))] z-[100] sm:inset-x-auto sm:bottom-6 sm:left-1/2 sm:w-[calc(100%-2rem)] sm:max-w-md sm:-translate-x-1/2 md:bottom-6">
      <div
        className={cn(
          'toast relative overflow-hidden rounded-xl border bg-white px-3.5 py-3 text-sm text-slate-700 shadow-[var(--shadow-float)]',
          style.borderClass,
        )}
        role={type === 'error' ? 'alert' : 'status'}
        aria-live={type === 'error' ? 'assertive' : 'polite'}
      >
        <div className="flex items-center gap-3">
          <span className={cn('flex h-7 w-7 shrink-0 items-center justify-center rounded-full ring-1 ring-inset', style.iconClass)}>
            {style.icon}
          </span>
          <span className="min-w-0 flex-1 break-words text-[13px] font-medium leading-5">{state.msg}</span>
          {state.options.label && state.options.onClick && (
            <button
              className="shrink-0 rounded-lg border border-brand-200 bg-brand-50 px-3 py-1.5 text-xs font-semibold text-brand-700 transition hover:bg-brand-100"
              onClick={() => {
                state.options.onClick!();
                setVisible(false);
              }}
            >
              {state.options.label}
            </button>
          )}
          <button
            type="button"
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-slate-500 transition hover:bg-slate-100 hover:text-slate-700"
            onClick={() => setVisible(false)}
            aria-label="关闭提示"
          >
            <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
            </svg>
          </button>
        </div>
        <span
          aria-hidden="true"
          className={cn('absolute bottom-0 left-0 h-0.5 bg-brand-400/70', type === 'error' && 'bg-rose-400/70')}
          style={{ animation: `toastProgress ${duration}ms linear forwards` }}
        />
      </div>
    </div>
  );
}

// ---------- Confirm ----------
export interface ConfirmOptions {
  title?: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  danger?: boolean;
}

type ConfirmSetter = (options: ConfirmOptions) => Promise<boolean>;
let _confirmSetter: ConfirmSetter | null = null;

/** Promise 化确认框；ConfirmHost 未挂载时回退到原生 confirm */
export function confirmAction(options: ConfirmOptions): Promise<boolean> {
  if (_confirmSetter) return _confirmSetter(options);
  return Promise.resolve(window.confirm(options.message));
}

export function ConfirmHost() {
  const [state, setState] = useState<{ options: ConfirmOptions; resolve: (v: boolean) => void } | null>(null);
  const stateRef = useRef(state);
  stateRef.current = state;

  useEffect(() => {
    _confirmSetter = (options) => new Promise<boolean>((resolve) => {
      stateRef.current?.resolve(false);
      setState({ options, resolve });
    });
    return () => { _confirmSetter = null; };
  }, []);

  const close = (value: boolean) => {
    state?.resolve(value);
    setState(null);
  };

  if (!state) return null;
  return (
    <Modal
      open
      onClose={() => close(false)}
      title={state.options.title ?? '请确认'}
      footer={
        <>
          <Button variant="ghost" onClick={() => close(false)}>{state.options.cancelText ?? '取消'}</Button>
          <Button variant={state.options.danger ? 'danger' : 'primary'} onClick={() => close(true)}>
            {state.options.confirmText ?? '确定'}
          </Button>
        </>
      }
    >
      <p className="whitespace-pre-line text-sm leading-relaxed text-slate-600">{state.options.message}</p>
    </Modal>
  );
}
