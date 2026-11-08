// Browser side of the /api server (GitHub storage). The session token lives only in this tab.
const TOKEN_KEY = 'acs.token';

export const getToken = () => { try { return sessionStorage.getItem(TOKEN_KEY); } catch { return null; } };
export const setToken = (t: string | null) => { try { if (t) sessionStorage.setItem(TOKEN_KEY, t); else sessionStorage.removeItem(TOKEN_KEY); } catch { /* private mode */ } };

export class ApiError extends Error { constructor(public status: number, msg: string) { super(msg); } }

async function call(path: string, init: RequestInit = {}) {
  const t = getToken();
  let r: Response;
  try {
    r = await fetch(`/api/${path}`, { ...init, headers: { ...(init.body ? { 'Content-Type': 'application/json' } : {}), ...(t ? { Authorization: `Bearer ${t}` } : {}), ...init.headers } });
  } catch { throw new ApiError(0, 'No internet connection. Check your network and try again.'); }
  if (!r.ok) {
    let msg = `Server error (${r.status}).`;
    try { msg = (await r.json()).error || msg; } catch { /* not json */ }
    throw new ApiError(r.status, msg);
  }
  return r;
}

export const apiJson = async <T>(path: string, method = 'GET', body?: unknown): Promise<T> =>
  (await call(path, { method, body: body === undefined ? undefined : JSON.stringify(body) })).json();

/** Downloads gzip JSON and unpacks it. Returns null when there is nothing yet (204). */
export async function apiGz<T>(path: string): Promise<T | null> {
  const first = await call(`${path}?i=0`);
  if (first.status === 204) return null;
  const n = Math.min(40, parseInt(first.headers.get('X-Parts') || '1', 10) || 1);
  const pieces = [await first.arrayBuffer()];
  for (let i = 1; i < n; i++) pieces.push(await (await call(`${path}?i=${i}`)).arrayBuffer());
  const text = await new Response(new Blob(pieces).stream().pipeThrough(new DecompressionStream('gzip'))).text();
  return JSON.parse(text) as T;
}

export async function gzipJson(v: unknown): Promise<Uint8Array> {
  const s = new Blob([JSON.stringify(v)]).stream().pipeThrough(new CompressionStream('gzip'));
  return new Uint8Array(await new Response(s).arrayBuffer());
}

export function toBase64(bytes: Uint8Array) {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}
