// Blank "New carpenter list" template (updated bKash numbers).
// Run: node scripts/make-list-template.mjs → public/templates/ACS_Carpenter_List_Template.xlsx
import ExcelJS from 'exceljs';
import { mkdirSync } from 'node:fs';

const RED = 'FFC8102E', ROWS = 20000;
const wb = new ExcelJS.Workbook();
wb.creator = 'Anwar Cement Sheet · Carpenter Reward Status';
wb.created = new Date('2026-11-08T00:00:00Z');

const ws = wb.addWorksheet('Carpenter List', { views: [{ state: 'frozen', ySplit: 1 }] });
const cols = [
  { header: 'Carpenter ID', width: 14, note: 'Required. Same ID as in the disbursement file — this is how carpenters are matched.' },
  { header: 'Carpenter Name', width: 28, note: 'Optional, for reference.' },
  { header: 'New bKash Number', width: 18, note: 'Required. The carpenter\'s current bKash number, e.g. 01712345678 or 8801712345678.' },
  { header: 'Territory', width: 20, note: 'Optional, for reference.' },
];
ws.columns = cols.map((c) => ({ header: c.header, width: c.width, style: { numFmt: '@' } }));
const head = ws.getRow(1);
head.height = 24;
cols.forEach((c, i) => { const cell = head.getCell(i + 1); cell.font = { bold: true, color: { argb: 'FFFFFFFF' } }; cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: RED } }; cell.alignment = { vertical: 'middle' }; cell.note = c.note; });
ws.dataValidations.add(`C2:C${ROWS + 1}`, { type: 'textLength', operator: 'between', allowBlank: true, formulae: [10, 14], showErrorMessage: true, errorTitle: 'bKash number', error: 'Enter an 11-digit number like 01712345678 (or 8801712345678).' });

const ins = wb.addWorksheet('Instructions');
ins.getColumn(1).width = 110;
[
  ['ANWAR CEMENT SHEET — New carpenter list (updated bKash numbers)', { bold: true, size: 14, color: { argb: RED } }],
  [''],
  ['1. One row per carpenter: Carpenter ID and their current (new) bKash number.'],
  ['2. In the app: New carpenter list → Choose file. A summary is shown first; press "Save this list".'],
  ['3. The app compares the list with RETURNED payments in the disbursement data:'],
  ['   • New, different, valid number → "Ready to disburse again" (amount and months are shown).'],
  ['   • Same number as the one that was returned → "Same number" — still needs a new number.'],
  ['   • Already paid later to the new number → not shown again.'],
  [''],
  ['• Numbers are compared on their last 10 digits: 01712345678, 8801712345678 and +880 1712-345678 are the same.'],
  ['• If a Carpenter ID appears twice, the last row is used. Rows with an invalid number are skipped and counted.'],
  ['• Each upload replaces the previous list.'],
].forEach(([text, font], i) => { const c = ins.getCell(i + 1, 1); c.value = text; if (font) c.font = font; c.alignment = { wrapText: true }; });

mkdirSync('public/templates', { recursive: true });
await wb.xlsx.writeFile('public/templates/ACS_Carpenter_List_Template.xlsx');
console.log('ok');
