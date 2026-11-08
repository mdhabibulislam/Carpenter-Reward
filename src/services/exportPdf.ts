// PDF export (used for SR downloads). Loaded on demand so other roles never download the PDF library.
import type { Column, ExportMeta } from './export';
import { LOGO_SRC } from '../lib/brand';

const RED: [number, number, number] = [200, 16, 46];
const INK: [number, number, number] = [32, 33, 36];
const MUTED: [number, number, number] = [119, 123, 132];

/** Built-in PDF fonts only cover Latin-1: map the few symbols we use, drop anything else. */
const pdfText = (v: unknown) => String(v ?? '')
  .replace(/৳/g, 'Tk ').replace(/[–—]/g, '-').replace(/[“”]/g, '"').replace(/[‘’]/g, "'").replace(/…/g, '...').replace(/→/g, '->')
  .replace(/[^\x09\x0A\x0D\x20-\x7E\xA0-\xFF]/g, '');
const money = (n: number) => `Tk ${Math.round(n).toLocaleString('en-IN')}`;

async function logoDataUrl(): Promise<string | null> {
  try {
    const blob = await (await fetch(LOGO_SRC)).blob();
    return await new Promise((res) => { const r = new FileReader(); r.onload = () => res(String(r.result)); r.onerror = () => res(null); r.readAsDataURL(blob); });
  } catch { return null; }
}

export async function buildPdf<T>(rows: T[], cols: Column<T>[], meta: ExportMeta) {
  const [{ jsPDF }, { autoTable }] = await Promise.all([import('jspdf'), import('jspdf-autotable')]);
  const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4', compress: true });
  doc.setProperties({ title: pdfText(meta.title), subject: 'Anwar Cement Sheet · Carpenter Payments', creator: 'Anwar Cement Sheet Carpenter Payment System', author: pdfText(meta.user.name) });
  const W = doc.internal.pageSize.getWidth();
  const M = 32;

  // Columns whose value is identical on every row (e.g. the SR's own name) go into the header instead.
  const constant = rows.length > 1 ? cols.filter((c) => !c.money && rows.every((r) => String(c.value(r) ?? '') === String(c.value(rows[0]) ?? '')) && String(c.value(rows[0]) ?? '') !== '') : [];
  const tableCols = cols.filter((c) => !constant.includes(c));

  // Header: logo, title, details
  const logo = await logoDataUrl();
  if (logo) doc.addImage(logo, 'PNG', M, 22, 54, 54);
  const tx = logo ? M + 66 : M;
  doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.setTextColor(...RED); doc.text('ANWAR CEMENT SHEET', tx, 36);
  doc.setFontSize(17); doc.setTextColor(...INK); doc.text(pdfText(meta.title), tx, 56);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); doc.setTextColor(...MUTED);
  const details = [
    `Payment period: ${meta.period ?? 'All periods'}`, `Scope: ${meta.scope}`,
    ...constant.filter((c) => !(meta.period && c.key === 'period')).map((c) => `${c.header}: ${c.value(rows[0])}`),
    `Generated: ${new Date().toLocaleString('en-GB')} by ${meta.user.name}`,
  ].map(pdfText);
  doc.text(details.join('   |   '), tx, 72, { maxWidth: W - tx - M });

  // Summary strip
  const summary: [string, string][] = [['Records', String(rows.length)], ...(meta.summary ?? []).map(([k, v]) => [k.replace(/^Total /, ''), typeof v === 'number' ? money(v) : String(v)] as [string, string])];
  const boxW = (W - 2 * M) / Math.max(1, summary.length);
  const sy = 92;
  summary.forEach(([k, v], i) => {
    const x = M + i * boxW;
    doc.setFillColor(i === 0 ? 252 : 247, i === 0 ? 235 : 247, i === 0 ? 237 : 248);
    doc.roundedRect(x + (i ? 4 : 0), sy, boxW - 4, 38, 4, 4, 'F');
    doc.setFontSize(7); doc.setTextColor(...MUTED); doc.text(pdfText(k.toUpperCase()), x + (i ? 4 : 0) + 8, sy + 13);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(12); doc.setTextColor(...(i === 0 ? RED : INK)); doc.text(pdfText(v), x + (i ? 4 : 0) + 8, sy + 30);
    doc.setFont('helvetica', 'normal');
  });

  // Table
  autoTable(doc, {
    startY: sy + 50,
    margin: { left: M, right: M, bottom: 34 },
    head: [tableCols.map((c) => pdfText(c.header))],
    body: rows.map((r) => tableCols.map((c) => { const v = c.value(r); return c.money && typeof v === 'number' ? money(v) : pdfText(v ?? ''); })),
    styles: { font: 'helvetica', fontSize: tableCols.length > 12 ? 6.5 : 7.5, cellPadding: 3, textColor: INK, lineColor: [231, 231, 233], lineWidth: 0.4, overflow: 'linebreak', valign: 'middle' },
    headStyles: { fillColor: RED, textColor: [255, 255, 255], fontStyle: 'bold', fontSize: tableCols.length > 12 ? 6.5 : 7.5 },
    alternateRowStyles: { fillColor: [247, 247, 248] },
    columnStyles: Object.fromEntries(tableCols.map((c, i) => [i, c.money ? { halign: 'right' as const } : {}])),
    didParseCell: (d) => {
      // Colour the payment status like the app (green / amber / red)
      if (d.section === 'body' && tableCols[d.column.index]?.key === 'status') {
        const s = String(d.cell.raw);
        d.cell.styles.fontStyle = 'bold';
        d.cell.styles.textColor = s === 'Paid' ? [22, 131, 74] : s === 'Pending' ? [217, 139, 22] : s === 'Failed' ? RED : MUTED;
      }
    },
  });

  // Footer on every page
  const pages = doc.getNumberOfPages();
  for (let p = 1; p <= pages; p++) {
    doc.setPage(p);
    const H = doc.internal.pageSize.getHeight();
    doc.setDrawColor(...RED); doc.setLineWidth(1); doc.line(M, H - 24, W - M, H - 24);
    doc.setFontSize(7.5); doc.setTextColor(...MUTED);
    doc.text('Anwar Cement Sheet · Confidential - for internal use only', M, H - 12);
    doc.text(`Page ${p} of ${pages}`, W - M, H - 12, { align: 'right' });
  }
  return doc;
}

export async function exportPdf<T>(rows: T[], cols: Column<T>[], meta: ExportMeta, fileName: string) {
  const doc = await buildPdf(rows, cols, meta);
  const blob = doc.output('blob');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = fileName; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
