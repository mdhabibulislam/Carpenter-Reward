import type { Role } from '../types';
import type { Disbursement, DStatus, Person } from './types';
import { SCOPE_LEVEL } from './types';

export type Level = 'zone' | 'area' | 'territory';

/** Compare names loosely: case, extra spaces and a trailing "Zone" do not matter ("Comilla" = "Comilla Zone"). */
export const nameKey = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim().replace(/ zone$/, '');
/** A cell may list several names ("Barisal Sadar, Uzirpur"). */
export const keysOf = (s: string) => s.split(',').map(nameKey).filter(Boolean);

export const fieldOf = (r: Disbursement, level: Level) => (level === 'zone' ? r.zone : level === 'area' ? r.area : r.territory);

/** Rows a person may see. GM and Super Admin see everything. */
export function visibleRows(p: Person, rows: Disbursement[]) {
  const level = SCOPE_LEVEL[p.role];
  if (level === 'all') return rows;
  const allowed = new Set(p.scope.map(nameKey));
  if (!allowed.size) return [];
  return rows.filter((r) => keysOf(fieldOf(r, level)).some((k) => allowed.has(k)));
}

/** First breakdown level shown to each role (SR goes straight to the carpenter list). */
export const firstLevel = (role: Role): Level | null =>
  role === 'sr' ? null : role === 'asm' ? 'territory' : role === 'zsm' || role === 'dgm' ? 'area' : 'zone';
export const nextLevel = (l: Level): Level | null => (l === 'zone' ? 'area' : l === 'area' ? 'territory' : null);
export const LEVEL_LABEL: Record<Level, string> = { zone: 'Zone', area: 'Area', territory: 'Territory' };

export interface Totals { paid: number; ret: number; pending: number; total: number; nPaid: number; nRet: number; nPending: number; carpenters: number }
export function totals(rows: Disbursement[]): Totals {
  const t: Totals = { paid: 0, ret: 0, pending: 0, total: 0, nPaid: 0, nRet: 0, nPending: 0, carpenters: 0 };
  const ids = new Set<string>();
  for (const r of rows) {
    t.total += r.amount;
    ids.add(r.carpenterId || r.name);
    if (r.status === 'PAID') { t.paid += r.amount; t.nPaid++; } else if (r.status === 'RETURN') { t.ret += r.amount; t.nRet++; } else { t.pending += r.amount; t.nPending++; }
  }
  t.carpenters = ids.size;
  return t;
}

/** Group rows by a level, using the first name in multi-name cells for display. */
export function groupBy(rows: Disbursement[], level: Level) {
  const m = new Map<string, { label: string; rows: Disbursement[] }>();
  for (const r of rows) {
    for (const k of keysOf(fieldOf(r, level)).length ? keysOf(fieldOf(r, level)) : ['(not set)']) {
      const g = m.get(k) ?? m.set(k, { label: k === '(not set)' ? '(not set)' : fieldOf(r, level).split(',').map((s) => s.trim()).find((s) => nameKey(s) === k) ?? k, rows: [] }).get(k)!;
      g.rows.push(r);
    }
  }
  return [...m.entries()].map(([key, g]) => ({ key, label: g.label, ...totals(g.rows) })).sort((a, b) => b.total - a.total);
}

export const STATUS_TEXT: Record<DStatus, string> = { PAID: 'Paid', RETURN: 'Return', PENDING: 'Pending' };

/** Distinct names found in the data for each level — used when assigning people. */
export function namesByLevel(rows: Disbursement[]) {
  const out: Record<Level, Map<string, string>> = { zone: new Map(), area: new Map(), territory: new Map() };
  for (const r of rows) for (const l of ['zone', 'area', 'territory'] as Level[]) {
    for (const part of fieldOf(r, l).split(',')) { const label = part.replace(/\s+/g, ' ').trim(); const k = nameKey(label); if (k && !out[l].has(k)) out[l].set(k, label); }
  }
  return { zone: [...out.zone.values()].sort(), area: [...out.area.values()].sort(), territory: [...out.territory.values()].sort() };
}
