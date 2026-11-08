// Reads the "Carpenter Reward Disbursement Status" workbook into Disbursement rows.
// Pure function over an ExcelJS workbook, so it runs in the browser (worker) and in Node tests.
import type { Workbook, CellValue } from 'exceljs';
import type { Disbursement, DStatus, SheetReport } from './types';

const MONTHS: Record<string, number> = {
  jan: 1, january: 1, feb: 2, february: 2, fab: 2, mar: 3, march: 3, apr: 4, april: 4, may: 5, jun: 6, june: 6,
  jul: 7, july: 7, aug: 8, august: 8, sep: 9, sept: 9, september: 9, oct: 10, october: 10, nov: 11, november: 11, dec: 12, december: 12,
};

/** "May 2025" → 2025-05, "Sep 26" → 2026-09, "March 26 new app" → 2026-03. Anything else → undefined. */
export function monthFromSheet(name: string): string | undefined {
  const m = name.trim().toLowerCase().match(/^([a-z]+)\s+(\d{2}|\d{4})\b/);
  if (!m || !MONTHS[m[1]]) return undefined;
  const y = m[2].length === 2 ? 2000 + Number(m[2]) : Number(m[2]);
  return `${y}-${String(MONTHS[m[1]]).padStart(2, '0')}`;
}

const cellText = (v: CellValue | undefined): string => {
  if (v === null || v === undefined) return '';
  if (v instanceof Date) return v.toISOString();
  if (typeof v === 'object') {
    const o = v as { result?: unknown; text?: unknown; richText?: { text: string }[]; error?: unknown };
    if ('error' in o && o.error) return '';
    if (o.result !== undefined) return cellText(o.result as CellValue);
    if (o.richText) return o.richText.map((t) => t.text).join('');
    if (o.text !== undefined) return String(o.text);
    return '';
  }
  return String(v);
};
const cellNum = (v: CellValue | undefined) => {
  const t = cellText(v).replace(/,/g, '').trim();
  const n = Number(t);
  return t && Number.isFinite(n) ? n : NaN;
};
const clean = (s: string) => s.replace(/\s+/g, ' ').trim();
/** Shown for payments whose Territory cell is blank in the workbook (only Super Admin / GM see these). */
export const NO_TERRITORY = '(No territory)';

const STATUS = (raw: string): DStatus => {
  const s = raw.trim().toUpperCase();
  if (s === 'PAID') return 'PAID';
  if (s === 'RETURN' || s === 'RETURNED') return 'RETURN';
  return 'PENDING'; // "PENDING FOR PAYMENT", blank, #REF!/#N/A, or sheet without a status column
};

function toDate(v: CellValue | undefined): string | undefined {
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  const t = cellText(v);
  if (/^\d{4}-\d{2}-\d{2}/.test(t)) return t.slice(0, 10);
  const dmy = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (dmy) return `${dmy[3]}-${dmy[2].padStart(2, '0')}-${dmy[1].padStart(2, '0')}`;
  const n = Number(t);
  if (Number.isFinite(n) && n > 40000 && n < 60000) return new Date(Date.UTC(1899, 11, 30) + n * 86400000).toISOString().slice(0, 10);
  return undefined;
}

type Cols = { id: number; name: number; bkash: number; territory: number; area: number; zone: number; amount: number; status: number; date: number };

function findColumns(header: string[]): Cols | null {
  const h = header.map((x) => x.toLowerCase().replace(/\s+/g, ' ').trim());
  const find = (...tests: ((s: string) => boolean)[]) => { for (const t of tests) { const i = h.findIndex(t); if (i >= 0) return i; } return -1; };
  const c: Cols = {
    id: find((s) => s === 'carpenter_id' || s === 'carpenter id', (s) => s === 'influencer sl', (s) => /^sl ?no\.?$/.test(s)),
    name: find((s) => s === 'carpenter name' || s === 'influenter_name', (s) => s === 'influencer name', (s) => s === 'name'),
    bkash: find((s) => s === 'bkash number' || s === 'influencer_bkash_no', (s) => s === 'influencer number', (s) => s === 'mobile no'),
    territory: find((s) => s === 'territory', (s) => s === 'territories'),
    area: find((s) => s === 'area', (s) => s === 'areas'),
    zone: find((s) => s === 'zone', (s) => s === 'zones'),
    amount: find((s) => s === 'amount', (s) => s.includes('total_rft_quantity')),
    status: find((s) => s === 'status', (s) => s === 'payment'),
    date: find((s) => /disbursement date|published date|payment date/.test(s), (s) => s === 'date'),
  };
  if (c.territory < 0 || c.amount < 0 || (c.id < 0 && c.name < 0)) return null;
  // Some sheets have an unnamed date column right before the status column
  if (c.date < 0 && c.status > 0 && !h[c.status - 1]) c.date = c.status - 1;
  return c;
}

export interface ParseResult { rows: Disbursement[]; sheets: SheetReport[] }

export function parseWorkbook(wb: Workbook): ParseResult {
  const rows: Disbursement[] = [];
  const sheets: SheetReport[] = [];
  for (const ws of wb.worksheets) {
    const rep: SheetReport = { sheet: ws.name, used: false, rows: 0, paid: 0, ret: 0, pending: 0, skippedRows: 0, noTerritory: 0 };
    const month = monthFromSheet(ws.name);
    if (!month) { sheets.push({ ...rep, reason: 'Not a monthly sheet' }); continue; }
    rep.month = month;
    // header: first of the first 3 rows that has the needed columns
    let cols: Cols | null = null, headerRow = 0;
    for (let r = 1; r <= 3 && !cols; r++) {
      const header = Array.from((ws.getRow(r).values as CellValue[]).slice(1), (v) => cellText(v)); // fill gaps between headings
      cols = findColumns(header); headerRow = r;
    }
    if (!cols) { sheets.push({ ...rep, reason: 'No territory / amount columns' }); continue; }
    const c = cols;
    for (let r = headerRow + 1; r <= ws.rowCount; r++) {
      const v = (ws.getRow(r).values as CellValue[]).slice(1);
      const amount = cellNum(v[c.amount]);
      const territory = clean(cellText(v[c.territory]));
      const name = c.name >= 0 ? clean(cellText(v[c.name])) : '';
      const id = c.id >= 0 ? clean(cellText(v[c.id])) : '';
      if (!territory && !name && !id && !Number.isFinite(amount)) continue; // empty line
      // Keep every payment that has an amount and a carpenter, even if Territory is blank, so totals match Excel.
      // Rows with an amount but no carpenter (e.g. total lines) are skipped and counted.
      if (!Number.isFinite(amount) || amount < 0 || (!name && !id)) { rep.skippedRows++; continue; }
      const status: DStatus = c.status >= 0 ? STATUS(cellText(v[c.status])) : 'PENDING';
      rows.push({
        month, carpenterId: id, name, bkash: c.bkash >= 0 ? clean(cellText(v[c.bkash])) : '',
        territory: territory || NO_TERRITORY, area: c.area >= 0 ? clean(cellText(v[c.area])) : '', zone: c.zone >= 0 ? clean(cellText(v[c.zone])) : '',
        amount: Math.round(amount * 100) / 100, status, date: c.date >= 0 ? toDate(v[c.date]) : undefined,
      });
      rep.rows++;
      if (!territory) rep.noTerritory = (rep.noTerritory ?? 0) + 1;
      if (status === 'PAID') rep.paid += amount; else if (status === 'RETURN') rep.ret += amount; else rep.pending += amount;
    }
    rep.used = rep.rows > 0;
    if (!rep.used) rep.reason = 'No usable rows';
    sheets.push(rep);
  }
  return { rows, sheets };
}
