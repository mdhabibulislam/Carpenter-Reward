// App state: the uploaded disbursement data + people who can sign in.
// Deployed: saved by the /api server in a private GitHub repo (REMOTE). Local dev: IndexedDB in this browser.
import { useSyncExternalStore } from 'react';
import type { Role } from '../types';
import { ROLE_LABEL } from '../types';
import type { DataSet, Disbursement, Person, SheetReport } from './types';
import { SCOPE_LEVEL } from './types';
import { kvGet, kvSet } from './db';
import { hashCode as localHash, normaliseCode, validateCode } from '../lib/codes';
import { REMOTE } from '../lib/supabase';
import { apiGz, apiJson, gzipJson, setToken, getToken, toBase64, ApiError } from '../lib/api';

/** Remote: the server hashes codes with its secret; the browser only marks a new code for it. */
const hashCode = (raw: string) => (REMOTE ? `new:${normaliseCode(raw)}` : localHash(raw));
import { nameKey, namesByLevel } from './scope';
import type { CarpenterList, ListEntry } from './carpenterList';

interface State { ready: boolean; data: DataSet | null; people: Person[]; carpenterList: CarpenterList | null; setup: boolean; meId: string | null; loadError: string | null }
let state: State = { ready: false, data: null, people: [], carpenterList: null, setup: false, meId: null, loadError: null };
const listeners = new Set<() => void>();
const set = (p: Partial<State>) => { state = { ...state, ...p }; listeners.forEach((l) => l()); };
export const getState = () => state;
export function useDisb<T>(sel: (s: State) => T): T {
  return useSyncExternalStore((l) => (listeners.add(l), () => listeners.delete(l)), () => sel(state));
}

let loading: Promise<void> | null = null;
/** Load saved data once at startup. */
export function initStore() {
  loading ??= (async () => {
    if (REMOTE) {
      try {
        const st = await apiJson<{ setup: boolean }>('status');
        set({ setup: st.setup });
        if (getToken()) await loadSession();
      } catch (e) { set({ loadError: (e as Error).message }); }
      set({ ready: true });
      return;
    }
    const [data, people, carpenterList] = await Promise.all([kvGet<DataSet>('data'), kvGet<Person[]>('people'), kvGet<CarpenterList>('carpenterList')]);
    set({ ready: true, data: data ?? null, people: people ?? [], carpenterList: carpenterList ?? null });
  })();
  return loading;
}

/** Remote: load the signed-in person, their rows, and (Super Admin) people + carpenter list. */
async function loadSession() {
  try {
    const me = await apiJson<{ user: Person; people: Person[]; carpenterList: CarpenterList | null }>('me');
    set({ meId: me.user.id, people: me.people, carpenterList: me.carpenterList });
    const data = await apiGz<Omit<DataSet, 'rows'> & { rows: Disbursement[] }>('data');
    set({ data: data ?? null, loadError: null });
  } catch (e) {
    if (e instanceof ApiError && e.status === 401) { setToken(null); set({ meId: null, people: [] }); return; }
    set({ loadError: (e as Error).message });
  }
}

/** Remote sign-in: the server checks the code. Returns the person. */
export async function remoteSignIn(code: string) {
  const r = await apiJson<{ token: string; user: Person }>('login', 'POST', { code });
  setToken(r.token);
  await loadSession();
  return r.user;
}
export const remoteSignOut = () => setToken(null);

const now = () => new Date().toISOString();
const uid = () => `P-${crypto.getRandomValues(new Uint32Array(2)).join('').slice(0, 12)}`;
class Forbidden extends Error { constructor() { super('Only Super Admin can do this.'); } }
const mustBeAdmin = (actor: Person | null) => { if (!actor || actor.role !== 'super_admin' || !actor.active) throw new Forbidden(); };
const savePeople = async (people: Person[]) => {
  if (REMOTE) { const r = await apiJson<{ people: Person[] }>('people', 'PUT', { people }); set({ people: r.people }); return; }
  await kvSet('people', people); set({ people });
};

// ---------- sign-in ----------
export const needsSetup = () => state.ready && (REMOTE ? state.setup : !state.people.some((p) => p.role === 'super_admin' && p.active && p.codeHash));
export function findPersonByCode(raw: string) {
  if (validateCode(raw)) return undefined;
  const h = hashCode(raw);
  return state.people.find((p) => p.active && p.codeHash === h);
}
/** First run only: create the Super Admin with a code chosen on this computer. */
export async function setupSuperAdmin(name: string, raw: string) {
  if (!needsSetup()) throw new Error('Setup is already done.');
  const bad = validateCode(raw); if (bad) throw new Error(bad);
  if (REMOTE) {
    const r = await apiJson<{ token: string; user: Person }>('setup', 'POST', { name, code: raw });
    setToken(r.token); set({ setup: false }); await loadSession();
    return r.user;
  }
  const p: Person = { id: uid(), name: name.trim() || 'Super Admin', role: 'super_admin', scope: [], codeHash: hashCode(raw), codeSetAt: now(), active: true, createdAt: now() };
  await savePeople([...state.people, p]);
  return p;
}

// ---------- data upload ----------
export async function replaceData(actor: Person | null, rows: Disbursement[], sheets: SheetReport[], fileName: string) {
  mustBeAdmin(actor);
  if (!rows.length) throw new Error('No rows to save.');
  if (REMOTE) {
    // Upload gzip in ~3 MB pieces (Vercel request limit), then save them in one commit.
    const gz = await gzipJson(rows), PIECE = 3 * 1024 * 1024, parts: string[] = [];
    for (let i = 0; i < gz.length; i += PIECE) parts.push((await apiJson<{ sha: string }>('data', 'POST', { part: toBase64(gz.subarray(i, i + PIECE)) })).sha);
    const r = await apiJson<{ uploadedAt: string; uploadedBy: string }>('data', 'POST', { commit: { meta: { fileName, sheets }, parts } });
    set({ data: { fileName, uploadedAt: r.uploadedAt, uploadedBy: r.uploadedBy, rows, sheets } });
    return;
  }
  const data: DataSet = { fileName, uploadedAt: now(), uploadedBy: actor!.name, rows, sheets };
  await kvSet('data', data);
  set({ data });
}

/** Save the latest carpenter list (new bKash numbers). Replaces the previous list. */
export async function replaceCarpenterList(actor: Person | null, entries: ListEntry[], fileName: string) {
  mustBeAdmin(actor);
  if (!entries.length) throw new Error('The list has no usable rows.');
  if (REMOTE) { set({ carpenterList: await apiJson<CarpenterList>('carpenters', 'PUT', { list: { fileName, entries } }) }); return; }
  const carpenterList: CarpenterList = { fileName, uploadedAt: now(), uploadedBy: actor!.name, entries };
  await kvSet('carpenterList', carpenterList);
  set({ carpenterList });
}

// ---------- people ----------
const LEVEL_NAME = { territory: 'territory', area: 'area', zone: 'zone' } as const;
/** Scope names must exist in the uploaded data (so a typo cannot silently hide everything). */
function checkScope(role: Role, scope: string[]) {
  const level = SCOPE_LEVEL[role];
  if (level === 'all') return [];
  const clean = [...new Set(scope.map((s) => s.replace(/\s+/g, ' ').trim()).filter(Boolean))];
  if (!clean.length) throw new Error(`${ROLE_LABEL[role]} needs at least one ${LEVEL_NAME[level]}.`);
  if (state.data) {
    const known = new Set(namesByLevel(state.data.rows)[level].map(nameKey));
    const unknown = clean.filter((s) => !known.has(nameKey(s)));
    if (unknown.length) throw new Error(`Not found in the uploaded data as a ${LEVEL_NAME[level]}: ${unknown.slice(0, 5).join(', ')}${unknown.length > 5 ? '…' : ''}`);
  }
  return clean;
}
function codeFor(raw: string | undefined, exceptId?: string) {
  if (!raw) return undefined;
  const bad = validateCode(raw); if (bad) throw new Error(bad);
  const h = hashCode(raw);
  if (state.people.some((p) => p.id !== exceptId && p.codeHash === h)) throw new Error('That login code is already used by someone else.');
  return h;
}

export interface PersonInput { name: string; role: Role; scope: string[]; code?: string }

export async function addPerson(actor: Person | null, input: PersonInput) {
  mustBeAdmin(actor);
  if (!input.name.trim()) throw new Error('Name is required.');
  const scope = checkScope(input.role, input.scope);
  const codeHash = codeFor(input.code);
  const p: Person = { id: uid(), name: input.name.trim(), role: input.role, scope, codeHash, codeSetAt: codeHash ? now() : undefined, active: true, createdAt: now() };
  await savePeople([...state.people, p]);
  return p;
}

export async function updatePerson(actor: Person | null, id: string, patch: { name: string; role: Role; scope: string[] }) {
  mustBeAdmin(actor);
  const p = state.people.find((x) => x.id === id);
  if (!p) throw new Error('Person not found.');
  if (p.role === 'super_admin' && patch.role !== 'super_admin' && state.people.filter((x) => x.role === 'super_admin' && x.active).length <= 1)
    throw new Error('Keep at least one active Super Admin.');
  if (!patch.name.trim()) throw new Error('Name is required.');
  const scope = checkScope(patch.role, patch.scope);
  await savePeople(state.people.map((x) => (x.id === id ? { ...x, name: patch.name.trim(), role: patch.role, scope } : x)));
}

/** Returns the normalised code so it can be shown once. */
export async function setPersonCode(actor: Person | null, id: string, raw: string) {
  mustBeAdmin(actor);
  const h = codeFor(raw, id)!;
  await savePeople(state.people.map((x) => (x.id === id ? { ...x, codeHash: h, codeSetAt: now() } : x)));
  return normaliseCode(raw);
}

export async function setPersonActive(actor: Person | null, id: string, active: boolean) {
  mustBeAdmin(actor);
  const p = state.people.find((x) => x.id === id);
  if (!p) throw new Error('Person not found.');
  if (!active && p.role === 'super_admin' && state.people.filter((x) => x.role === 'super_admin' && x.active).length <= 1) throw new Error('Keep at least one active Super Admin.');
  if (!active && p.id === actor!.id) throw new Error('You cannot deactivate yourself.');
  await savePeople(state.people.map((x) => (x.id === id ? { ...x, active } : x)));
}

export async function deletePerson(actor: Person | null, id: string) {
  mustBeAdmin(actor);
  const p = state.people.find((x) => x.id === id);
  if (!p) return;
  if (p.id === actor!.id) throw new Error('You cannot delete yourself.');
  if (p.role === 'super_admin' && state.people.filter((x) => x.role === 'super_admin' && x.active).length <= 1) throw new Error('Keep at least one active Super Admin.');
  await savePeople(state.people.filter((x) => x.id !== id));
}

// ---------- bulk people upload ----------
export interface PeopleRow { row: number; name: string; role: string; scope: string; code: string }
export interface PeopleCheck { row: number; name: string; action: 'add' | 'update' | null; detail: string; error?: string }
const ROLE_TEXT: Record<string, Role> = { 'SUPER ADMIN': 'super_admin', GM: 'gm', DGM: 'dgm', ZSM: 'zsm', ASM: 'asm', SR: 'sr' };

/** One row per person, matched by name. Nothing changes until applyPeopleRows. */
export function checkPeopleRows(actor: Person | null, rows: PeopleRow[]): PeopleCheck[] {
  mustBeAdmin(actor);
  const seenName = new Map<string, number>(), seenCode = new Map<string, number>();
  return rows.map((r) => {
    const name = r.name.replace(/\s+/g, ' ').trim();
    const out: PeopleCheck = { row: r.row, name: name || '(blank)', action: null, detail: '' };
    const fail = (e: string) => ({ ...out, error: e });
    if (!name) return fail('Name is missing.');
    const k = name.toLowerCase();
    if (seenName.has(k)) return fail(`Same name already on row ${seenName.get(k)}.`);
    seenName.set(k, r.row);
    const existing = state.people.find((p) => p.name.toLowerCase() === k);
    const role = ROLE_TEXT[r.role.trim().toUpperCase()] ?? existing?.role;
    if (!role) return fail(`Role "${r.role}" must be GM, DGM, ZSM, ASM or SR.`);
    if (role === 'super_admin' && !existing) return fail('Super Admins can only be added in the app.');
    let scope: string[] = existing?.scope ?? [];
    try { if (r.scope.trim() || !existing || ROLE_TEXT[r.role.trim().toUpperCase()]) scope = checkScope(role, r.scope.split(/[;\n]/)); } catch (e) { return fail((e as Error).message); }
    if (r.code.trim()) {
      const bad = validateCode(r.code); if (bad) return fail(bad);
      const c = normaliseCode(r.code);
      if (seenCode.has(c)) return fail(`Same login code already on row ${seenCode.get(c)}.`);
      seenCode.set(c, r.row);
      const owner = state.people.find((p) => p.codeHash === hashCode(r.code));
      if (owner && owner.id !== existing?.id) return fail('Login code is already used by someone else.');
    } else if (!existing) return fail('A new person needs a login code.');
    out.action = existing ? 'update' : 'add';
    out.detail = `${ROLE_LABEL[role]}${scope.length ? ` · ${scope.join(', ')}` : ''}${r.code.trim() ? ' · new code' : ''}`;
    return out;
  });
}

export async function applyPeopleRows(actor: Person | null, rows: PeopleRow[]) {
  const checks = checkPeopleRows(actor, rows);
  let people = [...state.people];
  checks.forEach((c, i) => {
    if (c.error) return;
    const r = rows[i];
    const name = r.name.replace(/\s+/g, ' ').trim();
    const existing = people.find((p) => p.name.toLowerCase() === name.toLowerCase());
    const role = ROLE_TEXT[r.role.trim().toUpperCase()] ?? existing!.role;
    const scope = r.scope.trim() || !existing || ROLE_TEXT[r.role.trim().toUpperCase()] ? checkScope(role, r.scope.split(/[;\n]/)) : existing.scope;
    const codeHash = r.code.trim() ? hashCode(r.code) : existing?.codeHash;
    if (existing) people = people.map((p) => (p.id === existing.id ? { ...p, role, scope, codeHash, codeSetAt: r.code.trim() ? now() : p.codeSetAt } : p));
    else people.push({ id: uid(), name, role, scope, codeHash, codeSetAt: now(), active: true, createdAt: now() });
  });
  await savePeople(people);
  return checks;
}
