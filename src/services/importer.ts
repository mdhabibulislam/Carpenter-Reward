// Validated spreadsheet reading for imports / bKash result files.
const MAX_BYTES = 5 * 1024 * 1024;
const OK_EXT = /\.(xlsx|csv)$/i;

export async function readSheet(file: File): Promise<Record<string, string>[]> {
  if (!OK_EXT.test(file.name)) throw new Error('Only .xlsx or .csv files are accepted.');
  if (file.size > MAX_BYTES) throw new Error('File is larger than 5 MB.');
  if (/\.csv$/i.test(file.name)) {
    const lines = (await file.text()).replace(/^﻿/, '').split(/\r?\n/).filter((l) => l.trim());
    const split = (l: string) => (l.match(/("([^"]|"")*"|[^,]*)(,|$)/g) ?? []).map((c) => c.replace(/,$/, '').replace(/^"|"$/g, '').replace(/""/g, '"').trim()).slice(0, -1);
    const head = split(lines[0]).map(norm);
    return lines.slice(1).map((l) => Object.fromEntries(split(l).map((v, i) => [head[i], v])));
  }
  const ExcelJS = (await import('exceljs')).default;
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(await file.arrayBuffer());
  const ws = wb.worksheets[0];
  if (!ws) throw new Error('Workbook has no sheets.');
  let head: string[] = [];
  const out: Record<string, string>[] = [];
  ws.eachRow((row, n) => {
    const vals = (row.values as unknown[]).slice(1).map((v) => String((v as { text?: string })?.text ?? v ?? '').trim());
    if (!head.length) { if (vals.filter(Boolean).length >= 2) head = vals.map(norm); return; }
    if (vals.some(Boolean)) out.push(Object.fromEntries(vals.map((v, i) => [head[i], v])));
    void n;
  });
  if (!head.length) throw new Error('Could not find a header row.');
  return out;
}
export const norm = (h: string) => h.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
