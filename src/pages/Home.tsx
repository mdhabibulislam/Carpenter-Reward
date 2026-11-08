import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import { CheckCircle2, ChevronRight, Clock, Download, RotateCcw, Upload } from 'lucide-react';
import { useAuth } from '../auth/AuthContext';
import { useDisb } from '../disb/store';
import { firstLevel, groupBy, keysOf, LEVEL_LABEL, nextLevel, STATUS_TEXT, totals, visibleRows, fieldOf, type Level } from '../disb/scope';
import type { Disbursement, DStatus } from '../disb/types';
import { exportExcel, mainFormatLabel, type Column } from '../services/export';
import { AnimatedNumber, Button, Card, EmptyState, Eyebrow, PageHeader, SearchInput, Select, toast } from '../components/ui';
import { DataTable } from '../components/ui/DataTable';
import { cn, fmtDate, maskPhone, money, num } from '../lib/format';
import { ROLE_LABEL } from '../types';
import { MonthTable, SrDetails } from '../components/SrDetails';
import { showBkash } from '../disb/carpenterList';

const MONTH_SHORT = (m: string) => new Date(`${m}-01T00:00:00Z`).toLocaleDateString('en-GB', { month: 'short', year: 'numeric', timeZone: 'UTC' });
const MONTH_LABEL = (m: string) => new Date(`${m}-01T00:00:00Z`).toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' });
const TONE: Record<DStatus, string> = { PAID: 'text-success', RETURN: 'text-accent', PENDING: 'text-warning' };
const BADGE: Record<DStatus, string> = { PAID: 'bg-success/10 text-success ring-success/20', RETURN: 'bg-accent-light text-accent ring-accent/20', PENDING: 'bg-warning/10 text-warning ring-warning/25' };
const Badge = ({ s }: { s: DStatus }) => <span className={cn('inline-flex items-center gap-1.5 whitespace-nowrap rounded-md px-2 py-0.5 text-[12px] font-medium ring-1 ring-inset', BADGE[s])}><span className="h-1.5 w-1.5 rounded-full bg-current" />{STATUS_TEXT[s]}</span>;

function Metric({ label, amount, count, s, icon: Icon, index }: { label: string; amount: number; count: number; s: DStatus; icon: typeof Clock; index: number }) {
  return (
    <div className="min-w-0 rounded-[var(--radius)] border border-line bg-white px-3 py-3 shadow-[var(--shadow)] md:rounded-none md:border-0 md:p-6 md:shadow-none md:[&:not(:last-child)]:border-r" style={{ animationDelay: `${index * 40}ms` }}>
      <div className="flex items-center gap-2"><Icon className={cn('h-4 w-4', TONE[s])} /><Eyebrow>{label}</Eyebrow></div>
      <p className={cn('mt-2 truncate font-display text-[17px] font-extrabold leading-none tabular-nums tracking-tight sm:mt-3 sm:text-[30px] lg:text-[34px]', TONE[s])}><AnimatedNumber value={amount} format={money} /></p>
      <p className="mt-1.5 text-[11.5px] text-muted sm:mt-2 sm:text-[13px]">{num(count)} payment{count === 1 ? '' : 's'}</p>
    </div>
  );
}

export default function Home() {
  const { user } = useAuth();
  const data = useDisb((s) => s.data);
  const isAdmin = user!.role === 'super_admin';
  const mine = useMemo(() => (data ? visibleRows(user!, data.rows) : []), [data, user]);
  const months = useMemo(() => [...new Set(mine.map((r) => r.month))].sort().reverse(), [mine]);
  const [month, setMonth] = useState<string>('');
  const m = month || months[0] || 'ALL';
  const [path, setPath] = useState<{ level: Level; key: string; label: string }[]>([]);
  const [q, setQ] = useState('');
  const [status, setStatus] = useState<DStatus | ''>('');
  const [busy, setBusy] = useState(false);
  const [slot, setSlot] = useState<HTMLElement | null>(null);
  useEffect(() => setSlot(document.getElementById('header-slot')), []);
  const isManager = user!.role !== 'sr';
  const [terr, setTerr] = useState('');            // one territory picked from the filter
  const [byTerr, setByTerr] = useState(false);      // show every territory in one table
  const terrOptions = useMemo(() => (isManager ? groupBy(mine, 'territory').map((g) => ({ value: g.key, label: g.label })).sort((a, b) => a.label.localeCompare(b.label)) : []), [mine, isManager]);
  const pickTerr = (k: string) => { setTerr(k); setPath([]); setQ(''); setStatus(''); window.scrollTo({ top: 0, behavior: 'smooth' }); };

  const inMonth = useMemo(() => (m === 'ALL' ? mine : mine.filter((r) => r.month === m)), [mine, m]);
  const inPath = useMemo(() => (terr ? inMonth.filter((r) => keysOf(r.territory).includes(terr)) : path.reduce((rows, p) => rows.filter((r) => keysOf(fieldOf(r, p.level)).includes(p.key)), inMonth)), [inMonth, path, terr]);
  const level: Level | null = terr ? null : byTerr ? 'territory' : path.length ? nextLevel(path[path.length - 1].level) : firstLevel(user!.role);
  const t = totals(inPath);
  const groups = useMemo(() => (level ? groupBy(inPath, level) : []), [inPath, level]);
  const listRows = useMemo(() => {
    const s = q.trim().toLowerCase();
    return inPath.filter((r) => (!status || r.status === status) && (!s || r.name.toLowerCase().includes(s) || r.carpenterId.toLowerCase().includes(s) || r.bkash.includes(s)));
  }, [inPath, q, status]);
  const showList = !level;
  const scopeText = user!.scope.length ? user!.scope.join(', ') : 'All territories';

  if (!data) return (
    <Card className="mt-6">
      <EmptyState icon={Upload} title="No data uploaded yet" text={isAdmin ? 'Upload the Carpenter Reward Disbursement Status workbook to get started.' : 'The administrator has not uploaded the disbursement file yet.'} />
      {isAdmin && <div className="pb-8 text-center"><Link to="/admin/upload"><Button variant="primary" icon={Upload}>Upload Excel</Button></Link></div>}
    </Card>
  );

  const download = async () => {
    setBusy(true);
    try {
      const cols: Column<Disbursement>[] = [
        { header: 'Month', key: 'month', width: 14, value: (r) => MONTH_LABEL(r.month) },
        { header: 'Carpenter ID', key: 'id', width: 13, value: (r) => r.carpenterId },
        { header: 'Carpenter Name', key: 'name', width: 26, value: (r) => r.name },
        { header: 'bKash Number', key: 'bkash', width: 16, value: (r) => (isAdmin ? showBkash(r.bkash) : maskPhone(showBkash(r.bkash))) },
        { header: 'Territory', key: 'ter', width: 18, value: (r) => r.territory },
        { header: 'Area', key: 'area', width: 14, value: (r) => r.area },
        { header: 'Zone', key: 'zone', width: 14, value: (r) => r.zone },
        { header: 'Amount', key: 'amt', width: 12, money: true, value: (r) => r.amount },
        { header: 'Status', key: 'status', width: 10, value: (r) => STATUS_TEXT[r.status] },
      ];
      const tt = totals(listRows);
      await exportExcel(listRows, cols, {
        title: `Reward Disbursement ${(terr ? terrOptions.find((o) => o.value === terr)?.label : '') || path.map((p) => p.label).join(' - ') || (user!.role === 'sr' ? scopeText : 'Summary')}`.slice(0, 80),
        period: m === 'ALL' ? 'All months' : MONTH_LABEL(m), scope: `${ROLE_LABEL[user!.role]} · ${user!.name}`, user: user!,
        summary: [['Total paid amount', tt.paid], ['Total return amount', tt.ret], ['Total pending amount', tt.pending]],
      });
      toast.ok('Downloaded');
    } catch (e) { toast.err((e as Error).message); } finally { setBusy(false); }
  };

  return (
    <>
      <PageHeader demo={false} eyebrow={`${ROLE_LABEL[user!.role]} · ${scopeText}`} title={user!.role === 'sr' ? 'My territory' : 'Reward disbursement'}
        subtitle={`Data from ${data.fileName} · updated ${fmtDate(data.uploadedAt)}`}
        actions={<>
          <Select value={m} onChange={(v) => { setMonth(v); }} className="hidden md:flex md:min-w-[170px]"
            options={[...months.map((x) => ({ value: x, label: MONTH_LABEL(x) })), { value: 'ALL', label: 'All months' }]} />
          {isManager && terrOptions.length > 1 && (
            <Select value={terr} onChange={pickTerr} className="w-full sm:w-auto sm:min-w-[190px]"
              options={[{ value: '', label: `All territories (${terrOptions.length})` }, ...terrOptions]} />
          )}
        </>} />

      {isManager && mine.length > 0 && (
        <div className="mb-3 flex max-w-full items-center gap-2 overflow-x-auto pb-0.5 [&>*]:shrink-0" role="group" aria-label="View">
          <button onClick={() => { setTerr(''); setByTerr(false); setPath([]); }} aria-pressed={!terr && !byTerr}
            className={cn('h-11 rounded-[var(--radius)] border px-3.5 text-[14px] font-medium md:h-10 md:text-[13.5px]', !terr && !byTerr ? 'border-accent bg-accent-light text-accent' : 'border-line bg-white hover:bg-surface')}>By {LEVEL_LABEL[firstLevel(user!.role) ?? 'territory'].toLowerCase()}</button>
          <button onClick={() => { setTerr(''); setByTerr(true); setPath([]); }} aria-pressed={!terr && byTerr}
            className={cn('h-11 rounded-[var(--radius)] border px-3.5 text-[14px] font-medium md:h-10 md:text-[13.5px]', !terr && byTerr ? 'border-accent bg-accent-light text-accent' : 'border-line bg-white hover:bg-surface')}>Territory-wise</button>
          {terr && <span className="inline-flex h-11 items-center gap-2 rounded-[var(--radius)] border border-accent bg-accent-light px-3.5 text-[14px] font-medium text-accent md:h-10">
            {terrOptions.find((o) => o.value === terr)?.label}<button onClick={() => pickTerr('')} aria-label="Clear territory" className="text-lg leading-none">×</button></span>}
        </div>
      )}

      {slot && createPortal(
        <div className="flex min-w-0 flex-1 items-center justify-end gap-2 md:hidden">
          <span className="min-w-0 truncate font-mono text-[11px] font-medium uppercase tracking-[0.06em] text-muted">{ROLE_LABEL[user!.role]} · {scopeText}</span>
          <select aria-label="Month" value={m} onChange={(e) => setMonth(e.target.value)}
            className="h-11 w-[118px] shrink-0 rounded-[var(--radius)] border border-line bg-white px-2 text-[15px] font-medium outline-none focus-visible:border-accent">
            {months.map((x) => <option key={x} value={x}>{MONTH_SHORT(x)}</option>)}<option value="ALL">All months</option>
          </select>
        </div>, slot)}

      {!mine.length ? (
        <Card><EmptyState title="Nothing in your area" text={`No rows in the uploaded data match ${scopeText}. Ask the administrator to check your assigned ${user!.role === 'sr' ? 'territory' : 'area'}.`} /></Card>
      ) : (<>
        {path.length > 0 && !terr && !byTerr && (
          <nav className="mb-3 flex flex-wrap items-center gap-1 text-sm" aria-label="Breadcrumb">
            <button className="text-accent hover:underline" onClick={() => setPath([])}>All</button>
            {path.map((p, i) => (
              <span key={i} className="inline-flex items-center gap-1"><ChevronRight className="h-3.5 w-3.5 text-muted" />
                {i === path.length - 1 ? <b>{p.label}</b> : <button className="text-accent hover:underline" onClick={() => setPath(path.slice(0, i + 1))}>{p.label}</button>}
              </span>
            ))}
          </nav>
        )}

        <section className="grid grid-cols-3 gap-2 md:gap-0 md:overflow-hidden md:rounded-panel md:border md:border-line md:bg-white md:shadow-[var(--shadow)]">
          <Metric index={0} label="Paid" amount={t.paid} count={t.nPaid} s="PAID" icon={CheckCircle2} />
          <Metric index={1} label="Return" amount={t.ret} count={t.nRet} s="RETURN" icon={RotateCcw} />
          <Metric index={2} label="Pending" amount={t.pending} count={t.nPending} s="PENDING" icon={Clock} />
        </section>
        <p className="mt-2 text-right font-mono text-[11px] text-muted">Total {money(t.total)} · {num(t.carpenters)} carpenters · {m === 'ALL' ? 'all months' : MONTH_LABEL(m)}</p>

        {level && (
          <Card className="mt-6">
            <div className="flex items-center justify-between border-b border-line px-5 py-3.5">
              <h2 className="text-[15px] font-bold">By {LEVEL_LABEL[level].toLowerCase()}</h2><Eyebrow>{groups.length} {level === 'territory' ? 'territories' : `${LEVEL_LABEL[level].toLowerCase()}s`} · tap to open</Eyebrow>
            </div>
            <DataTable rows={groups} rowKey={(g) => g.key} pageSize={20} onRowClick={(g) => { if (level === 'territory' && isManager) { pickTerr(g.key); return; } setPath([...path, { level, key: g.key, label: g.label }]); setQ(''); setStatus(''); }}
              mobileTitle={(g) => g.label}
              cols={[
                { key: 'n', header: LEVEL_LABEL[level], render: (g) => <span className="font-medium">{g.label}</span>, sort: (g) => g.label },
                { key: 'p', header: 'Paid', align: 'right', render: (g) => <span className="text-success">{money(g.paid)}</span>, sort: (g) => g.paid, mobile: true },
                { key: 'r', header: 'Return', align: 'right', render: (g) => <span className="text-accent">{money(g.ret)}</span>, sort: (g) => g.ret, mobile: true },
                { key: 'pe', header: 'Pending', align: 'right', render: (g) => <span className="text-warning">{money(g.pending)}</span>, sort: (g) => g.pending, mobile: true },
                { key: 'c', header: 'Carpenters', align: 'right', render: (g) => num(g.carpenters), sort: (g) => g.carpenters },
              ]} />
          </Card>
        )}

        {user!.role === 'sr' && (<>
          <MonthTable rows={mine} selected={m} onPick={(x) => { setMonth(x); window.scrollTo({ top: 0, behavior: 'smooth' }); }} />
          <SrDetails user={user!} rows={inPath} periodLabel={m === 'ALL' ? 'All months' : MONTH_LABEL(m)} scopeLabel={scopeText} />
        </>)}

        {showList && user!.role !== 'sr' && (
          <Card className="mt-6">
            <div className="flex flex-wrap items-center gap-2 border-b border-line p-3 md:p-4">
              <SearchInput value={q} onChange={setQ} placeholder="Search name, ID or bKash…" className="w-full flex-1 sm:w-auto sm:min-w-[200px]" />
              <div className="flex max-w-full gap-1.5 overflow-x-auto pb-0.5 [&>button]:shrink-0" role="group" aria-label="Status">
                {(['', 'PAID', 'RETURN', 'PENDING'] as const).map((s) => (
                  <button key={s || 'all'} onClick={() => setStatus(s)} aria-pressed={status === s}
                    className={cn('h-11 rounded-[var(--radius)] border px-3 text-[13.5px] font-medium md:h-10', status === s ? 'border-accent bg-accent-light text-accent' : 'border-line hover:bg-surface')}>
                    {s ? STATUS_TEXT[s] : 'All'}
                  </button>
                ))}
              </div>
              <Button icon={Download} loading={busy} onClick={download} disabled={!listRows.length}>{mainFormatLabel(user)}</Button>
            </div>
            <DataTable rows={listRows} rowKey={(r) => `${r.month}-${r.carpenterId}-${r.name}-${r.amount}-${r.territory}`} pageSize={25}
              mobileTitle={(r) => <span className="flex items-center justify-between gap-2"><span className="truncate">{r.name}</span><span className={cn('shrink-0 tabular-nums', TONE[r.status])}>{money(r.amount)}</span></span>}
              empty="No carpenters match"
              cols={[
                { key: 'id', header: 'ID', render: (r) => <span className="font-mono text-[12.5px] text-muted">{r.carpenterId || '—'}</span>, sort: (r) => r.carpenterId },
                { key: 'n', header: 'Carpenter', render: (r) => <span className="font-medium">{r.name}</span>, sort: (r) => r.name },
                { key: 'b', header: 'bKash', render: (r) => (isAdmin ? showBkash(r.bkash) : maskPhone(showBkash(r.bkash))), mobile: true },
                { key: 't', header: 'Territory', render: (r) => r.territory, sort: (r) => r.territory, mobile: true },
                { key: 'm', header: 'Month', render: (r) => MONTH_LABEL(r.month), sort: (r) => r.month, mobile: m === 'ALL' },
                { key: 'a', header: 'Amount', align: 'right', render: (r) => money(r.amount), sort: (r) => r.amount },
                { key: 's', header: 'Status', render: (r) => <Badge s={r.status} />, sort: (r) => r.status, mobile: true },
              ]} />
          </Card>
        )}
      </>)}
    </>
  );
}
