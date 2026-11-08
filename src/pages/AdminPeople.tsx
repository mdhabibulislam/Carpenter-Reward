import { useMemo, useRef, useState } from 'react';
import { BadgeCheck, CheckCircle2, Copy, Download, FileSpreadsheet, KeyRound, RefreshCw, ShieldCheck, Trash2, Upload, UserPlus, X, XCircle } from 'lucide-react';
import { useAuth } from '../auth/AuthContext';
import { addPerson, applyPeopleRows, checkPeopleRows, deletePerson, setPersonActive, setPersonCode, updatePerson, useDisb, type PeopleCheck, type PeopleRow } from '../disb/store';
import { namesByLevel } from '../disb/scope';
import { SCOPE_LEVEL, type Person } from '../disb/types';
import { readSheet } from '../services/importer';
import { CODE_RULE, generateCode, validateCode } from '../lib/codes';
import { Button, Card, Eyebrow, Field, Modal, PageHeader, SearchInput, Select, inputCls, toast } from '../components/ui';
import { DataTable } from '../components/ui/DataTable';
import { cn, fmtDate } from '../lib/format';
import { DESIGNATION, ROLE_LABEL, ROLE_ORDER, type Role } from '../types';

export const PEOPLE_TEMPLATE_URL = '/templates/ACS_People_and_Login_Codes_Template.xlsx';
const LEVEL_WORD = { territory: 'territories', area: 'areas', zone: 'zones', all: '' } as const;

function OneTimeCode({ code, who, onDone }: { code: string; who: string; onDone: () => void }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="space-y-4">
      <p className="text-sm">Login code for <b>{who}</b>:</p>
      <div className="flex items-center gap-2 rounded-lg border border-accent/30 bg-accent-light/50 p-3">
        <span className="flex-1 select-all font-mono text-[22px] font-bold tracking-[0.2em]">{code}</span>
        <Button size="sm" icon={Copy} onClick={async () => { try { await navigator.clipboard.writeText(code); setCopied(true); } catch { toast.err('Copy failed — select the code and copy it.'); } }}>{copied ? 'Copied' : 'Copy'}</Button>
      </div>
      <p className="flex items-start gap-2 text-xs text-muted"><ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />Give it to the person privately. It is stored only as a one-way hash and cannot be shown again.</p>
      <Button variant="primary" className="w-full" onClick={onDone}>Done</Button>
    </div>
  );
}

/** Pick territory / area / zone names that exist in the uploaded data. */
function ScopePicker({ options, value, onChange, word }: { options: string[]; value: string[]; onChange: (v: string[]) => void; word: string }) {
  const [q, setQ] = useState('');
  const shown = useMemo(() => { const s = q.trim().toLowerCase(); return options.filter((o) => !value.includes(o) && (!s || o.toLowerCase().includes(s))).slice(0, 40); }, [options, value, q]);
  return (
    <div className="space-y-2">
      {value.length > 0 && <div className="flex flex-wrap gap-1.5">{value.map((v) => (
        <span key={v} className="inline-flex items-center gap-1 rounded-full bg-accent-light px-2.5 py-1 text-[13px] text-accent-dark">{v}
          <button type="button" aria-label={`Remove ${v}`} onClick={() => onChange(value.filter((x) => x !== v))} className="rounded-full p-0.5 hover:bg-accent/10"><X className="h-3.5 w-3.5" /></button></span>))}</div>}
      <SearchInput value={q} onChange={setQ} placeholder={`Search ${word}…`} />
      <ul className="max-h-48 overflow-y-auto rounded-lg border border-line">
        {shown.map((o) => <li key={o}><button type="button" onClick={() => { onChange([...value, o]); setQ(''); }} className="flex min-h-[40px] w-full items-center px-3 text-left text-sm hover:bg-surface">{o}</button></li>)}
        {!shown.length && <li className="px-3 py-2 text-sm text-muted">{options.length ? 'No match' : 'Upload data first to choose names.'}</li>}
      </ul>
    </div>
  );
}

function PersonModal({ person, onClose }: { person: Person | 'new' | null; onClose: () => void }) {
  const { user } = useAuth();
  const data = useDisb((s) => s.data);
  const names = useMemo(() => (data ? namesByLevel(data.rows) : { zone: [], area: [], territory: [] }), [data]);
  const isNew = person === 'new';
  const p = isNew ? null : person;
  const [name, setName] = useState(p?.name ?? '');
  const [role, setRole] = useState<Role>(p?.role ?? 'sr');
  const [scope, setScope] = useState<string[]>(p?.scope ?? []);
  const [code, setCode] = useState(() => (isNew ? generateCode() : ''));
  const [shown, setShown] = useState<{ code: string; who: string } | null>(null);
  const level = SCOPE_LEVEL[role];

  const save = async () => {
    try {
      if (isNew) { await addPerson(user, { name, role, scope, code }); setShown({ code: code.replace(/[\s-]/g, '').toUpperCase(), who: name.trim() }); }
      else {
        await updatePerson(user, p!.id, { name, role, scope });
        if (code.trim()) setShown({ code: await setPersonCode(user, p!.id, code), who: name.trim() });
        else { toast.ok('Saved'); onClose(); }
      }
    } catch (e) { toast.err((e as Error).message); }
  };
  const act = async (fn: () => Promise<void>, msg: string) => { try { await fn(); toast.ok(msg); onClose(); } catch (e) { toast.err((e as Error).message); } };

  return (
    <Modal open={!!person} onClose={onClose} title={shown ? 'Login code set' : isNew ? 'Add person' : `Edit ${p?.name}`}
      footer={shown ? undefined : <><Button onClick={onClose}>Cancel</Button><Button variant="primary" onClick={save}>Save</Button></>}>
      {shown ? <OneTimeCode code={shown.code} who={shown.who} onDone={onClose} /> : (
        <div className="space-y-4">
          <Field label="Name"><input className={inputCls} value={name} maxLength={80} onChange={(e) => setName(e.target.value)} /></Field>
          <Field label="Role">
            <select className={inputCls} value={role} onChange={(e) => { setRole(e.target.value as Role); setScope([]); }}>
              {ROLE_ORDER.filter((r) => r !== 'super_admin' || p?.role === 'super_admin' || isNew).map((r) => <option key={r} value={r}>{DESIGNATION[r]}</option>)}
            </select>
          </Field>
          {level !== 'all' ? (
            <Field label={`${ROLE_LABEL[role]} sees these ${LEVEL_WORD[level]}`}><ScopePicker options={names[level]} value={scope} onChange={setScope} word={LEVEL_WORD[level]} /></Field>
          ) : <p className="rounded-lg bg-surface px-3 py-2 text-sm text-muted">{ROLE_LABEL[role]} sees all territories.</p>}
          <Field label={isNew ? 'Login code' : 'New login code (leave blank to keep the current one)'} hint={code && validateCode(code) ? validateCode(code)! : CODE_RULE}>
            <div className="flex gap-2">
              <input className={`${inputCls} font-mono uppercase tracking-[0.15em]`} value={code} maxLength={24} autoComplete="off" spellCheck={false} onChange={(e) => setCode(e.target.value)} />
              <Button icon={RefreshCw} onClick={() => setCode(generateCode())}>New</Button>
            </div>
          </Field>
          {!isNew && p && p.id !== user!.id && (
            <div className="flex flex-wrap gap-2 border-t border-line pt-4">
              <Button size="sm" onClick={() => act(() => setPersonActive(user, p.id, !p.active), p.active ? 'Deactivated — they can no longer sign in' : 'Activated')}>{p.active ? 'Deactivate' : 'Activate'}</Button>
              <Button size="sm" variant="danger" icon={Trash2} onClick={() => { if (confirm(`Delete ${p.name}? They will no longer be able to sign in. This cannot be undone.`)) act(() => deletePerson(user, p.id), 'Deleted'); }}>Delete</Button>
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}

function BulkPeople() {
  const { user } = useAuth();
  const fileRef = useRef<HTMLInputElement>(null);
  const [rows, setRows] = useState<PeopleRow[] | null>(null);
  const [checks, setChecks] = useState<PeopleCheck[] | null>(null);
  const [done, setDone] = useState(false);
  const onFile = async (file?: File) => {
    if (!file) return;
    if (fileRef.current) fileRef.current.value = '';
    try {
      const raw = await readSheet(file);
      if (!raw.length || !('name' in raw[0]) || !('role' in raw[0])) throw new Error('This is not the people template. Download the blank template and fill it in.');
      const parsed: PeopleRow[] = raw.map((r, i) => ({ row: i + 2, name: r.name ?? '', role: r.role ?? '', scope: r.territory_area_zone ?? r.territories_areas_zones ?? '', code: r.login_code ?? '' }))
        .filter((r) => Object.values(r).some((v) => typeof v === 'string' && v.trim()));
      if (!parsed.length) throw new Error('The file has no filled-in rows.');
      if (parsed.length > 2000) throw new Error('Up to 2,000 rows per upload.');
      setRows(parsed); setChecks(checkPeopleRows(user, parsed)); setDone(false);
    } catch (e) { toast.err((e as Error).message); }
  };
  const apply = async () => {
    try { const res = await applyPeopleRows(user, rows!); setChecks(res); setDone(true); toast.ok(`${res.filter((r) => !r.error).length} people saved`); }
    catch (e) { toast.err((e as Error).message); }
  };
  const valid = checks?.filter((c) => !c.error).length ?? 0;
  return (
    <Card className="p-5">
      <div className="flex items-start gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-accent-light text-accent"><FileSpreadsheet className="h-5 w-5" /></span>
        <div><h3 className="font-bold">Bulk upload (Excel)</h3><p className="text-sm text-muted">Add or update many people at once: name, role, territories/areas/zones and login code.</p></div>
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        <a href={PEOPLE_TEMPLATE_URL} download className="inline-flex h-11 items-center gap-2 rounded-[var(--radius)] border border-line bg-white px-4 text-[15px] font-medium hover:bg-surface md:h-10 md:text-sm"><Download className="h-4 w-4" />Blank template</a>
        <input ref={fileRef} type="file" accept=".xlsx,.csv" hidden onChange={(e) => onFile(e.target.files?.[0])} />
        <Button variant="primary" icon={Upload} onClick={() => fileRef.current?.click()}>Upload filled file</Button>
      </div>
      <p className="mt-3 flex items-start gap-2 text-xs text-muted"><ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0" />The filled file has login codes in plain text — delete it after uploading.</p>
      {checks && (
        <div className="mt-4 rounded-lg border border-line">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-3">
            <Eyebrow>{done ? `${valid} saved · ${checks.length - valid} skipped` : `${valid} ready · ${checks.length - valid} with problems`}</Eyebrow>
            {!done ? <div className="flex gap-2"><Button size="sm" onClick={() => setChecks(null)}>Cancel</Button><Button size="sm" variant="primary" disabled={!valid} onClick={apply}>Apply {valid} row{valid === 1 ? '' : 's'}</Button></div>
              : <Button size="sm" onClick={() => setChecks(null)}>Close</Button>}
          </div>
          <ul className="max-h-[50vh] divide-y divide-line overflow-y-auto">
            {checks.map((c) => (
              <li key={c.row} className="flex items-start gap-3 px-4 py-2.5 text-sm">
                {c.error ? <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-accent" /> : <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" />}
                <div className="min-w-0"><p><span className="font-mono text-xs text-muted">Row {c.row}</span> · <b>{c.name}</b>{c.action && <span className="text-muted"> · {c.action === 'add' ? 'new' : 'update'}</span>}</p>
                  <p className={cn('text-[13px]', c.error ? 'text-accent' : 'text-muted')}>{c.error ?? c.detail}</p></div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Card>
  );
}

export default function AdminPeople() {
  const people = useDisb((s) => s.people);
  const [q, setQ] = useState('');
  const [role, setRole] = useState('');
  const [edit, setEdit] = useState<Person | 'new' | null>(null);
  const rows = useMemo(() => {
    const s = q.trim().toLowerCase();
    return people.filter((p) => (!role || p.role === role) && (!s || p.name.toLowerCase().includes(s) || p.scope.some((x) => x.toLowerCase().includes(s))))
      .sort((a, b) => ROLE_ORDER.indexOf(a.role) - ROLE_ORDER.indexOf(b.role) || a.name.localeCompare(b.name));
  }, [people, q, role]);
  const noCode = people.filter((p) => p.active && !p.codeHash).length;

  return (
    <>
      <PageHeader demo={false} eyebrow={`Super Admin · ${people.length} people`} title="People & login codes" subtitle="Who can sign in, their role, and which territories, areas or zones they see."
        actions={<Button variant="primary" icon={UserPlus} onClick={() => setEdit('new')}>Add person</Button>} />
      {noCode > 0 && <p className="mb-4 rounded-lg border border-warning/30 bg-warning/10 px-4 py-3 text-sm text-warning">{noCode} active {noCode === 1 ? 'person has' : 'people have'} no login code and cannot sign in.</p>}
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <Card>
          <div className="flex flex-wrap gap-2 border-b border-line p-3 md:p-4">
            <SearchInput value={q} onChange={setQ} placeholder="Search name or territory…" className="w-full sm:w-auto sm:min-w-[200px] flex-1" />
            <Select value={role} onChange={setRole} options={[{ value: '', label: 'All roles' }, ...ROLE_ORDER.map((r) => ({ value: r, label: DESIGNATION[r] }))]} />
          </div>
          <DataTable rows={rows} rowKey={(p) => p.id} pageSize={20} onRowClick={setEdit} mobileTitle={(p) => p.name} empty="No people yet — add someone or upload the template"
            cols={[
              { key: 'n', header: 'Name', render: (p) => <span className={cn('font-medium', !p.active && 'text-muted line-through')}>{p.name}</span>, sort: (p) => p.name },
              { key: 'r', header: 'Role', render: (p) => ROLE_LABEL[p.role], sort: (p) => ROLE_ORDER.indexOf(p.role), mobile: true },
              { key: 's', header: 'Sees', render: (p) => <span className="block max-w-[280px] truncate text-muted">{p.scope.length ? p.scope.join(', ') : 'Everything'}</span>, mobile: true },
              { key: 'c', header: 'Login code', render: (p) => (p.codeHash ? <span className="inline-flex items-center gap-1 text-[12.5px] text-success"><BadgeCheck className="h-3.5 w-3.5" />Set {fmtDate(p.codeSetAt)}</span> : <span className="inline-flex items-center gap-1 text-[12.5px] text-warning"><KeyRound className="h-3.5 w-3.5" />Not set</span>), mobile: true },
            ]} />
        </Card>
        <BulkPeople />
      </div>
      <PersonModal key={edit === 'new' ? 'new' : edit?.id ?? 'none'} person={edit} onClose={() => setEdit(null)} />
    </>
  );
}
