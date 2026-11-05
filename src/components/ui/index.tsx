import type { ReactNode } from 'react';
import { useState, useEffect, useRef } from 'react';
import { cn } from '../../lib/utils';

export function Card({ className, children }: { className?: string; children: ReactNode }) {
  const hasPadding = (className ?? '').split(/\s+/).some((c) => /^p[xytblr]?-/.test(c));
  return <div className={cn('card', !hasPadding && 'p-5', className)}>{children}</div>;
}

export function CardTitle({ children, className }: { children: ReactNode; className?: string }) {
  return <h3 className={cn('text-sm font-semibold text-slate-700 mb-3', className)}>{children}</h3>;
}

/** 页面标题 + 主操作，全站统一标题行结构 */
export function PageHeader({
  title,
  subtitle,
  meta,
  actions,
  className,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  meta?: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-start sm:justify-between', className)}>
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-xl font-semibold tracking-tight text-slate-800">{title}</h1>
          {meta}
        </div>
        {subtitle && <div className="mt-1 text-sm text-slate-500">{subtitle}</div>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </div>
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
        <h2 className="text-base font-semibold text-slate-800">{title}</h2>
        {subtitle && <p className="mt-0.5 text-xs text-slate-400">{subtitle}</p>}
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

export function EmptyState({ title, hint, action }: { title: string; hint?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center py-14 text-center">
      <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100 text-2xl">📋</div>
      <p className="text-sm font-medium text-slate-700">{title}</p>
      {hint && <p className="mt-1 max-w-sm text-xs leading-relaxed text-slate-400">{hint}</p>}
      {action && <div className="mt-4 flex flex-wrap justify-center gap-2">{action}</div>}
    </div>
  );
}

/** 加载占位：替换“加载中…”纯文字，减少布局跳动 */
export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('animate-pulse rounded-lg bg-slate-100', className)} />;
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
        className="modal-panel relative z-10 w-full max-w-lg card p-0"
      >
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3">
          <h3 className="text-sm font-semibold text-slate-800">{title}</h3>
          <button className="btn-ghost px-2 py-1 text-slate-400 hover:text-slate-600" onClick={onClose} aria-label="关闭">
            ✕
          </button>
        </div>
        <div className="px-5 py-4">{children}</div>
        {footer && <div className="flex justify-end gap-2 border-t border-slate-100 px-5 py-3">{footer}</div>}
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

const TOAST_STYLE: Record<ToastType, { icon: string; className: string }> = {
  success: { icon: '✓', className: 'bg-slate-800' },
  error: { icon: '!', className: 'bg-rose-600' },
  info: { icon: 'i', className: 'bg-slate-700' },
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

  useEffect(() => {
    if (!visible || !state) return;
    const id = setTimeout(() => setVisible(false), state.options.duration ?? 1800);
    return () => clearTimeout(id);
  }, [visible, state]);

  if (!visible || !state) return null;
  const type = state.options.type ?? 'success';
  const style = TOAST_STYLE[type];
  return (
    <div className="fixed bottom-6 left-1/2 z-[100] w-[calc(100%-2rem)] max-w-md -translate-x-1/2">
      <div
        className={cn('toast flex items-center gap-3 rounded-xl px-4 py-2.5 text-sm text-white shadow-lg', style.className)}
        role="status"
        aria-live="polite"
      >
        <span className={cn(
          'flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-xs font-semibold',
          type === 'error' ? 'bg-white/20' : 'bg-white/15',
        )}>
          {style.icon}
        </span>
        <span className="min-w-0 flex-1 break-words">{state.msg}</span>
        {state.options.label && state.options.onClick && (
          <button
            className="shrink-0 rounded-md bg-white px-3 py-1 text-xs font-semibold text-slate-800 shadow-soft transition hover:bg-slate-100"
            onClick={() => {
              state.options.onClick!();
              setVisible(false);
            }}
          >
            {state.options.label}
          </button>
        )}
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
