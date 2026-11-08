// SR page sections: month-by-month totals, returned carpenters, and one row per carpenter.
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { CalendarDays, ChevronDown, Download, RotateCcw, Users } from 'lucide-react';
import type { Disbursement, Person } from '../disb/types';
import { idKey, showBkash } from '../disb/carpenterList';
import { exportExcel, mainFormatLabel, type Column } from '../services/export';
import { Button, Card, SearchInput, toast } from './ui';
import { DataTable } from './ui/DataTable';
import { cn, maskPhone, money, num } from '../lib/format';

const MONTH_LABEL = (m: string) => new Date(`${m}-01T00:00:00Z`).toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' });
const MONTH_SHORT = (m: string) => new Date(`${m}-01T00:00:00Z`).toLocaleDateString('en-GB', { month: 'short', year: '2-digit', timeZone: 'UTC' });

interface CarpenterRow {
  key: string; carpenterId: string; name: string; bkash: string; territory: string;
  paid: number; ret: number; pending: number; total: number;
  months: string[]; retMonths: string[]; retBkash: string[];
}

/** One row per carpenter (matched by ID, or by name when there is no ID). Latest month's name/number/territory is shown. */
function byCarpenter(rows: Disbursement[]): CarpenterRow[] {
  const m = new Map<string, CarpenterRow & { latest: string }>();
  for (const r of rows) {
    const key = idKey(r.carpenterId) || `name:${r.name.toLowerCase()}`;
    let c = m.get(key);
    if (!c) { c = { key, carpenterId: r.carpenterId, name: r.name, bkash: r.bkash, territory: r.territory, paid: 0, ret: 0, pending: 0, total: 0, months: [], retMonths: [], retBkash: [], latest: '' }; m.set(key, c); }
    if (r.month >= c.latest) { c.latest = r.month; c.name = r.name || c.name; c.bkash = r.bkash || c.bkash; c.territory = r.territory; }
    c.total += r.amount;
    if (!c.months.includes(r.month)) c.months.push(r.month);
    if (r.status === 'PAID') c.paid += r.amount;
    else if (r.status === 'RETURN') { c.ret += r.amount; if (!c.retMonths.includes(r.month)) c.retMonths.push(r.month); if (r.bkash && !c.retBkash.includes(r.bkash)) c.retBkash.push(r.bkash); }
    else c.pending += r.amount;
  }
  return [...m.values()].map(({ latest: _l, ...c }) => ({ ...c, months: c.months.sort(), retMonths: c.retMonths.sort() }));
}

/** Zero / missing amounts show as a dash, but the row stays. */
const amt = (n: number, tone: string) => (n ? <span className={tone}>{money(n)}</span> : <span className="text-muted">—</span>);

/** Card section with title + subtitle; collapsible on phones so the page reads as one list. */
function Section({ icon: Icon, tone, title, subtitle, right, children }:
  { icon: typeof Users; tone: string; title: string; subtitle: string; right?: ReactNode; children: ReactNode }) {
  const [open, setOpen] = useState(true);
  const [wide, setWide] = useState(() => typeof window !== 'undefined' && window.matchMedia('(min-width: 768px)').matches);
  useEffect(() => { const q = window.matchMedia('(min-width: 768px)'); const f = () => setWide(q.matches); q.addEventListener('change', f); return () => q.removeEventListener('change', f); }, []);
  const shown = wide || open;
  return (
    <Card className="mt-4 md:mt-6">
      <div className="flex items-center gap-3 border-b border-line px-4 py-2 md:px-5 md:py-3">
        <button type="button" onClick={() => setOpen(!open)} aria-expanded={shown} disabled={wide}
          className="flex min-h-[44px] min-w-0 flex-1 items-center gap-3 rounded-lg text-left active:opacity-80 disabled:cursor-default">
          <span className={cn('grid h-9 w-9 shrink-0 place-items-center rounded-lg', tone)}><Icon className="h-[18px] w-[18px]" /></span>
          <span className="min-w-0 flex-1"><span className="block truncate text-[15px] font-bold">{title}</span><span className="block truncate text-[13px] text-muted">{subtitle}</span></span>
          <ChevronDown className={cn('h-5 w-5 shrink-0 text-muted transition-transform md:hidden', shown && 'rotate-180')} />
        </button>
        {right && <div className="shrink-0">{right}</div>}
      </div>
      {shown && children}
    </Card>
  );
}

/** Month-by-month totals for the SR's territory. Tap a month to view it. */
export function MonthTable({ rows, selected, onPick }: { rows: Disbursement[]; selected: string; onPick: (m: string) => void }) {
  const months = useMemo(() => {
    const g = new Map<string, { month: string; paid: number; ret: number; pending: number; ids: Set<string> }>();
    for (const r of rows) {
      const x = g.get(r.month) ?? g.set(r.month, { month: r.month, paid: 0, ret: 0, pending: 0, ids: new Set() }).get(r.month)!;
      if (r.status === 'PAID') x.paid += r.amount; else if (r.status === 'RETURN') x.ret += r.amount; else x.pending += r.amount;
      x.ids.add(idKey(r.carpenterId) || r.name);
    }
    return [...g.values()].sort((a, b) => b.month.localeCompare(a.month)).map((x) => ({ ...x, carpenters: x.ids.size }));
  }, [rows]);
  return (
    <Section icon={CalendarDays} tone="bg-surface text-ink" title="Month by month" subtitle={`${months.length} months · tap a month to open`}>
      {/* Phone: one compact tappable row per month */}
      <ul className="divide-y divide-line md:hidden">
        <li className="grid grid-cols-4 gap-1 bg-surface px-4 py-2 font-mono text-[11px] uppercase tracking-wide text-muted">
          <span>Month</span><span className="text-right">Paid</span><span className="text-right">Return</span><span className="text-right">Pending</span></li>
        <li><button onClick={() => onPick('ALL')} className={cn('grid min-h-[48px] w-full grid-cols-4 items-center gap-1 px-4 py-2 text-left text-[13px] active:bg-surface', selected === 'ALL' && 'bg-accent-light/50')}>
          <span className={cn('truncate font-semibold', selected === 'ALL' && 'text-accent')}>All</span>
          <span className="truncate text-right tabular-nums">{amt(months.reduce((s, x) => s + x.paid, 0), 'text-success')}</span>
          <span className="truncate text-right tabular-nums">{amt(months.reduce((s, x) => s + x.ret, 0), 'text-accent')}</span>
          <span className="truncate text-right tabular-nums">{amt(months.reduce((s, x) => s + x.pending, 0), 'text-warning')}</span></button></li>
        {months.map((x) => (
          <li key={x.month}><button onClick={() => onPick(x.month)} aria-pressed={x.month === selected}
            className={cn('grid min-h-[48px] w-full grid-cols-4 items-center gap-1 px-4 py-2 text-left text-[13px] active:bg-surface', x.month === selected && 'bg-accent-light/50')}>
            <span className={cn('truncate font-semibold', x.month === selected && 'text-accent')}>{MONTH_SHORT(x.month)}</span>
            <span className="truncate text-right tabular-nums">{amt(x.paid, 'text-success')}</span>
            <span className="truncate text-right tabular-nums">{amt(x.ret, 'text-accent')}</span>
            <span className="truncate text-right tabular-nums">{amt(x.pending, 'text-warning')}</span></button></li>
        ))}
      </ul>
      <div className="hidden md:block">
      <DataTable rows={months} rowKey={(x) => x.month} pageSize={12} onRowClick={(x) => onPick(x.month)}
        mobileTitle={(x) => <span className={cn(x.month === selected && 'text-accent')}>{MONTH_LABEL(x.month)}</span>}
        cols={[
          { key: 'm', header: 'Month', render: (x) => <span className={cn('font-medium', x.month === selected && 'text-accent')}>{MONTH_LABEL(x.month)}</span>, sort: (x) => x.month },
          { key: 'p', header: 'Paid', align: 'right', render: (x) => amt(x.paid, 'text-success'), sort: (x) => x.paid, mobile: true },
          { key: 'r', header: 'Return', align: 'right', render: (x) => amt(x.ret, 'text-accent'), sort: (x) => x.ret, mobile: true },
          { key: 'pe', header: 'Pending', align: 'right', render: (x) => amt(x.pending, 'text-warning'), sort: (x) => x.pending, mobile: true },
          { key: 'c', header: 'Carpenters', align: 'right', render: (x) => num(x.carpenters), sort: (x) => x.carpenters },
        ]} />
      </div>
    </Section>
  );
}

async function download(user: Person, rows: CarpenterRow[], title: string, period: string, scope: string) {
  const cols: Column<CarpenterRow>[] = [
    { header: 'Carpenter ID', key: 'id', width: 13, value: (c) => c.carpenterId },
    { header: 'Carpenter Name', key: 'n', width: 26, value: (c) => c.name },
    { header: 'bKash Number', key: 'b', width: 16, value: (c) => maskPhone(showBkash(c.bkash)) },
    { header: 'Territory', key: 't', width: 18, value: (c) => c.territory },
    { header: 'Paid', key: 'p', width: 12, money: true, value: (c) => c.paid },
    { header: 'Return', key: 'r', width: 12, money: true, value: (c) => c.ret },
    { header: 'Pending', key: 'pe', width: 12, money: true, value: (c) => c.pending },
    { header: 'Returned Months', key: 'rm', width: 22, value: (c) => c.retMonths.map(MONTH_SHORT).join(', ') },
  ];
  await exportExcel(rows, cols, {
    title, period, scope, user,
    summary: [['Total paid amount', rows.reduce((s, c) => s + c.paid, 0)], ['Total return amount', rows.reduce((s, c) => s + c.ret, 0)], ['Total pending amount', rows.reduce((s, c) => s + c.pending, 0)]],
  });
}

/** Returned carpenters, then every carpenter once with their Paid / Return / Pending totals. */
export function SrDetails({ user, rows, periodLabel, scopeLabel }: { user: Person; rows: Disbursement[]; periodLabel: string; scopeLabel: string }) {
  const carpenters = useMemo(() => byCarpenter(rows).sort((a, b) => b.total - a.total), [rows]);
  const returned = useMemo(() => carpenters.filter((c) => c.ret > 0).sort((a, b) => b.ret - a.ret), [carpenters]);
  const [q, setQ] = useState('');
  const [only, setOnly] = useState<'' | 'paid' | 'ret' | 'pending'>('');
  const [busy, setBusy] = useState('');
  const shown = useMemo(() => {
    const s = q.trim().toLowerCase();
    return carpenters.filter((c) => (!only || c[only] > 0) && (!s || c.name.toLowerCase().includes(s) || c.carpenterId.toLowerCase().includes(s) || c.bkash.includes(s)));
  }, [carpenters, q, only]);
  const dl = async (which: 'returned' | 'all') => {
    setBusy(which);
    try { await download(user, which === 'returned' ? returned : shown, which === 'returned' ? 'Returned Carpenters' : 'Carpenter Summary', periodLabel, scopeLabel); toast.ok('Downloaded'); }
    catch (e) { toast.err((e as Error).message); } finally { setBusy(''); }
  };
  const retTotal = returned.reduce((s, c) => s + c.ret, 0);

  return (<>
    {/* Returned carpenters */}
    <Section icon={RotateCcw} tone="bg-accent-light text-accent" title="Returned carpenters"
      subtitle={`${num(returned.length)} carpenter${returned.length === 1 ? '' : 's'} · ${periodLabel}`}
      right={<div className="flex items-center gap-3"><p className="font-display text-[17px] font-extrabold tabular-nums md:text-[22px]">{amt(retTotal, 'text-accent')}</p>
        <Button size="sm" icon={Download} className="hidden md:inline-flex" loading={busy === 'returned'} disabled={!returned.length} onClick={() => dl('returned')}>{mainFormatLabel(user)}</Button></div>}>
      <DataTable rows={returned} rowKey={(c) => c.key} pageSize={10} empty="No returned payments"
        mobileTitle={(c) => <span className="flex items-center justify-between gap-2"><span className="truncate">{c.name}</span><span className="shrink-0 tabular-nums text-accent">{money(c.ret)}</span></span>}
        cols={[
          { key: 'id', header: 'ID', render: (c) => <span className="font-mono text-[12.5px] text-muted">{c.carpenterId || '—'}</span>, sort: (c) => c.carpenterId },
          { key: 'n', header: 'Carpenter', render: (c) => <span className="font-medium">{c.name}</span>, sort: (c) => c.name },
          { key: 't', header: 'Territory', render: (c) => c.territory || '—' },
          { key: 'm', header: 'Returned in', render: (c) => c.retMonths.map(MONTH_SHORT).join(', ') || '—', mobile: true },
          { key: 'b', header: 'bKash returned from', render: (c) => <span className="font-mono text-[12.5px]">{c.retBkash.map((b) => maskPhone(showBkash(b))).join(', ') || '—'}</span>, mobile: true },
          { key: 'r', header: 'Returned', align: 'right', render: (c) => amt(c.ret, 'text-accent'), sort: (c) => c.ret },
        ]} />
      {returned.length > 0 && <div className="border-t border-line p-3 md:hidden"><Button icon={Download} className="h-11 w-full" loading={busy === 'returned'} onClick={() => dl('returned')}>Download {mainFormatLabel(user)}</Button></div>}
    </Section>

    {/* One row per carpenter */}
    <Section icon={Users} tone="bg-success/10 text-success" title="Carpenters" subtitle={`${num(carpenters.length)} carpenters · ${periodLabel}`}>
      <div className="flex flex-col gap-2 border-b border-line p-3 md:flex-row md:flex-wrap md:items-center md:p-4">
        <SearchInput value={q} onChange={setQ} placeholder="Search name, ID or bKash…" className="w-full md:w-auto md:min-w-[200px] md:flex-1" />
        <div className="flex max-w-full gap-1.5 overflow-x-auto pb-0.5" role="group" aria-label="Show">
          {([['', 'All'], ['paid', 'Paid'], ['ret', 'Return'], ['pending', 'Pending']] as const).map(([k, l]) => (
            <button key={l} onClick={() => setOnly(k)} aria-pressed={only === k}
              className={cn('h-11 shrink-0 rounded-full border px-4 text-[13px] font-medium md:h-10', only === k ? 'border-accent bg-accent-light text-accent' : 'border-line bg-white active:bg-surface md:hover:bg-surface')}>{l}</button>
          ))}
        </div>
        <Button icon={Download} className="hidden md:inline-flex" loading={busy === 'all'} disabled={!shown.length} onClick={() => dl('all')}>{mainFormatLabel(user)}</Button>
      </div>
      <DataTable rows={shown} rowKey={(c) => c.key} pageSize={25} empty="No carpenters match"
        mobileTitle={(c) => c.name || '—'}
        cols={[
          { key: 'id', header: 'ID', render: (c) => <span className="font-mono text-[12.5px] text-muted">{c.carpenterId || '—'}</span>, sort: (c) => c.carpenterId },
          { key: 'n', header: 'Carpenter', render: (c) => <span className="font-medium">{c.name}</span>, sort: (c) => c.name },
          { key: 'b', header: 'bKash', render: (c) => (c.bkash ? maskPhone(showBkash(c.bkash)) : '—') },
          { key: 't', header: 'Territory', render: (c) => c.territory || '—', sort: (c) => c.territory },
          { key: 'p', header: 'Paid', align: 'right', render: (c) => amt(c.paid, 'text-success'), sort: (c) => c.paid, mobile: true },
          { key: 'r', header: 'Return', align: 'right', render: (c) => amt(c.ret, 'text-accent'), sort: (c) => c.ret, mobile: true },
          { key: 'pe', header: 'Pending', align: 'right', render: (c) => amt(c.pending, 'text-warning'), sort: (c) => c.pending, mobile: true },
          { key: 'mo', header: 'Months', align: 'right', render: (c) => num(c.months.length), sort: (c) => c.months.length },
        ]} />
      {shown.length > 0 && <div className="border-t border-line p-3 md:hidden"><Button icon={Download} className="h-11 w-full" loading={busy === 'all'} onClick={() => dl('all')}>Download {mainFormatLabel(user)}</Button></div>}
    </Section>
  </>);
}
