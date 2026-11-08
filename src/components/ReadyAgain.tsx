import { useMemo, useState } from 'react';
import { ArrowRight, Download, RefreshCcw } from 'lucide-react';
import type { Person } from '../disb/types';
import type { Disbursement } from '../disb/types';
import { matchReturns, type ReadyItem } from '../disb/carpenterList';
import { useDisb } from '../disb/store';
import { exportExcel, mainFormatLabel, type Column } from '../services/export';
import { Button, Card, SearchInput, toast } from './ui';
import { DataTable } from './ui/DataTable';
import { cn, fmtDate, maskPhone, money, num } from '../lib/format';
import { ROLE_LABEL } from '../types';

const MONTH_SHORT = (m: string) => new Date(`${m}-01T00:00:00Z`).toLocaleDateString('en-GB', { month: 'short', year: '2-digit', timeZone: 'UTC' });

/** Returned payments whose carpenter now has a different, valid bKash number in the latest carpenter list. */
/** Super Admin only. */
export function ReadyAgain({ user, rows, scopeLabel }: { user: Person; rows: Disbursement[]; scopeLabel: string }) {
  const list = useDisb((s) => s.carpenterList);
  const m = useMemo(() => matchReturns(rows, list?.entries ?? null), [rows, list]);
  const [view, setView] = useState<'ready' | 'same' | 'none'>('ready');
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(false);
  const admin = user.role === 'super_admin';
  const show = (n: string) => (admin ? n : maskPhone(n));
  const items = view === 'ready' ? m.ready : view === 'same' ? m.sameNumber : m.noNumber;
  const shown = useMemo(() => { const s = q.trim().toLowerCase(); return items.filter((x) => !s || x.name.toLowerCase().includes(s) || x.carpenterId.toLowerCase().includes(s) || x.territory.toLowerCase().includes(s)); }, [items, q]);
  const sum = (a: ReadyItem[]) => a.reduce((s, x) => s + x.amount, 0);

  if (user.role !== 'super_admin') return null;

  const download = async () => {
    setBusy(true);
    try {
      const cols: Column<ReadyItem>[] = [
        { header: 'Carpenter ID', key: 'id', width: 13, value: (x) => x.carpenterId },
        { header: 'Carpenter Name', key: 'n', width: 26, value: (x) => x.name },
        { header: 'Territory', key: 't', width: 18, value: (x) => x.territory },
        { header: 'Area', key: 'a', width: 14, value: (x) => x.area },
        { header: 'Zone', key: 'z', width: 14, value: (x) => x.zone },
        { header: 'Returned Months', key: 'm', width: 22, value: (x) => x.months.map(MONTH_SHORT).join(', ') },
        { header: 'Amount', key: 'amt', width: 12, money: true, value: (x) => x.amount },
        { header: 'Old bKash (returned)', key: 'o', width: 18, value: (x) => show(x.oldBkash) },
        { header: 'New bKash', key: 'nb', width: 16, value: (x) => (x.newBkash ? show(x.newBkash) : '—') },
      ];
      await exportExcel(shown, cols, {
        title: view === 'ready' ? 'Ready to Disburse Again' : view === 'same' ? 'Returned - Same bKash Number' : 'Returned - No New Number', scope: `${ROLE_LABEL[user.role]} · ${scopeLabel}`, user,
        period: list ? `Carpenter list of ${fmtDate(list.uploadedAt)}` : 'No carpenter list uploaded', summary: [['Total amount', sum(shown)]],
      });
      toast.ok('Downloaded');
    } catch (e) { toast.err((e as Error).message); } finally { setBusy(false); }
  };

  return (
    <Card className="mt-6">
      <div id="ready" className="flex flex-wrap items-start justify-between gap-3 border-b border-line px-5 py-4">
        <div className="flex items-start gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-success/10 text-success"><RefreshCcw className="h-5 w-5" /></span>
          <div>
            <h2 className="text-[16px] font-bold">Ready to disburse again</h2>
            <p className="text-sm text-muted">Returned payments where the carpenter now has a new bKash number{list ? ` · list of ${fmtDate(list.uploadedAt)}` : ' · no carpenter list uploaded yet'}</p>
          </div>
        </div>
        <div className="text-right">
          <p className="font-display text-[26px] font-extrabold leading-none text-success">{money(sum(m.ready))}</p>
          <p className="mt-1 text-[13px] text-muted">{num(m.ready.length)} carpenter{m.ready.length === 1 ? '' : 's'}</p>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2 border-b border-line p-3 md:p-4">
        <div className="grid w-full grid-cols-3 gap-1.5 md:flex md:w-auto" role="group" aria-label="View">
          <button onClick={() => setView('ready')} aria-pressed={view === 'ready'} className={cn('min-h-[44px] rounded-[var(--radius)] border px-2 py-1 text-[13px] font-medium leading-tight active:bg-surface md:h-10 md:px-3', view === 'ready' ? 'border-success bg-success/10 text-success' : 'border-line hover:bg-surface')}>New number · {num(m.ready.length)}</button>
          <button onClick={() => setView('same')} aria-pressed={view === 'same'} className={cn('min-h-[44px] rounded-[var(--radius)] border px-2 py-1 text-[13px] font-medium leading-tight active:bg-surface md:h-10 md:px-3', view === 'same' ? 'border-warning bg-warning/10 text-warning' : 'border-line hover:bg-surface')}>Same number · {num(m.sameNumber.length)}</button>
          <button onClick={() => setView('none')} aria-pressed={view === 'none'} className={cn('min-h-[44px] rounded-[var(--radius)] border px-2 py-1 text-[13px] font-medium leading-tight active:bg-surface md:h-10 md:px-3', view === 'none' ? 'border-accent bg-accent-light text-accent' : 'border-line hover:bg-surface')}>No new number · {num(m.noNumber.length)}</button>
        </div>
        <SearchInput value={q} onChange={setQ} placeholder="Search name, ID or territory…" className="w-full flex-1 sm:w-auto sm:min-w-[200px]" />
        <Button icon={Download} loading={busy} disabled={!shown.length} onClick={download}>{mainFormatLabel(user)}</Button>
      </div>
      {view === 'none' && <p className="border-b border-line bg-accent-light/40 px-5 py-2.5 text-[13px] text-accent">Returned payments for carpenters who are not in the new carpenter list yet — collect a new bKash number for them.</p>}
      {view === 'same' && <p className="border-b border-line bg-warning/5 px-5 py-2.5 text-[13px] text-warning">These carpenters still have the same bKash number that the money was returned from — a new number is needed before paying again.</p>}
      <DataTable rows={shown} rowKey={(x) => x.carpenterId} pageSize={15} empty={view === 'ready' ? 'Nobody is ready to disburse again' : view === 'same' ? 'No one is waiting on the same number' : 'Every returned carpenter has a new number'}
        mobileTitle={(x) => <span className="flex items-center justify-between gap-2"><span className="truncate">{x.name}</span><span className="shrink-0 tabular-nums text-success">{money(x.amount)}</span></span>}
        cols={[
          { key: 'id', header: 'ID', render: (x) => <span className="font-mono text-[12.5px] text-muted">{x.carpenterId}</span>, sort: (x) => x.carpenterId },
          { key: 'n', header: 'Carpenter', render: (x) => <span className="font-medium">{x.name}</span>, sort: (x) => x.name },
          { key: 't', header: 'Territory', render: (x) => x.territory, sort: (x) => x.territory, mobile: true },
          { key: 'mo', header: 'Returned', render: (x) => x.months.map(MONTH_SHORT).join(', '), mobile: true },
          { key: 'a', header: 'Amount', align: 'right', render: (x) => money(x.amount), sort: (x) => x.amount },
          { key: 'b', header: 'bKash', mobile: true, render: (x) => (
            <span className="inline-flex items-center gap-1.5 font-mono text-[12.5px]"><span className="text-muted line-through decoration-accent/60">{show(x.oldBkash)}</span>
              {view === 'ready' && <><ArrowRight className="h-3.5 w-3.5 text-success" /><span className="text-success">{show(x.newBkash)}</span></>}</span>) },
        ]} />
    </Card>
  );
}
