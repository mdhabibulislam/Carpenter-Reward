// Blank bulk-upload template for people & login codes.
// Run: node scripts/make-people-template.mjs → public/templates/ACS_People_and_Login_Codes_Template.xlsx
import ExcelJS from 'exceljs';
import { mkdirSync } from 'node:fs';

const RED = 'FFC8102E', ROWS = 2000;
const wb = new ExcelJS.Workbook();
wb.creator = 'Anwar Cement Sheet · Carpenter Reward Status';
wb.created = new Date('2026-11-08T00:00:00Z');

const ws = wb.addWorksheet('Upload', { views: [{ state: 'frozen', ySplit: 1 }] });
const cols = [
  { header: 'Name', width: 28, note: 'Required. Person\'s full name. An existing person with the same name is updated.' },
  { header: 'Role', width: 10, note: 'SR, ASM, ZSM, DGM or GM.' },
  { header: 'Territory / Area / Zone', width: 46, note: 'SR: territory names · ASM: area names · ZSM/DGM: zone names · GM: leave blank. Several names: separate with ;  Spelling must match the uploaded data (case does not matter).' },
  { header: 'Login Code', width: 18, note: '8–20 letters or numbers, unique. Required for new people; blank keeps the current code.' },
];
ws.columns = cols.map((c) => ({ header: c.header, width: c.width, style: { numFmt: '@' } }));
const head = ws.getRow(1);
head.height = 24;
cols.forEach((c, i) => { const cell = head.getCell(i + 1); cell.font = { bold: true, color: { argb: 'FFFFFFFF' } }; cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: RED } }; cell.alignment = { vertical: 'middle' }; cell.note = c.note; });
for (let r = 2; r <= ROWS + 1; r++) {
  ws.getCell(`B${r}`).dataValidation = { type: 'list', allowBlank: true, formulae: ['"SR,ASM,ZSM,DGM,GM"'], showErrorMessage: true, errorTitle: 'Role', error: 'Choose SR, ASM, ZSM, DGM or GM.' };
  ws.getCell(`D${r}`).dataValidation = { type: 'textLength', operator: 'between', allowBlank: true, formulae: [8, 20], showErrorMessage: true, errorTitle: 'Login code', error: 'Login code must be 8–20 letters or numbers.' };
}

const ins = wb.addWorksheet('Instructions');
ins.getColumn(1).width = 110;
[
  ['ANWAR CEMENT SHEET — People & login codes: bulk upload', { bold: true, size: 14, color: { argb: RED } }],
  [''],
  ['1. One row per person on the "Upload" sheet.'],
  ['2. Role decides what they see: SR → their territories · ASM → their areas · ZSM / DGM → their zones · GM → everything.'],
  ['3. Write the territory / area / zone names exactly as they appear in the disbursement workbook (case and extra spaces do not matter). Separate several names with a semicolon ;'],
  ['   Example (SR): Barura; Hajiganj     Example (ASM): Chandpur     Example (ZSM): Comilla'],
  ['4. Upload in the app: People & login codes → Bulk upload → Upload filled file. Every row is checked first; nothing changes until you press Apply.'],
  [''],
  ['Login codes', { bold: true }],
  ['• 8–20 letters or numbers, not case-sensitive, unique per person. Avoid easy codes such as 12345678.'],
  ['• Codes are stored only as a one-way hash and can never be shown again. If someone forgets theirs, set a new one.'],
  [''],
  ['Security', { bold: true, color: { argb: RED } }],
  ['• This file contains login codes in plain text. Keep it private and DELETE it after uploading.'],
  ['• Super Admins can only be added inside the app.'],
].forEach(([text, font], i) => { const c = ins.getCell(i + 1, 1); c.value = text; if (font) c.font = font; c.alignment = { wrapText: true }; });

mkdirSync('public/templates', { recursive: true });
await wb.xlsx.writeFile('public/templates/ACS_People_and_Login_Codes_Template.xlsx');
console.log('ok');
