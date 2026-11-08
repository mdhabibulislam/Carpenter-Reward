import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { AnimatePresence, motion } from 'motion/react';
import { LayoutDashboard, LogOut, RefreshCcw, Send, Upload, Users, type LucideIcon } from 'lucide-react';
import { useAuth } from '../auth/AuthContext';
import { cn } from '../lib/format';
import { ROLE_LABEL } from '../types';
import { LOGO_SRC } from '../lib/brand';
export { LOGO_SRC };

/** Official Anwar Cement Sheet logo. */
export const Logo = ({ size = 44, className }: { size?: number; className?: string }) => (
  <img src={LOGO_SRC} width={size} height={size} alt="Anwar Cement Sheet" decoding="async" className={cn('shrink-0 select-none object-contain', className)} draggable={false} />
);
/** Logo that doubles as the home button. */
export const HomeLogo = ({ size = 44, withName }: { size?: number; withName?: boolean }) => (
  <Link to="/" aria-label="Home — Anwar Cement Sheet" title="Home" className="flex items-center gap-2.5 rounded-lg outline-none transition-opacity hover:opacity-85 focus-visible:ring-2 focus-visible:ring-accent/40">
    <Logo size={size} />
    {withName && <span className="leading-none"><span className="block font-display text-[15px] font-extrabold text-accent">Anwar</span><span className="mt-1 block font-mono text-[9.5px] tracking-[0.2em] text-ink">CEMENT SHEET</span></span>}
  </Link>
);

const ADMIN_NAV: { to: string; label: string; short: string; icon: LucideIcon }[] = [
  { to: '/', label: 'Disbursement status', short: 'Home', icon: LayoutDashboard },
  { to: '/admin/upload', label: 'Upload data', short: 'Upload', icon: Upload },
  { to: '/admin/carpenters', label: 'New carpenter list', short: 'New bKash', icon: RefreshCcw },
  { to: '/admin/ready', label: 'Ready to disburse again', short: 'Re-send', icon: Send },
  { to: '/admin/people', label: 'People & login codes', short: 'People', icon: Users },
];

function AccountMenu() {
  const { user, signOut } = useAuth();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { const h = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false); document.addEventListener('mousedown', h); return () => document.removeEventListener('mousedown', h); }, []);
  return (
    <div ref={ref} className="relative">
      <button onClick={() => setOpen(!open)} aria-label="Account menu" aria-expanded={open} className="flex min-h-[44px] shrink-0 items-center gap-2 rounded-lg p-0.5 active:bg-surface md:min-h-0 md:p-1 md:pr-2 md:hover:bg-surface">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-ink text-[11px] font-bold text-white">{user!.name.split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase()}</span>
        <span className="hidden text-left leading-tight sm:block"><span className="block text-[13px] font-semibold">{user!.name}</span><span className="block font-mono text-[10.5px] uppercase tracking-[0.06em] text-muted">{ROLE_LABEL[user!.role]}</span></span>
      </button>
      <AnimatePresence>{open && (
        <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} className="absolute right-0 z-50 mt-2 w-60 rounded-xl border border-line bg-white p-1.5 shadow-pop">
          <div className="px-3 py-2"><p className="text-sm font-semibold">{user!.name}</p><p className="text-xs text-muted">{ROLE_LABEL[user!.role]}{user!.scope.length ? ` · ${user!.scope.slice(0, 3).join(', ')}${user!.scope.length > 3 ? '…' : ''}` : ''}</p></div>
          <button onClick={() => signOut()} className="flex min-h-[44px] w-full items-center gap-2 rounded-lg px-3 text-sm text-accent hover:bg-accent-light md:min-h-[36px]"><LogOut className="h-4 w-4" />Log out</button>
        </motion.div>)}
      </AnimatePresence>
    </div>
  );
}

export function AppLayout() {
  const { user } = useAuth();
  const loc = useLocation();
  const admin = user!.role === 'super_admin';
  return (
    <div className="min-h-screen bg-white">
      {admin && (
        <aside className="fixed inset-y-0 left-0 z-40 hidden w-[240px] border-r border-line bg-white md:block">
          <div className="flex h-16 items-center border-b border-line px-4"><HomeLogo size={44} withName /></div>
          <ul className="space-y-0.5 px-3 py-4">
            {ADMIN_NAV.map((n) => (
              <li key={n.to}><NavLink to={n.to} end={n.to === '/'} className={({ isActive }) => cn('relative flex h-10 items-center gap-3 rounded-[8px] px-3 text-[13.5px] font-medium', isActive ? 'bg-surface text-ink' : 'text-ink/70 hover:bg-surface')}>
                {({ isActive }) => (<>{isActive && <span className="absolute -left-3 top-2 h-6 w-[3px] rounded-r bg-accent" />}<n.icon className={cn('h-[17px] w-[17px]', isActive && 'text-accent')} />{n.label}</>)}
              </NavLink></li>
            ))}
          </ul>
        </aside>
      )}
      <div className={cn(admin && 'md:pl-[240px]')}>
        <header className="sticky top-0 z-30 flex items-center gap-2 border-b border-line bg-white/95 px-4 backdrop-blur-sm md:h-16 md:gap-3 md:px-8" style={{ paddingTop: 'env(safe-area-inset-top)', height: 'calc(56px + env(safe-area-inset-top))' }}>
          <div className="shrink-0 md:hidden"><HomeLogo size={34} /></div>
          {!admin && <div className="hidden shrink-0 md:block"><HomeLogo size={38} withName /></div>}
          {/* Pages put their own compact controls here on phones (territory + month) */}
          <div id="header-slot" className="flex min-w-0 flex-1 items-center justify-end gap-2" />
          <AccountMenu />
        </header>
        <main className={cn('mx-auto w-full max-w-[1280px] px-4 pt-4 md:px-10 md:py-10', admin ? 'pb-[calc(88px+env(safe-area-inset-bottom))]' : 'pb-10')}>
          <motion.div key={loc.pathname} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}>
            <Outlet />
          </motion.div>
        </main>
      </div>
      {admin && (
        <nav aria-label="Primary" className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-white/95 backdrop-blur-sm md:hidden" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
          <ul className="flex">
            {ADMIN_NAV.map((n) => (
              <li key={n.to} className="flex flex-1"><NavLink to={n.to} end={n.to === '/'} className={({ isActive }) => cn('flex min-h-[56px] flex-1 flex-col items-center justify-center gap-1 text-[11px] font-medium', isActive ? 'text-accent' : 'text-muted')}>
                <n.icon className="h-[22px] w-[22px]" />{n.short}
              </NavLink></li>
            ))}
          </ul>
        </nav>
      )}
    </div>
  );
}
