import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight, ChevronsUpDown } from 'lucide-react';
import { cn } from '../../lib/format';
import { EmptyState } from '.';

export interface Col<T> {
  key: string; header: string; render: (r: T) => ReactNode;
  sort?: (r: T) => string | number; align?: 'right'; className?: string;
  /** shown in the stacked mobile card */
  mobile?: boolean;
}

export function DataTable<T>({ rows, cols, rowKey, onRowClick, pageSize = 15, empty = 'No records found', mobileTitle, initialSort }:
  { rows: T[]; cols: Col<T>[]; rowKey: (r: T) => string; onRowClick?: (r: T) => void; pageSize?: number; empty?: string;
    mobileTitle?: (r: T) => ReactNode; initialSort?: { key: string; dir: 1 | -1 } }) {
  const [sort, setSort] = useState<{ key: string; dir: 1 | -1 } | null>(initialSort ?? null);
  const [page, setPage] = useState(0);
  useEffect(() => setPage(0), [rows.length]);

  const sorted = useMemo(() => {
    if (!sort) return rows;
    const c = cols.find((x) => x.key === sort.key);
    if (!c?.sort) return rows;
    return [...rows].sort((a, b) => { const x = c.sort!(a), y = c.sort!(b); return (x > y ? 1 : x < y ? -1 : 0) * sort.dir; });
  }, [rows, sort, cols]);
  const pages = Math.max(1, Math.ceil(sorted.length / pageSize));
  const view = sorted.slice(page * pageSize, page * pageSize + pageSize);

  if (!rows.length) return <EmptyState title={empty} />;
  const mCols = cols.filter((c) => c.mobile);

  return (
    <div>
      {/* Desktop / tablet */}
      <div className="hidden max-h-[72vh] max-w-full overflow-auto md:block">
        <table className="w-full text-[13.5px]">
          <thead>
            <tr className="text-left">
              {cols.map((c) => (
                <th key={c.key} className={cn('sticky top-0 z-10 whitespace-nowrap border-b border-line bg-surface px-4 py-2.5 font-mono text-[10.5px] font-medium uppercase tracking-[0.08em] text-muted', c.align === 'right' && 'text-right')}>
                  {c.sort ? (
                    <button className="inline-flex items-center gap-1 hover:text-foreground" onClick={() => setSort((s) => ({ key: c.key, dir: s?.key === c.key ? (-s.dir as 1 | -1) : 1 }))}>
                      {c.header}
                      {sort?.key === c.key ? (sort.dir === 1 ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />) : <ChevronsUpDown className="h-3 w-3 opacity-40" />}
                    </button>
                  ) : c.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {view.map((r) => (
              <tr key={rowKey(r)} onClick={() => onRowClick?.(r)} className={cn('border-b border-line/80 transition-colors duration-150 last:border-0 hover:bg-surface', onRowClick && 'cursor-pointer')}>
                {cols.map((c) => <td key={c.key} className={cn('whitespace-nowrap px-4 py-3.5', c.align === 'right' && 'text-right tabular-nums', c.className)}>{c.render(r)}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {/* Phone: tappable record rows */}
      <ul className="divide-y divide-line md:hidden">
        {view.map((r) => (
          <li key={rowKey(r)}>
            <div role={onRowClick ? 'button' : undefined} tabIndex={onRowClick ? 0 : undefined} onClick={() => onRowClick?.(r)}
              onKeyDown={(e) => onRowClick && (e.key === 'Enter' || e.key === ' ') && onRowClick(r)}
              className={cn('flex min-h-[44px] items-center gap-3 px-4 py-3', onRowClick && 'cursor-pointer active:bg-surface')}>
              <div className="min-w-0 flex-1">
                {mobileTitle && <div className="mb-1.5 truncate text-[15px] font-semibold">{mobileTitle(r)}</div>}
                <dl className={cn('grid gap-x-3 gap-y-1.5 text-[13px]', mCols.length === 3 ? 'grid-cols-3' : 'grid-cols-2')}>
                  {mCols.map((c) => (
                    <div key={c.key} className="min-w-0"><dt className="font-mono text-[11px] uppercase tracking-[0.06em] text-muted">{c.header}</dt><dd className="truncate tabular-nums">{c.render(r)}</dd></div>
                  ))}
                </dl>
              </div>
              {onRowClick && <ChevronRight className="h-5 w-5 shrink-0 text-muted/60" />}
            </div>
          </li>
        ))}
      </ul>
      {/* Desktop pager */}
      <div className="hidden items-center justify-between border-t border-line px-4 py-3 font-mono text-[11px] text-muted md:flex">
        <span>{page * pageSize + 1}–{Math.min(sorted.length, (page + 1) * pageSize)} of {sorted.length}</span>
        <div className="flex items-center gap-1">
          <button aria-label="Previous page" disabled={page === 0} onClick={() => setPage(page - 1)} className="grid h-9 w-9 place-items-center rounded-lg border border-line hover:bg-surface disabled:opacity-40"><ChevronLeft className="h-4 w-4" /></button>
          <span className="px-2">Page {page + 1} / {pages}</span>
          <button aria-label="Next page" disabled={page >= pages - 1} onClick={() => setPage(page + 1)} className="grid h-9 w-9 place-items-center rounded-lg border border-line hover:bg-surface disabled:opacity-40"><ChevronRight className="h-4 w-4" /></button>
        </div>
      </div>
      {/* Phone pager: full width, 44px targets */}
      <div className="border-t border-line p-3 md:hidden">
        <p className="mb-2 text-center font-mono text-[11px] text-muted">{page * pageSize + 1}–{Math.min(sorted.length, (page + 1) * pageSize)} of {sorted.length}{pages > 1 ? ` · page ${page + 1} / ${pages}` : ''}</p>
        {pages > 1 && <div className="grid grid-cols-2 gap-2">
          <button disabled={page === 0} onClick={() => setPage(page - 1)} className="flex h-11 items-center justify-center gap-1 rounded-[var(--radius)] border border-line text-[15px] font-medium active:bg-surface disabled:opacity-40"><ChevronLeft className="h-4 w-4" />Previous</button>
          <button disabled={page >= pages - 1} onClick={() => setPage(page + 1)} className="flex h-11 items-center justify-center gap-1 rounded-[var(--radius)] border border-line text-[15px] font-medium active:bg-surface disabled:opacity-40">Next<ChevronRight className="h-4 w-4" /></button>
        </div>}
      </div>
    </div>
  );
}
