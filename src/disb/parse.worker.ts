// Reads the uploaded workbook off the main thread so the page stays responsive (~15 s for 11 MB).
import ExcelJS from 'exceljs';
import { parseWorkbook } from './parseWorkbook';

self.onmessage = async (e: MessageEvent<ArrayBuffer>) => {
  try {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(e.data);
    const result = parseWorkbook(wb);
    (self as unknown as Worker).postMessage({ ok: true, ...result });
  } catch (err) {
    (self as unknown as Worker).postMessage({ ok: false, error: err instanceof Error ? err.message : 'Could not read the file.' });
  }
};
