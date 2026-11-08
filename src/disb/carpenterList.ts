// New carpenter list (with updated bKash numbers) and matching against returned payments.
import type { Workbook, CellValue } from 'exceljs';
import type { Disbursement } from './types';

export interface ListEntry { carpenterId: string; name: string; bkash: string; territory: string }
export interface CarpenterList { fileName: string; uploadedAt: string; uploadedBy: string; entries: ListEntry[] }
export interface ListReadReport { rows: number; noId: number; badNumber: number; duplicates: number; sheet: string }

/** bKash numbers compared on the last 10 digits: 8801819428518, 01819428518 and 1819428518 are the same. */
export const bkashKey = (s: string) => { const d = String(s ?? '').replace(/\D/g, ''); return d.length >= 10 ? d.slice(-10) : ''; };
export const validBkash = (s: string) => /^1[3-9]\d{8}$/.test(bkashKey(s));
export const showBkash = (s: string) => (bkashKey(s) ? `0${bkashKey(s)}` : s);
/** IDs like 189, "189", 189.0 → "189". */
export const idKey = (s: string) => { const t = String(s ?? '').trim(); return /^\d+(\.0+)?$/.test(t) ? String(Number(t)) : t.toUpperCase(); };

const text = (v: CellValue | undefined): string => {
  if (v === null || v === undefined) return '';
  if (typeof v === 'object' && !(v instanceof Date)) {
    const o = v as { result?: unknown; text?: unknown; richText?: { text: string }[]; error?: unknown };
    if (o.error) return '';
    if (o.result !== undefined) return text(o.result as CellValue);
    if (o.richText) return o.richText.map((t) => t.text).join('');
    if (o.text !== undefined) return String(o.text);
    return '';
  }
  return String(v);
};

/** Reads the sheet with the most usable rows that has an ID column and a bKash column (English or Bengali headings). */
export function parseCarpenterList(wb: Workbook): { entries: ListEntry[]; report: ListReadReport } {
  let best: { entries: ListEntry[]; report: ListReadReport } | null = null;
  const nfc = (s: string) => s.normalize('NFC').toLowerCase().replace(/\s+/g, ' ').trim();
  const BN_ID = 'আইডি'.normalize('NFC'), BN_NEW = 'নতুন'.normalize('NFC'), BN_BKASH = 'বিকাশ'.normalize('NFC'), BN_NAME = 'নাম'.normalize('NFC'), BN_TER = 'টেরিটোরি'.normalize('NFC');
  for (const ws of wb.worksheets) {
    for (let hr = 1; hr <= 3; hr++) {
      const h = Array.from((ws.getRow(hr).values as CellValue[]).slice(1), (v) => nfc(text(v))); // fills gaps between headings
      const find = (...t: ((s: string) => boolean)[]) => { for (const f of t) { const i = h.findIndex(f); if (i >= 0) return i; } return -1; };
      const id = find((s) => s === 'carpenter id' || s === 'carpenter_id', (s) => s.includes(BN_ID), (s) => s === 'influencer sl' || /^sl ?no\.?$/.test(s));
      // Prefer an explicit "new" number column; otherwise the bKash column
      const bk = find((s) => /new/.test(s) && /(bkash|number)/.test(s), (s) => s.includes(BN_NEW) && s.includes(BN_BKASH), (s) => s === 'bkash number' || s === 'influencer_bkash_no', (s) => /bkash/.test(s));
      if (id < 0 || bk < 0) continue;
      const name = find((s) => s === 'carpenter name' || s === 'influenter_name' || s === 'name', (s) => s.includes(BN_NAME), (s) => s === 'influencer name');
      const ter = find((s) => s === 'territory' || s === 'territories', (s) => s.includes(BN_TER));
      const report: ListReadReport = { rows: 0, noId: 0, badNumber: 0, duplicates: 0, sheet: ws.name };
      const byId = new Map<string, ListEntry>();
      for (let r = hr + 1; r <= ws.rowCount; r++) {
        const v = (ws.getRow(r).values as CellValue[]).slice(1);
        const cid = idKey(text(v[id]));
        const num = text(v[bk]);
        if (!cid && !num.trim()) continue;
        report.rows++;
        if (!cid) { report.noId++; continue; }
        if (!validBkash(num)) { report.badNumber++; continue; }
        if (byId.has(cid)) report.duplicates++; // the later row wins
        byId.set(cid, { carpenterId: cid, name: name >= 0 ? text(v[name]).trim() : '', bkash: showBkash(num), territory: ter >= 0 ? text(v[ter]).trim() : '' });
      }
      const found = { entries: [...byId.values()], report };
      if (!best || found.entries.length > best.entries.length) best = found;
      break; // header found for this sheet
    }
  }
  if (!best) throw new Error('No sheet with a Carpenter ID column and a bKash number column was found. Use the blank carpenter-list template.');
  return best;
}

export interface ReadyItem {
  carpenterId: string; name: string; territory: string; area: string; zone: string;
  oldBkash: string; newBkash: string; months: string[]; amount: number; returns: number;
}
export interface ReturnMatch { ready: ReadyItem[]; sameNumber: ReadyItem[]; notInList: number; noNumber: ReadyItem[]; alreadyRepaid: number }

/**
 * Returned payments vs the new carpenter list:
 *  • ready      – list has a different valid number, and no later PAID payment to that number yet
 *  • sameNumber – list still has the number that bounced
 * Carpenters are matched by ID.
 */
export function matchReturns(rows: Disbursement[], list: ListEntry[] | null): ReturnMatch {
  const out: ReturnMatch = { ready: [], sameNumber: [], notInList: 0, noNumber: [], alreadyRepaid: 0 };
  const byId = new Map((list ?? []).map((e) => [e.carpenterId, e]));
  const returned = new Map<string, Disbursement[]>();
  const paidTo = new Map<string, { month: string; key: string }[]>();
  for (const r of rows) {
    const id = idKey(r.carpenterId);
    if (!id) continue;
    if (r.status === 'RETURN') (returned.get(id) ?? returned.set(id, []).get(id)!).push(r);
    else if (r.status === 'PAID') (paidTo.get(id) ?? paidTo.set(id, []).get(id)!).push({ month: r.month, key: bkashKey(r.bkash) });
  }
  for (const [id, rs] of returned) {
    const entry = byId.get(id);
    if (!entry) {
      const latest = rs.reduce((a, b) => (b.month > a.month ? b : a));
      out.noNumber.push({ carpenterId: id, name: latest.name, territory: latest.territory, area: latest.area, zone: latest.zone,
        oldBkash: showBkash(latest.bkash), newBkash: '', months: [...new Set(rs.map((r) => r.month))].sort(),
        amount: Math.round(rs.reduce((s, r) => s + r.amount, 0) * 100) / 100, returns: rs.length });
      out.notInList++; continue;
    }
    const newKey = bkashKey(entry.bkash);
    const latest = rs.reduce((a, b) => (b.month > a.month ? b : a));
    // Returns that bounced on a number different from the new one
    const bounced = rs.filter((r) => bkashKey(r.bkash) !== newKey);
    const same = rs.filter((r) => bkashKey(r.bkash) === newKey);
    const firstReturnMonth = rs.reduce((m, r) => (r.month < m ? r.month : m), rs[0].month);
    const repaid = (paidTo.get(id) ?? []).some((p) => p.key === newKey && p.month >= firstReturnMonth);
    const item = (list: Disbursement[]): ReadyItem => ({
      carpenterId: id, name: entry.name || latest.name, territory: latest.territory, area: latest.area, zone: latest.zone,
      oldBkash: showBkash(list[0].bkash), newBkash: entry.bkash, months: [...new Set(list.map((r) => r.month))].sort(),
      amount: Math.round(list.reduce((s, r) => s + r.amount, 0) * 100) / 100, returns: list.length,
    });
    if (bounced.length) { if (repaid) out.alreadyRepaid++; else out.ready.push(item(bounced)); }
    else if (same.length) out.sameNumber.push(item(same));
  }
  out.ready.sort((a, b) => b.amount - a.amount);
  out.sameNumber.sort((a, b) => b.amount - a.amount);
  out.noNumber.sort((a, b) => b.amount - a.amount);
  return out;
}
