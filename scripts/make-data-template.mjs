// Blank workbook for Super Admin's "Upload data".
// Run: node scripts/make-data-template.mjs → public/templates/ACS_Disbursement_Upload_Template.xlsx
import ExcelJS from 'exceljs';
import { mkdirSync } from 'node:fs';

const RED = 'FFC8102E', ROWS = 20000;
const wb = new ExcelJS.Workbook();
wb.creator = 'Anwar Cement Sheet · Carpenter Reward Status';
wb.created = new Date('2026-11-08T00:00:00Z');

const cols = [
  { header: 'Carpenter ID', width: 14, fmt: '@', note: 'Carpenter / influencer ID. Required if Carpenter Name is empty.' },
  { header: 'Carpenter Name', width: 28, fmt: '@', note: 'Required if Carpenter ID is empty.' },
  { header: 'bKash Number', width: 16, fmt: '@', note: 'e.g. 8801XXXXXXXXX. Kept as text so no digits are lost.' },
  { header: 'Territory', width: 20, fmt: '@', note: 'Required. Exact territory name — SRs are matched on this. Several: separate with a comma.' },
  { header: 'Area', width: 16, fmt: '@', note: 'Area name — ASMs are matched on this.' },
  { header: 'Zone', width: 16, fmt: '@', note: 'Zone name — ZSMs / DGMs are matched on this ("Comilla" and "Comilla Zone" are treated the same).' },
  { header: 'Amount', width: 12, fmt: '#,##0.00', note: 'Required. Reward amount in Taka (numbers only).' },
  { header: 'Disbursement Date', width: 18, fmt: 'dd-mmm-yyyy', note: 'Optional. Date the payment was sent.' },
  { header: 'Status', width: 12, fmt: '@', note: 'PAID, RETURN or PENDING. Blank also counts as Pending.' },
];

function monthSheet(name) {
  const ws = wb.addWorksheet(name, { views: [{ state: 'frozen', ySplit: 1 }] });
  ws.columns = cols.map((c) => ({ header: c.header, width: c.width, style: { numFmt: c.fmt } }));
  const head = ws.getRow(1);
  head.height = 24;
  cols.forEach((c, i) => {
    const cell = head.getCell(i + 1);
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: RED } };
    cell.alignment = { vertical: 'middle' };
    cell.note = c.note;
  });
  ws.dataValidations.add(`I2:I${ROWS + 1}`, { type: 'list', allowBlank: true, formulae: ['"PAID,RETURN,PENDING"'], showErrorMessage: true, errorTitle: 'Status', error: 'Choose PAID, RETURN or PENDING (or leave blank for Pending).' });
  ws.dataValidations.add(`G2:G${ROWS + 1}`, { type: 'decimal', operator: 'greaterThanOrEqual', allowBlank: true, formulae: [0], showErrorMessage: true, errorTitle: 'Amount', error: 'Amount must be a number of 0 or more.' });
  ws.autoFilter = { from: 'A1', to: 'I1' };
}

// Instructions first so it opens on top; the app ignores sheets whose name is not a month
const ins = wb.addWorksheet('Instructions');
ins.getColumn(1).width = 110;
[
  ['ANWAR CEMENT SHEET — Carpenter reward data: upload template', { bold: true, size: 14, color: { argb: RED } }],
  [''],
  ['How to use', { bold: true }],
  ['1. Use one sheet per month. Rename the sheet "Month YYYY" to the real month, e.g. "Oct 2026", "November 2026" or "Nov 26".'],
  ['   For more months: right-click the sheet tab → Move or Copy → Create a copy, then rename it.'],
  ['2. Fill one row per carpenter payment. Keep the column headings in row 1 exactly as they are.'],
  ['3. Status: PAID = paid · RETURN = returned by bKash · PENDING (or blank) = not paid yet.'],
  ['4. In the app: Upload data → Choose .xlsx file. Every month is checked and shown first; press "Replace data" to save.'],
  [''],
  ['Rules', { bold: true }],
  ['• Each row needs Territory, Amount, and a Carpenter ID or Name — rows without these are skipped and counted.'],
  ['• Territory / Area / Zone names must match the names used when assigning people (case and extra spaces do not matter).'],
  ['• A sheet whose name is not a month (like this "Instructions" sheet) is ignored.'],
  ['• Uploading replaces ALL current data, so the file should contain every month you want people to see.'],
  [''],
  ['Your existing workbook ("Carpenter Reward Disbursement Status") can also be uploaded as it is — its monthly sheets are read automatically.', { italic: true }],
].forEach(([text, font], i) => { const c = ins.getCell(i + 1, 1); c.value = text; if (font) c.font = font; c.alignment = { wrapText: true }; });

monthSheet('Month YYYY');

mkdirSync('public/templates', { recursive: true });
await wb.xlsx.writeFile('public/templates/ACS_Disbursement_Upload_Template.xlsx');
console.log('ok');
