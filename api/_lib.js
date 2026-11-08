// Shared server code for the Vercel API functions.
// Storage: a PRIVATE GitHub repository (the "data repo"). Secrets come only from Vercel Environment Variables:
//   GITHUB_TOKEN    fine-grained token with Contents: Read and write on the data repo only
//   GITHUB_REPO     owner/name of the data repo, e.g. "my-company/acs-data"
//   GITHUB_BRANCH   branch to use (default "main")
//   SESSION_SECRET  long random text used to sign login sessions
//   CODE_PEPPER     long random text mixed into login-code hashes
// Files starting with "_" inside /api are not deployed as endpoints.
import crypto from 'node:crypto';
import zlib from 'node:zlib';

const ENV = () => {
  const e = {
    token: process.env.GITHUB_TOKEN, repo: process.env.GITHUB_REPO, branch: process.env.GITHUB_BRANCH || 'main',
    secret: process.env.SESSION_SECRET, pepper: process.env.CODE_PEPPER,
  };
  const missing = [['GITHUB_TOKEN', e.token], ['GITHUB_REPO', e.repo], ['SESSION_SECRET', e.secret], ['CODE_PEPPER', e.pepper]].filter(([, v]) => !v).map(([k]) => k);
  if (missing.length) throw new HttpError(500, `Server not configured. Add these in Vercel → Settings → Environment Variables: ${missing.join(', ')}`);
  if (e.secret.length < 32 || e.pepper.length < 32) throw new HttpError(500, 'SESSION_SECRET and CODE_PEPPER must each be at least 32 characters.');
  return e;
};

export class HttpError extends Error { constructor(status, message) { super(message); this.status = status; } }

// ---------- HTTP helpers ----------
export function handler(fn) {
  return async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    try { await fn(req, res); }
    catch (e) {
      const status = e instanceof HttpError ? e.status : 500;
      if (status === 500 && !(e instanceof HttpError)) console.error(e);
      if (!res.headersSent) res.status(status).json({ error: e instanceof HttpError ? e.message : 'Server error. Please try again.' });
    }
  };
}
export const method = (req, ...m) => { if (!m.includes(req.method)) throw new HttpError(405, 'Method not allowed'); };
export const body = (req) => (typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body || {});

// ---------- GitHub storage ----------
async function gh(path, init = {}) {
  const { token, repo } = ENV();
  const r = await fetch(`https://api.github.com/repos/${repo}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', 'User-Agent': 'acs-rewards', ...(init.body ? { 'Content-Type': 'application/json' } : {}) },
  });
  if (r.status === 404) return null;
  if (!r.ok) {
    const t = await r.text().catch(() => '');
    if (r.status === 401 || r.status === 403) throw new HttpError(500, 'GitHub refused the token. Check GITHUB_TOKEN has Contents read/write on GITHUB_REPO.');
    const err = new HttpError(502, `GitHub error ${r.status}`); err.gh = r.status; err.detail = t.slice(0, 300); throw err;
  }
  return r.status === 204 ? null : r.json();
}

/** Current commit of the data branch (null when the repo is empty). */
async function headSha() {
  const { branch } = ENV();
  const ref = await gh(`/git/ref/heads/${encodeURIComponent(branch)}`);
  if (!ref) throw new HttpError(500, `Branch "${branch}" not found in the data repo. Create the repo with a README so it has a first commit.`);
  return ref.object.sha;
}

const cache = { head: '', files: new Map() }; // per warm instance; refreshed whenever the branch moves

async function readBlob(sha) { const b = await gh(`/git/blobs/${sha}`); return Buffer.from(b.content, 'base64'); }

/** Reads a file at the current head. Returns Buffer or null. Cached until the branch changes. */
async function readFile(path) {
  const head = await headSha();
  if (cache.head !== head) { cache.head = head; cache.files.clear(); }
  if (cache.files.has(path)) return cache.files.get(path);
  const { branch } = ENV();
  const meta = await gh(`/contents/${path}?ref=${encodeURIComponent(branch)}`);
  const buf = !meta ? null : meta.content && meta.encoding === 'base64' ? Buffer.from(meta.content, 'base64') : await readBlob(meta.sha);
  cache.files.set(path, buf);
  return buf;
}
export async function readJson(path, fallback = null) { const b = await readFile(path); return b ? JSON.parse(b.toString('utf8')) : fallback; }

/** Large data is stored as gzip parts; the manifest lists their blob SHAs. */
export async function readGzParts(shas) {
  const key = `parts:${shas.join(',')}`;
  if (cache.files.has(key)) return cache.files.get(key);
  const bufs = await Promise.all(shas.map(readBlob));
  const json = JSON.parse(zlib.gunzipSync(Buffer.concat(bufs)).toString('utf8'));
  cache.files.set(key, json);
  return json;
}

export async function createBlob(buf) {
  const b = await gh('/git/blobs', { method: 'POST', body: JSON.stringify({ content: buf.toString('base64'), encoding: 'base64' }) });
  return b.sha;
}

/** Commit several files at once. files: [{ path, content?: string, sha?: blobSha }]. Retries if someone else committed first. */
export async function commit(files, message) {
  const { branch } = ENV();
  for (let attempt = 0; attempt < 3; attempt++) {
    const head = await headSha();
    const c = await gh(`/git/commits/${head}`);
    const tree = await gh('/git/trees', { method: 'POST', body: JSON.stringify({ base_tree: c.tree.sha, tree: files.map((f) => ({ path: f.path, mode: '100644', type: 'blob', ...(f.sha ? { sha: f.sha } : { content: f.content }) })) }) });
    const nc = await gh('/git/commits', { method: 'POST', body: JSON.stringify({ message, tree: tree.sha, parents: [head] }) });
    try {
      await gh(`/git/refs/heads/${encodeURIComponent(branch)}`, { method: 'PATCH', body: JSON.stringify({ sha: nc.sha, force: false }) });
      cache.head = ''; cache.files.clear();
      return;
    } catch (e) { if (e.gh !== 422 || attempt === 2) throw e; }
  }
}

// ---------- login codes & sessions ----------
export const normaliseCode = (raw) => String(raw || '').toUpperCase().replace(/[\s-]/g, '');
export const validCode = (raw) => /^[A-Z0-9]{8,20}$/.test(normaliseCode(raw));
export const hashCode = (raw) => crypto.createHmac('sha256', ENV().pepper).update(normaliseCode(raw)).digest('hex');

const b64u = (b) => Buffer.from(b).toString('base64url');
const SESSION_MS = 8 * 60 * 60 * 1000;
export function signSession(id) {
  const p = b64u(JSON.stringify({ id, exp: Date.now() + SESSION_MS }));
  return `${p}.${crypto.createHmac('sha256', ENV().secret).update(p).digest('base64url')}`;
}
function readSession(token) {
  const [p, s] = String(token || '').split('.');
  if (!p || !s) return null;
  const good = crypto.createHmac('sha256', ENV().secret).update(p).digest();
  const got = Buffer.from(s, 'base64url');
  if (got.length !== good.length || !crypto.timingSafeEqual(got, good)) return null;
  const v = JSON.parse(Buffer.from(p, 'base64url').toString('utf8'));
  return v.exp > Date.now() ? v : null;
}

export const PEOPLE = 'people.json', MANIFEST = 'data/manifest.json', CARPENTERS = 'carpenter-list.json';
export const loadPeople = () => readJson(PEOPLE, []);

/** The signed-in, still-active person, or 401. */
export async function requireUser(req, { admin = false } = {}) {
  const auth = req.headers.authorization || '';
  const s = readSession(auth.startsWith('Bearer ') ? auth.slice(7) : '');
  if (!s) throw new HttpError(401, 'Please sign in again.');
  const p = (await loadPeople()).find((x) => x.id === s.id && x.active);
  if (!p) throw new HttpError(401, 'Please sign in again.');
  if (admin && p.role !== 'super_admin') throw new HttpError(403, 'Only Super Admin can do this.');
  return p;
}
/** What the browser may see about a person: never the hash. */
export const publicPerson = (p) => ({ id: p.id, name: p.name, role: p.role, scope: p.scope, codeHash: p.codeHash ? 'set' : undefined, codeSetAt: p.codeSetAt, active: p.active, createdAt: p.createdAt });

// ---------- who sees which rows (same rules as src/disb/scope.ts) ----------
const LEVEL = { sr: 'territory', asm: 'area', zsm: 'zone', dgm: 'zone', gm: 'all', super_admin: 'all' };
const nameKey = (s) => String(s || '').toLowerCase().replace(/\s+/g, ' ').trim().replace(/ zone$/, '');
const keysOf = (s) => String(s || '').split(',').map(nameKey).filter(Boolean);
export function visibleRows(p, rows) {
  const level = LEVEL[p.role];
  if (level === 'all') return rows;
  const allowed = new Set((p.scope || []).map(nameKey));
  if (!allowed.size) return [];
  return rows.filter((r) => keysOf(r[level]).some((k) => allowed.has(k)));
}

// ---------- simple per-instance login throttle ----------
const tries = new Map();
export function throttle(ip) {
  const t = tries.get(ip) || { n: 0, until: 0 };
  if (Date.now() < t.until) throw new HttpError(429, `Too many attempts. Try again in ${Math.ceil((t.until - Date.now()) / 1000)} seconds.`);
  return { fail() { t.n += 1; if (t.n >= 5) { t.n = 0; t.until = Date.now() + 60_000; } tries.set(ip, t); }, ok() { tries.delete(ip); } };
}
export const ipOf = (req) => String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'unknown';
export const gzip = (obj) => zlib.gzipSync(Buffer.from(JSON.stringify(obj)), { level: 6 });
