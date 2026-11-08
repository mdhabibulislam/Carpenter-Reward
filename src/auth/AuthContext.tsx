import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { findPersonByCode, getState, initStore, remoteSignIn, remoteSignOut, useDisb } from '../disb/store';
import { REMOTE } from '../lib/supabase';
import type { Person } from '../disb/types';
import { validateCode } from '../lib/codes';

const SESSION_KEY = 'acs.session';
const SESSION_TTL_MS = 8 * 60 * 60 * 1000; // 8 h
const IDLE_TTL_MS = 30 * 60 * 1000;        // 30 min inactivity
const BACKGROUND_LOCK_MS = 5 * 60 * 1000;  // phone: 5 min in the background
const EXPIRED_FLAG = 'acs.expired';
const MAX_FAILS = 5, LOCKOUT_MS = 60 * 1000;
const EXPIRED_ON_LOAD = (() => { try { const f = sessionStorage.getItem(EXPIRED_FLAG) === '1'; sessionStorage.removeItem(EXPIRED_FLAG); return f; } catch { return false; } })();

interface Ctx {
  user: Person | null;
  loading: boolean;
  signInWithCode: (code: string) => Promise<void>;
  signOut: (why?: 'expired') => void;
  expired: boolean;
}
const AuthCtx = createContext<Ctx>(null!);
export const useAuth = () => useContext(AuthCtx);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [userId, setUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [expired, setExpired] = useState(EXPIRED_ON_LOAD);
  // Always read the live record, so role/scope changes and deactivation apply immediately
  const user = useDisb((s) => (userId ? s.people.find((p) => p.id === userId && p.active) ?? null : null));

  const signOut = useCallback((why?: 'expired') => {
    if (REMOTE) remoteSignOut();
    try { sessionStorage.removeItem(SESSION_KEY); if (why) sessionStorage.setItem(EXPIRED_FLAG, '1'); } catch {}
    setUserId(null);
    window.location.replace('/login'); // full reload: nothing stays in memory on a shared phone
  }, []);

  useEffect(() => {
    initStore().then(() => {
      if (REMOTE) { const id = getState().meId; if (id) setUserId(id); setLoading(false); return; }
      try {
        const raw = sessionStorage.getItem(SESSION_KEY);
        if (raw) {
          const s = JSON.parse(raw) as { id: string; at: number };
          if (Date.now() - s.at < SESSION_TTL_MS && getState().people.some((p) => p.id === s.id && p.active)) setUserId(s.id);
        }
      } catch {}
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  // A deactivated or deleted person is signed out at once
  useEffect(() => { if (!loading && userId && !user) signOut(); }, [loading, userId, user, signOut]);

  useEffect(() => {
    if (!userId) return;
    let t = setTimeout(expire, IDLE_TTL_MS);
    function expire() { signOut('expired'); }
    const bump = () => { clearTimeout(t); t = setTimeout(expire, IDLE_TTL_MS); };
    const evs = ['mousedown', 'keydown', 'touchstart'];
    evs.forEach((e) => window.addEventListener(e, bump, { passive: true }));
    let hiddenAt = 0;
    const vis = () => {
      if (document.visibilityState === 'hidden') hiddenAt = Date.now();
      else if (hiddenAt && Date.now() - hiddenAt > BACKGROUND_LOCK_MS) expire();
      else bump();
    };
    document.addEventListener('visibilitychange', vis);
    return () => { clearTimeout(t); evs.forEach((e) => window.removeEventListener(e, bump)); document.removeEventListener('visibilitychange', vis); };
  }, [userId, signOut]);

  const signInWithCode = async (raw: string) => {
    let fails = { n: 0, until: 0 };
    try { fails = JSON.parse(sessionStorage.getItem('acs.fails') || '{"n":0,"until":0}'); } catch {}
    if (Date.now() < fails.until) throw new Error(`Too many attempts. Try again in ${Math.ceil((fails.until - Date.now()) / 1000)} seconds.`);
    const fail = () => {
      const n = fails.n + 1;
      try { sessionStorage.setItem('acs.fails', JSON.stringify(n >= MAX_FAILS ? { n: 0, until: Date.now() + LOCKOUT_MS } : { n, until: 0 })); } catch {}
      return new Error(n >= MAX_FAILS ? 'Too many wrong codes. Try again in 60 seconds.' : 'That login code is not valid.');
    };
    await initStore();
    if (validateCode(raw)) throw fail();
    let p: { id: string } | undefined;
    if (REMOTE) {
      try { p = await remoteSignIn(raw); }
      catch (e) { if ((e as { status?: number }).status === 401) throw fail(); throw e; }
    } else p = findPersonByCode(raw);
    if (!p) throw fail();
    try { sessionStorage.removeItem('acs.fails'); sessionStorage.setItem(SESSION_KEY, JSON.stringify({ id: p.id, at: Date.now() })); } catch {}
    setExpired(false);
    setUserId(p.id);
  };

  return <AuthCtx.Provider value={{ user, loading, signInWithCode, signOut, expired }}>{children}</AuthCtx.Provider>;
}
