import { useRef, useState } from 'react';
import { REMOTE } from '../lib/supabase';
import { Link } from 'react-router-dom';
import { CheckCircle2, Download, FileSpreadsheet, Loader2, MinusCircle, ShieldCheck, Upload } from 'lucide-react';
import { useAuth } from '../auth/AuthContext';
import { replaceData, useDisb } from '../disb/store';
import { totals } from '../disb/scope';
import type { Disbursement, SheetReport } from '../disb/types';
import { Button, Card, Eyebrow, PageHeader, toast } from '../components/ui';
import { fmtDateTime, money, num } from '../lib/format';

const MAX_BYTES = 40 * 1024 * 1024;
export const DATA_TEMPLATE_URL = '/templates/ACS_Disbursement_Upload_Template.xlsx';

export default function AdminUpload() {
  const { user } = useAuth();
  const data = useDisb((s) => s.data);
  const fileRef = useRef<HTMLInputElement>(null);
  const [reading, setReading] = useState(false);
  const [preview, setPreview] = useState<{ file: string; rows: Disbursement[]; sheets: SheetReport[] } | null>(null);
  const [saving, setSaving] = useState(false);

  const onFile = async (file?: File) => {
    if (!file) return;
    if (fileRef.current) fileRef.current.value = '';
    if (!/\.xlsx$/i.test(file.name)) return toast.err('Please choose the .xlsx workbook.');
    if (file.size > MAX_BYTES) return toast.err('File is larger than 40 MB.');
    setReading(true); setPreview(null);
    const worker = new Worker(new URL('../disb/parse.worker.ts', import.meta.url), { type: 'module' });
    try {
      const buf = await file.arrayBuffer();
      const res = await new Promise<{ ok: boolean; rows?: Disbursement[]; sheets?: SheetReport[]; error?: string }>((resolve) => {
        worker.onmessage = (e) => resolve(e.data);
        worker.onerror = () => resolve({ ok: false, error: 'Could not read the file.' });
        worker.postMessage(buf, [buf]);
      });
      if (!res.ok) throw new Error(res.error);
      if (!res.rows!.length) throw new Error('No data found. Each month needs its own sheet named like "Oct 2026" (rename the "Month YYYY" sheet in the template), with Territory, Amount and carpenter columns filled in.');
      setPreview({ file: file.name, rows: res.rows!, sheets: res.sheets! });
    } catch (e) { toast.err((e as Error).message); } finally { worker.terminate(); setReading(false); }
  };

  const save = async () => {
    setSaving(true);
    try { await replaceData(user, preview!.rows, preview!.sheets, preview!.file); toast.ok(`${num(preview!.rows.length)} rows saved`); setPreview(null); }
    catch (e) { toast.err((e as Error).message); } finally { setSaving(false); }
  };

  const t = preview ? totals(preview.rows) : null;
  return (
    <>
      <PageHeader demo={false} eyebrow="Super Admin" title="Upload data" subtitle="Upload the Carpenter Reward Disbursement Status workbook. It replaces the current data for everyone." />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card className="p-5">
          <div className="flex items-start gap-3">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-accent-light text-accent"><FileSpreadsheet className="h-5 w-5" /></span>
            <div><h3 className="font-bold">Choose the workbook</h3>
              <p className="text-sm text-muted">Monthly sheets (e.g. "May 2025", "Sep 26") are read: carpenter, territory, area, zone, amount and status. PAID → Paid, RETURN → Return, everything else (including no status) → Pending.</p></div>
          </div>
          <input ref={fileRef} type="file" accept=".xlsx" hidden onChange={(e) => onFile(e.target.files?.[0])} />
          <div className="mt-4 flex flex-wrap gap-2">
            <a href={DATA_TEMPLATE_URL} download className="inline-flex h-11 items-center gap-2 rounded-[var(--radius)] border border-line bg-white px-4 text-[15px] font-medium hover:bg-surface md:h-10 md:text-sm"><Download className="h-4 w-4" />Blank template</a>
            <Button variant="primary" icon={reading ? Loader2 : Upload} disabled={reading} onClick={() => fileRef.current?.click()}>
              {reading ? 'Reading… (about 15–30 seconds)' : 'Choose .xlsx file'}
            </Button>
          </div>
          <p className="mt-3 text-xs text-muted">Use the blank template (one sheet per month, named like "Oct 2026") or upload your existing disbursement workbook as it is.</p>
          <p className="mt-3 flex items-start gap-2 text-xs text-muted"><ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0" />{REMOTE ? 'The file is read in this browser; only the rows are saved to your private GitHub data repo.' : 'The file is read in this browser and saved only on this computer. Nothing is sent anywhere.'}</p>
        </Card>
        <Card className="p-5">
          <Eyebrow>Current data</Eyebrow>
          {data ? (
            <dl className="mt-3 grid grid-cols-2 gap-3 text-sm">
              <div><dt className="text-muted">File</dt><dd className="font-medium break-all">{data.fileName}</dd></div>
              <div><dt className="text-muted">Uploaded</dt><dd className="font-medium">{fmtDateTime(data.uploadedAt)} · {data.uploadedBy}</dd></div>
              <div><dt className="text-muted">Rows</dt><dd className="font-medium">{num(data.rows.length)}</dd></div>
              <div><dt className="text-muted">Months</dt><dd className="font-medium">{data.sheets.filter((s) => s.used).length}</dd></div>
            </dl>
          ) : <p className="mt-3 text-sm text-muted">Nothing uploaded yet.</p>}
          {data && <Link to="/" className="mt-4 inline-block text-sm font-medium text-accent hover:underline">View the data →</Link>}
        </Card>
      </div>

      {preview && t && (
        <Card className="mt-6">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-4">
            <div>
              <h3 className="font-bold">Check before saving: {preview.file}</h3>
              {preview.sheets.some((x) => x.noTerritory) && <p className="mb-1 text-sm font-medium text-warning">⚠ {num(preview.sheets.reduce((n, x) => n + (x.noTerritory ?? 0), 0))} rows have no Territory — see the months below.</p>}
              <p className="text-sm text-muted">{num(preview.rows.length)} rows · Paid <b className="text-success">{money(t.paid)}</b> · Return <b className="text-accent">{money(t.ret)}</b> · Pending <b className="text-warning">{money(t.pending)}</b></p>
            </div>
            <div className="flex gap-2"><Button onClick={() => setPreview(null)}>Cancel</Button><Button variant="primary" loading={saving} onClick={save}>Replace data with this file</Button></div>
          </div>
          <ul className="divide-y divide-line">
            {preview.sheets.map((s) => (
              <li key={s.sheet} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-5 py-2.5 text-sm">
                {s.used ? <CheckCircle2 className="h-4 w-4 text-success" /> : <MinusCircle className="h-4 w-4 text-muted" />}
                <span className="sm:min-w-[160px] font-medium">{s.sheet}</span>
                {s.used ? (<>
                  <span className="font-mono text-xs text-muted">{num(s.rows)} rows{s.skippedRows ? ` · ${s.skippedRows} skipped` : ''}</span>
                  <span className="text-success">{money(s.paid)}</span><span className="text-accent">{money(s.ret)}</span><span className="text-warning">{money(s.pending)}</span>
                  {!!s.noTerritory && <span className="basis-full rounded-md bg-warning/10 px-2 py-1 text-[12.5px] text-warning">⚠ {num(s.noTerritory)} row{s.noTerritory === 1 ? ' has' : 's have'} no Territory — included in the totals for Super Admin and GM, but SRs and managers will not see {s.noTerritory === 1 ? 'it' : 'them'}. Fill the Territory column to fix.</span>}
                </>) : <span className="text-muted">Not used — {s.reason}</span>}
              </li>
            ))}
          </ul>
        </Card>
      )}
    </>
  );
}
