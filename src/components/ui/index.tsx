import { AnimatePresence, animate, motion, useReducedMotion } from 'motion/react';
import { useEffect, useRef, useState, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { ArrowDownRight, ArrowUpRight, Inbox, Loader2, Search, X, type LucideIcon } from 'lucide-react';
import { cn } from '../../lib/format';
import type { PaymentStatus } from '../../types';
import { STATUS_LABEL } from '../../types';

// ---------- Button ----------
type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
export function Button({ variant = 'secondary', size = 'md', icon: Icon, loading, className, children, ...p }:
  ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: 'sm' | 'md'; icon?: LucideIcon; loading?: boolean }) {
  const v = {
    primary: 'bg-accent text-white hover:bg-accent-dark',
    secondary: 'bg-white text-ink border border-line hover:border-[#d4d5d8] hover:bg-surface',
    ghost: 'text-foreground hover:bg-secondary',
    danger: 'bg-white text-primary border border-primary/30 hover:bg-primary-light',
  }[variant];
  return (
    <button {...p} disabled={p.disabled || loading}
      className={cn('inline-flex items-center justify-center gap-2 rounded-[var(--radius)] font-medium transition duration-150 ease-brand active:scale-[.97] disabled:opacity-50 disabled:pointer-events-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40',
        size === 'sm' ? 'h-10 px-3.5 text-[13.5px] md:h-8 md:px-3 md:text-[13px]' : 'h-11 px-4 text-[15px] md:h-10 md:text-sm', v, className)}>
      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : Icon && <Icon className="h-4 w-4" />}
      {children}
    </button>
  );
}

// ---------- Layout bits ----------
export const Card = ({ className, children }: { className?: string; children: ReactNode }) => (
  <div className={cn('min-w-0 max-w-full rounded-[var(--radius)] border border-line bg-white shadow-[var(--shadow)]', className)}>{children}</div>
);
export const CardHeader = ({ title, subtitle, action }: { title: string; subtitle?: string; action?: ReactNode }) => (
  <div className="flex items-start justify-between gap-3 border-b border-line px-5 py-4">
    <div><h3 className="text-[15px] font-bold">{title}</h3>{subtitle && <p className="mt-0.5 text-xs text-muted">{subtitle}</p>}</div>
    {action}
  </div>
);
/** Compact uppercase mono label used for eyebrows and metric captions. */
export const Eyebrow = ({ children, className }: { children: ReactNode; className?: string }) => (
  <p className={cn('font-mono text-[11px] font-medium uppercase tracking-[0.08em] text-muted', className)}>{children}</p>
);

/** Signature element: thin red line with a small indicator showing progress (0–100). */
export function ProgressLine({ value, className, label }: { value?: number; className?: string; label?: string }) {
  const reduce = useReducedMotion();
  const v = Math.max(0, Math.min(100, value ?? 0));
  return (
    <div className={cn('relative', className)} role={value !== undefined ? 'progressbar' : undefined} aria-valuenow={value !== undefined ? Math.round(v) : undefined} aria-valuemin={0} aria-valuemax={100} aria-label={label}>
      <div className="h-px w-full bg-line" />
      {value === undefined ? (
        <div className="absolute inset-y-[-0.5px] left-0 w-1/4 overflow-hidden"><div className="h-[2px] w-full bg-accent" /></div>
      ) : (
        <>
          <motion.div className="absolute left-0 top-[-0.5px] h-[2px] bg-accent" initial={reduce ? false : { width: 0 }} animate={{ width: `${v}%` }} transition={{ duration: 1.1, ease: [0.22, 1, 0.36, 1] }} />
          <motion.span className="absolute top-1/2 h-[7px] w-[7px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-accent ring-[3px] ring-accent-light"
            initial={reduce ? false : { left: '0%' }} animate={{ left: `${v}%` }} transition={{ duration: 1.1, ease: [0.22, 1, 0.36, 1] }} />
        </>
      )}
    </div>
  );
}

export function PageHeader({ title, subtitle, actions, demo = true, eyebrow, progress }:
  { title: string; subtitle?: string; actions?: ReactNode; demo?: boolean; eyebrow?: string; progress?: number }) {
  return (
    <div className="mb-4 md:mb-8">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div className="min-w-0">
          <div className="mb-2 flex items-center gap-3">{eyebrow && <Eyebrow>{eyebrow}</Eyebrow>}{demo && <DemoBadge />}</div>
          <h1 className="truncate text-[22px] font-extrabold leading-tight md:text-[30px]">{title}</h1>
          {subtitle && <p className="mt-1 break-words text-[13px] text-muted md:text-[14.5px]">{subtitle}</p>}
        </div>
        {actions && <div className="flex min-w-0 flex-wrap gap-2 [&>*]:min-w-0 [&>*]:flex-1 sm:[&>*]:flex-none">{actions}</div>}
      </div>
      <ProgressLine className="mt-4 hidden md:block md:mt-6" value={progress} label={progress !== undefined ? 'Payment completion' : undefined} />
    </div>
  );
}
export const DemoBadge = () => (
  <span title="Sample data — real company API not connected" className="rounded border border-warning/40 bg-warning/[.07] px-1.5 py-px font-mono text-[10px] font-medium uppercase tracking-[0.08em] text-warning">Demo data</span>
);

// ---------- Status ----------
const STATUS_STYLE: Record<PaymentStatus, string> = {
  PAID: 'bg-success/10 text-success ring-success/20',
  PENDING: 'bg-warning/10 text-warning ring-warning/25',
  FAILED: 'bg-primary-light text-primary ring-primary/20',
  NOT_SENT: 'bg-surface-alt text-muted ring-line',
};
export const StatusBadge = ({ status }: { status: PaymentStatus }) => (
  <span className={cn('inline-flex items-center gap-1.5 whitespace-nowrap rounded-md px-2 py-0.5 text-[12px] font-medium ring-1 ring-inset', STATUS_STYLE[status])}>
    <span className="h-1.5 w-1.5 rounded-full bg-current" />{STATUS_LABEL[status]}
  </span>
);
export const STATUS_COLOR: Record<PaymentStatus, string> = { PAID: '#16834A', PENDING: '#D98B16', FAILED: '#C8102E', NOT_SENT: '#B9BBC1' };

// ---------- KPI ----------
export function AnimatedNumber({ value, format }: { value: number; format: (n: number) => string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const reduce = useReducedMotion();
  useEffect(() => {
    if (!ref.current) return;
    if (reduce) { ref.current.textContent = format(value); return; }
    const c = animate(0, value, { duration: 0.8, ease: [0.22, 1, 0.36, 1], onUpdate: (v) => { if (ref.current) ref.current.textContent = format(v); } });
    return () => c.stop();
  }, [value]); // eslint-disable-line
  return <span ref={ref}>{format(value)}</span>;
}

const TONE_DOT = { red: 'bg-accent', green: 'bg-success', amber: 'bg-warning', neutral: 'bg-ink' } as const;
export function KpiCard({ label, value, format, icon: Icon, hint, change, tone = 'neutral', index = 0, invert, flat }:
  { label: string; value: number; format: (n: number) => string; icon?: LucideIcon; hint?: string; change?: number; tone?: 'red' | 'green' | 'amber' | 'neutral'; index?: number; invert?: boolean; flat?: boolean }) {
  const good = change === undefined ? null : invert ? change <= 0 : change >= 0;
  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.45, delay: index * 0.04, ease: [0.22, 1, 0.36, 1] }}
      className={cn('min-w-0 p-5', !flat && 'rounded-[var(--radius)] border border-line bg-white')}>
      <div className="flex items-center gap-2">
        <span className={cn('h-1.5 w-1.5 shrink-0 rounded-full', TONE_DOT[tone])} />
        <Eyebrow className="truncate">{label}</Eyebrow>
        {Icon && <Icon className="ml-auto h-4 w-4 shrink-0 text-muted/70" />}
      </div>
      <p className="mt-3 font-display text-[28px] font-extrabold leading-none tabular-nums tracking-tight"><AnimatedNumber value={value} format={format} /></p>
      <div className="mt-2 flex min-h-[18px] items-center gap-2 text-[12.5px] text-muted">
        {change !== undefined && (
          <span className={cn('inline-flex items-center font-mono text-[11.5px] font-medium', good ? 'text-success' : 'text-accent')}>
            {change >= 0 ? <ArrowUpRight className="h-3.5 w-3.5" /> : <ArrowDownRight className="h-3.5 w-3.5" />}{Math.abs(change)}%
          </span>
        )}
        <span className="truncate">{hint}</span>
      </div>
    </motion.div>
  );
}
/** One bordered panel holding several metrics separated by hairlines (replaces card grids). */
export const MetricStrip = ({ children, className, cols = 'sm:grid-cols-2 lg:grid-cols-4' }: { children: ReactNode; className?: string; cols?: string }) => (
  <div className={cn('grid grid-cols-1 divide-y divide-line overflow-hidden rounded-[var(--radius)] border border-line bg-white sm:divide-y-0 [&>*]:border-line sm:[&>*]:border-b sm:[&>*]:border-r', cols, className)}>{children}</div>
);

// ---------- Inputs ----------
export function SearchInput({ value, onChange, placeholder, className }: { value: string; onChange: (v: string) => void; placeholder?: string; className?: string }) {
  return (
    <div className={cn('relative', className)}>
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
      <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder}
        className="h-11 w-full rounded-[var(--radius)] border border-line bg-white pl-9 pr-3 text-base md:h-10 md:text-sm outline-none transition placeholder:text-muted focus:border-primary/50 focus:ring-2 focus:ring-primary/15" />
    </div>
  );
}
export function Select({ value, onChange, options, label, className }:
  { value: string; onChange: (v: string) => void; options: { value: string; label: string }[]; label?: string; className?: string }) {
  return (
    <label className={cn('flex flex-col gap-1', className)}>
      {label && <span className="font-mono text-[11px] font-medium uppercase tracking-[0.06em] text-muted">{label}</span>}
      <select value={value} onChange={(e) => onChange(e.target.value)}
        className="h-11 min-w-0 rounded-[var(--radius)] border border-line bg-white px-3 text-base md:h-10 md:text-sm outline-none focus:border-primary/50 focus:ring-2 focus:ring-primary/15">
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </label>
  );
}
export const inputCls = 'h-11 w-full rounded-[var(--radius)] border border-line bg-white px-3 text-base md:h-10 md:text-sm outline-none focus:border-primary/50 focus:ring-2 focus:ring-primary/15';
export const Field = ({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) => (
  <label className="flex flex-col gap-1"><span className="font-mono text-[11px] font-medium uppercase tracking-[0.06em] text-muted">{label}</span>{children}{hint && <span className="text-[11px] text-muted">{hint}</span>}</label>
);

// ---------- Overlays ----------
export function useIsPhone() {
  const q = '(max-width: 767px)';
  const [m, setM] = useState(() => typeof window !== 'undefined' && window.matchMedia(q).matches);
  useEffect(() => { const mq = window.matchMedia(q); const h = () => setM(mq.matches); mq.addEventListener('change', h); return () => mq.removeEventListener('change', h); }, []);
  return m;
}
/** Lock page scroll while a sheet/dialog is open (prevents background scroll on phones). */
function useScrollLock(on: boolean) {
  useEffect(() => { if (!on) return; const o = document.body.style.overflow; document.body.style.overflow = 'hidden'; return () => { document.body.style.overflow = o; }; }, [on]);
}
const Grabber = () => <div className="mx-auto mt-2.5 h-1 w-10 rounded-full bg-line md:hidden" aria-hidden />;
export function Drawer({ open, onClose, title, subtitle, children, width = 560 }: { open: boolean; onClose: () => void; title: string; subtitle?: string; children: ReactNode; width?: number }) {
  const phone = useIsPhone();
  useScrollLock(open);
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    if (open) window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [open, onClose]);
  const ease = [0.22, 1, 0.36, 1] as const;
  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50">
          <motion.div className="absolute inset-0 bg-black/30" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} />
          <motion.aside role="dialog" aria-modal aria-label={title}
            className={phone ? 'absolute inset-x-0 bottom-0 flex max-h-[92dvh] flex-col rounded-t-panel bg-white shadow-pop' : 'absolute right-0 top-0 flex h-full w-full flex-col bg-white shadow-pop'}
            style={phone ? { paddingBottom: 'env(safe-area-inset-bottom)' } : { maxWidth: width }}
            initial={phone ? { y: '100%' } : { x: '100%' }} animate={phone ? { y: 0 } : { x: 0 }} exit={phone ? { y: '100%' } : { x: '100%' }}
            transition={{ duration: 0.3, ease }}>
            <Grabber />
            <div className="flex items-start justify-between border-b border-line px-5 py-3.5 md:px-6 md:py-4">
              <div className="min-w-0"><h2 className="truncate text-lg font-bold">{title}</h2>{subtitle && <p className="truncate font-mono text-[11.5px] text-muted">{subtitle}</p>}</div>
              <button onClick={onClose} aria-label="Close" className="-mr-2 grid h-11 w-11 shrink-0 place-items-center rounded-lg hover:bg-surface"><X className="h-5 w-5" /></button>
            </div>
            <div className="flex-1 overflow-y-auto overscroll-contain px-5 py-5 md:px-6">{children}</div>
          </motion.aside>
        </div>
      )}
    </AnimatePresence>
  );
}
export function Modal({ open, onClose, title, children, footer }: { open: boolean; onClose: () => void; title: string; children: ReactNode; footer?: ReactNode }) {
  const phone = useIsPhone();
  useScrollLock(open);
  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50 flex items-end justify-center md:items-center md:p-4">
          <motion.div className="absolute inset-0 bg-black/30" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} />
          <motion.div role="dialog" aria-modal aria-label={title} className="relative flex max-h-[92dvh] w-full flex-col rounded-t-panel bg-white shadow-pop md:max-w-lg md:rounded-panel"
            style={phone ? { paddingBottom: 'env(safe-area-inset-bottom)' } : undefined}
            initial={phone ? { y: '100%' } : { opacity: 0, scale: 0.97 }} animate={phone ? { y: 0 } : { opacity: 1, scale: 1 }} exit={phone ? { y: '100%' } : { opacity: 0, scale: 0.97 }}
            transition={{ duration: phone ? 0.3 : 0.22, ease: [0.22, 1, 0.36, 1] }}>
            <Grabber />
            <div className="flex items-center justify-between border-b border-line px-5 py-3.5">
              <h2 className="text-base font-bold">{title}</h2>
              <button onClick={onClose} aria-label="Close" className="-mr-2 grid h-11 w-11 place-items-center rounded-lg hover:bg-surface"><X className="h-4 w-4" /></button>
            </div>
            <div className="flex-1 overflow-y-auto overscroll-contain px-5 py-4">{children}</div>
            {footer && <div className="flex justify-end gap-2 border-t border-line px-5 py-3 [&>*]:flex-1 md:[&>*]:flex-none">{footer}</div>}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}

export const EmptyState = ({ title, text, icon: Icon = Inbox }: { title: string; text?: string; icon?: LucideIcon }) => (
  <div className="flex flex-col items-center justify-center px-4 py-6 text-center md:py-8">
    <span className="grid h-9 w-9 place-items-center rounded-full bg-secondary text-muted"><Icon className="h-[18px] w-[18px]" /></span>
    <p className="mt-2 text-[15px] font-semibold">{title}</p>{text && <p className="mt-1 max-w-sm text-[13px] text-muted">{text}</p>}
  </div>
);

// ---------- Toast ----------
type T = { id: number; msg: string; tone: 'ok' | 'err' };
let push: (t: Omit<T, 'id'>) => void = () => {};
export const toast = { ok: (msg: string) => push({ msg, tone: 'ok' }), err: (msg: string) => push({ msg, tone: 'err' }) };
export function Toaster() {
  const [items, setItems] = useState<T[]>([]);
  push = (t) => { const id = Date.now() + Math.random(); setItems((x) => [...x, { ...t, id }]); setTimeout(() => setItems((x) => x.filter((i) => i.id !== id)), 4000); };
  return (
    <div className="pointer-events-none fixed inset-x-4 z-[60] flex flex-col gap-2 md:inset-x-auto md:right-4" style={{ bottom: 'calc(76px + env(safe-area-inset-bottom))' }}>
      <AnimatePresence>
        {items.map((t) => (
          <motion.div key={t.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            className={cn('pointer-events-auto max-w-sm rounded-lg border bg-white px-4 py-3 text-sm shadow-pop', t.tone === 'ok' ? 'border-success/30' : 'border-primary/40')}>
            <span className={cn('mr-2 font-semibold', t.tone === 'ok' ? 'text-success' : 'text-primary')}>{t.tone === 'ok' ? 'Done' : 'Error'}</span>{t.msg}
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}

export const Skeleton = ({ className }: { className?: string }) => <div className={cn('animate-pulse rounded-md bg-secondary', className)} />;
