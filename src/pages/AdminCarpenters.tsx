import { useRef, useState } from 'react';
import { REMOTE } from '../lib/supabase';
import { Link } from 'react-router-dom';
import { Download, Loader2, RefreshCcw, ShieldCheck, Upload, Users } from 'lucide-react';
import { useAuth } from '../auth/AuthContext';
import { replaceCarpenterList, useDisb } from '../disb/store';
import { matchReturns, parseCarpenterList, type ListEntry, type ListReadReport } from '../disb/carpenterList';
import { Button, Card, Eyebrow, PageHeader, toast } from '../components/ui';
import { fmtDateTime, money, num } from '../lib/format';

export const LIST_TEMPLATE_URL = '/templates/ACS_Carpenter_List_Template.xlsx';
const MAX_BYTES = 40 * 1024 * 1024;

/** Simple CSV → rows (handles quoted cells). */
function csvRows(text: string) {
  return text.replace(/^﻿/, '').split(/\r?\n/).filter((l) => l.trim()).map((l) => (l.match(/("([^"]|"")*"|[^,]*)(,|$)/g) ?? []).map((c) => c.replace(/,$/, '').replace(/^"|"$/g, '').replace(/""/g, '"')).slice(0, -1));
}

export default function AdminCarpenters() {
  const { user } = useAuth();
  const data = useDisb((s) => s.data);
  const current = useDisb((s) => s.carpenterList);
  const fileRef = useRef<HTMLInputElement>(null);
  const [reading, setReading] = useState(false);
  const [preview, setPreview] = useState<{ file: string; entries: ListEntry[]; report: ListReadReport } | null>(null);
  const [saving, setSaving] = useState(false);

  const onFile = async (file?: File) => {
    if (!file) return;
    if (fileRef.current) fileRef.current.value = '';
    if (!/\.(xlsx|csv)$/i.test(file.name)) return toast.err('Please choose an .xlsx or .csv file.');
    if (file.size > MAX_BYTES) return toast.err('File is larger than 40 MB.');
    setReading(true); setPreview(null);
    try {
      const ExcelJS = (await import('exceljs')).default;
      const wb = new ExcelJS.Workbook();
      if (/\.csv$/i.test(file.name)) { const ws = wb.addWorksheet('List'); csvRows(await file.text()).forEach((r, i) => { ws.getRow(i + 1).values = r; }); }
      else await wb.xlsx.load(await file.arrayBuffer());
      const { entries, report } = parseCarpenterList(wb);
      if (!entries.length) throw new Error(`No usable rows: ${report.badNumber} had an invalid bKash number and ${report.noId} had no Carpenter ID.`);
      setPreview({ file: file.name, entries, report });
    } catch (e) { toast.err((e as Error).message); } finally { setReading(false); }
  };

  const save = async () => {
    setSaving(true);
    try { await replaceCarpenterList(user, preview!.entries, preview!.file); toast.ok(`${num(preview!.entries.length)} carpenters saved`); setPreview(null); }
    catch (e) { toast.err((e as Error).message); } finally { setSaving(false); }
  };

  const m = preview && data ? matchReturns(data.rows, preview.entries) : null;
  const sum = (a: { amount: number }[]) => a.reduce((s, x) => s + x.amount, 0);
  return (
    <>
      <PageHeader demo={false} eyebrow="Super Admin" title="New carpenter list" subtitle="Upload the latest carpenter list with bKash numbers. Returned payments whose carpenter now has a different, valid number become “Ready to disburse again”." />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card className="p-5">
          <div className="flex items-start gap-3">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-accent-light text-accent"><Users className="h-5 w-5" /></span>
            <div><h3 className="font-bold">Upload the list</h3>
              <p className="text-sm text-muted">Needs a <b>Carpenter ID</b> column and a <b>bKash number</b> column (a “New bKash Number” column is used first if present). Bengali headings like নতুন বিকাশ নম্বর also work.</p></div>
          </div>
          <input ref={fileRef} type="file" accept=".xlsx,.csv" hidden onChange={(e) => onFile(e.target.files?.[0])} />
          <div className="mt-4 flex flex-wrap gap-2">
            <a href={LIST_TEMPLATE_URL} download className="inline-flex h-11 items-center gap-2 rounded-[var(--radius)] border border-line bg-white px-4 text-[15px] font-medium hover:bg-surface md:h-10 md:text-sm"><Download className="h-4 w-4" />Blank template</a>
            <Button variant="primary" icon={reading ? Loader2 : Upload} disabled={reading || !data} onClick={() => fileRef.current?.click()}>{reading ? 'Reading…' : 'Choose file'}</Button>
          </div>
          {!data && <p className="mt-3 text-sm text-warning">Upload the disbursement data first — the list is matched against it.</p>}
          <p className="mt-3 flex items-start gap-2 text-xs text-muted"><ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0" />{REMOTE ? 'Read in this browser, then saved to your private GitHub data repo.' : 'Read in this browser and saved only on this computer.'}</p>
        </Card>
        <Card className="p-5">
          <Eyebrow>Current list</Eyebrow>
          {current ? (
            <dl className="mt-3 grid grid-cols-2 gap-3 text-sm">
              <div><dt className="text-muted">File</dt><dd className="font-medium break-all">{current.fileName}</dd></div>
              <div><dt className="text-muted">Uploaded</dt><dd className="font-medium">{fmtDateTime(current.uploadedAt)} · {current.uploadedBy}</dd></div>
              <div><dt className="text-muted">Carpenters</dt><dd className="font-medium">{num(current.entries.length)}</dd></div>
              {data && <div><dt className="text-muted">Ready to disburse again</dt><dd className="font-medium text-success">{num(matchReturns(data.rows, current.entries).ready.length)}</dd></div>}
            </dl>
          ) : <p className="mt-3 text-sm text-muted">No list uploaded yet.</p>}
          {current && <Link to="/admin/ready" className="mt-4 inline-block text-sm font-medium text-accent hover:underline">Open “Ready to disburse again” →</Link>}
        </Card>
      </div>

      {preview && m && (
        <Card className="mt-6">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-4">
            <div>
              <h3 className="font-bold">Check before saving: {preview.file}</h3>
              <p className="text-sm text-muted">Sheet “{preview.report.sheet}” · {num(preview.report.rows)} rows · {num(preview.entries.length)} carpenters with a valid number
                {preview.report.badNumber ? ` · ${num(preview.report.badNumber)} invalid numbers skipped` : ''}{preview.report.noId ? ` · ${num(preview.report.noId)} without ID skipped` : ''}{preview.report.duplicates ? ` · ${num(preview.report.duplicates)} repeated IDs (last row used)` : ''}</p>
            </div>
            <div className="flex gap-2"><Button onClick={() => setPreview(null)}>Cancel</Button><Button variant="primary" loading={saving} onClick={save}>Save this list</Button></div>
          </div>
          <dl className="grid grid-cols-1 divide-y divide-line sm:grid-cols-4 sm:divide-x sm:divide-y-0">
            <div className="p-5"><dt className="flex items-center gap-2 text-sm text-muted"><RefreshCcw className="h-4 w-4 text-success" />Ready to disburse again</dt><dd className="mt-1 font-display text-2xl font-extrabold text-success">{num(m.ready.length)}</dd><dd className="text-sm text-muted">{money(sum(m.ready))}</dd></div>
            <div className="p-5"><dt className="text-sm text-muted">Still the same number</dt><dd className="mt-1 font-display text-2xl font-extrabold text-warning">{num(m.sameNumber.length)}</dd><dd className="text-sm text-muted">{money(sum(m.sameNumber))} — need a new number</dd></div>
            <div className="p-5"><dt className="text-sm text-muted">Already re-paid</dt><dd className="mt-1 font-display text-2xl font-extrabold">{num(m.alreadyRepaid)}</dd><dd className="text-sm text-muted">to the new number</dd></div>
            <div className="p-5"><dt className="text-sm text-muted">Returned, not in list</dt><dd className="mt-1 font-display text-2xl font-extrabold text-muted">{num(m.notInList)}</dd><dd className="text-sm text-muted">no new number yet</dd></div>
          </dl>
        </Card>
      )}
    </>
  );
}
