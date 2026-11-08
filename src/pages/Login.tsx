import { useEffect, useState } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { motion } from 'motion/react';
import { Eye, EyeOff, KeyRound } from 'lucide-react';
import { useAuth } from '../auth/AuthContext';
import { Logo } from '../layouts/AppLayout';
import { Button, Field, inputCls, toast } from '../components/ui';
import { LoginBackdrop } from '../components/LoginBackdrop';
import { CODE_RULE, validateCode } from '../lib/codes';
import { needsSetup, setupSuperAdmin, useDisb } from '../disb/store';

/** Fetch the dashboard code while the user is on the login page, so signing in opens it instantly. */
function usePreloadDashboard() {
  useEffect(() => {
    const go = () => { import('./Home'); };
    const w = window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number };
    if (w.requestIdleCallback) w.requestIdleCallback(go, { timeout: 2000 }); else setTimeout(go, 800);
  }, []);
}

export function Login() {
  const { user, signInWithCode, expired } = useAuth();
  const loc = useLocation() as { state?: { from?: string } };
  const [code, setCode] = useState('');
  const [show, setShow] = useState(false);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const ready = useDisb((s) => s.ready);
  useDisb((s) => s.people);
  useDisb((s) => s.setup);
  const loadError = useDisb((s) => s.loadError);
  const setup = ready && needsSetup();
  const [adminName, setAdminName] = useState('');
  const [code2, setCode2] = useState('');
  usePreloadDashboard();
  if (user) return <Navigate to={loc.state?.from ?? '/'} replace />;

  const doSetup = async (e: React.FormEvent) => {
    e.preventDefault(); setErr('');
    const bad = validateCode(code); if (bad) return setErr(bad);
    if (code.replace(/[\s-]/g, '').toUpperCase() !== code2.replace(/[\s-]/g, '').toUpperCase()) return setErr('The two codes do not match.');
    setBusy(true);
    try { await setupSuperAdmin(adminName, code); toast.ok('Super Admin created — sign in with your new code'); await signInWithCode(code); } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setErr('');
    if (!code.trim()) return setErr('Enter your login code.');
    setBusy(true);
    try { await signInWithCode(code); } catch (e) { setErr((e as Error).message); setCode(''); } finally { setBusy(false); }
  };

  return (
    <div className="grid min-h-[100dvh] bg-white lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)]">
      {/* Desktop brand panel */}
      <div className="relative hidden overflow-hidden bg-accent lg:block">
        <LoginBackdrop />
        <div className="relative flex h-full flex-col justify-between p-12 text-white">
          <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
            className="w-fit rounded-2xl bg-white p-3 shadow-pop">
            <Logo size={88} />
          </motion.div>
          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, delay: 0.05, ease: [0.22, 1, 0.36, 1] }}>
            <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-white/75">Anwar Cement Sheet</p>
            <h1 className="mt-3 max-w-md text-[44px] font-extrabold leading-[1.05]">Carpenter Reward Disbursement</h1>
            <p className="mt-4 max-w-md text-white/85">See how much was paid, returned and is still pending for your territory's carpenters.</p>
          </motion.div>
          <p className="text-xs text-white/70">Internal system · Authorised personnel only</p>
        </div>
      </div>

      <div className="flex flex-col">
        {/* Phone brand band */}
        <div className="relative overflow-hidden bg-accent px-6 pb-10 lg:hidden" style={{ paddingTop: 'calc(28px + env(safe-area-inset-top))' }}>
          <LoginBackdrop rows={[
            { top: '12%', opacity: 0.18, seconds: 22, scale: 1.4 },
            { top: '42%', opacity: 0.12, seconds: 30, reverse: true },
            { top: '72%', opacity: 0.2, seconds: 26, scale: 1.8, width: 3 },
          ]} />
          <motion.div initial={{ opacity: 0, scale: 0.94 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
            className="relative mx-auto w-fit rounded-2xl bg-white p-2.5 shadow-pop">
            <Logo size={84} />
          </motion.div>
          <p className="relative mt-4 text-center font-display text-[17px] font-extrabold text-white">Carpenter Reward Status</p>
        </div>

        <div className="-mt-5 flex flex-1 items-start justify-center rounded-t-[22px] bg-white p-6 lg:mt-0 lg:items-center lg:rounded-none">
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }} className="w-full max-w-sm">
            {loadError && <p role="alert" className="mb-4 rounded-[var(--radius)] border border-accent/30 bg-accent-light px-3 py-2.5 text-[13px] text-accent">{loadError}</p>}
            {setup ? (<>
              <h2 className="text-2xl font-bold">First-time setup</h2>
              <p className="mt-1 text-sm text-muted">Create the Super Admin login code. Keep it private.</p>
              <form onSubmit={doSetup} className="mt-6 space-y-4">
                <Field label="Your name"><input className={inputCls} value={adminName} maxLength={60} onChange={(e) => setAdminName(e.target.value)} placeholder="Super Admin" /></Field>
                <Field label="New login code" hint={CODE_RULE}><input className={`${inputCls} font-mono uppercase tracking-[0.15em]`} type="password" autoComplete="new-password" value={code} onChange={(e) => { setCode(e.target.value); setErr(''); }} /></Field>
                <Field label="Type the code again"><input className={`${inputCls} font-mono uppercase tracking-[0.15em]`} type="password" autoComplete="new-password" value={code2} onChange={(e) => { setCode2(e.target.value); setErr(''); }} /></Field>
                {err && <p role="alert" className="text-sm text-primary">{err}</p>}
                <Button variant="primary" className="w-full" icon={KeyRound} loading={busy}>Create Super Admin</Button>
              </form>
            </>) : (<>
            <h2 className="text-2xl font-bold">Sign in</h2>
            <p className="mt-1 text-sm text-muted">Enter the login code given to you by the administrator.</p>
            {expired && <p className="mt-4 rounded-lg bg-warning/10 px-3 py-2 text-sm text-warning">Your session expired. Please sign in again.</p>}
            <form onSubmit={submit} className="mt-6 space-y-4" autoComplete="on">
              <Field label="Login code" hint={CODE_RULE}>
                <div className="relative">
                  <KeyRound className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
                  <input className={`${inputCls} pl-9 pr-12 font-mono tracking-[0.18em] uppercase`} type={show ? 'text' : 'password'} name="login-code"
                    autoComplete="current-password" autoCapitalize="characters" autoCorrect="off" spellCheck={false} maxLength={24} autoFocus
                    value={code} onChange={(e) => { setCode(e.target.value); setErr(''); }} aria-invalid={!!err} />
                  <button type="button" onClick={() => setShow((v) => !v)} aria-label={show ? 'Hide code' : 'Show code'}
                    className="absolute right-1 top-1/2 grid h-10 w-10 -translate-y-1/2 place-items-center rounded-md text-muted hover:text-ink">
                    {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </Field>
              {err && <p role="alert" className="text-sm text-primary">{err}</p>}
              <Button variant="primary" className="w-full" icon={KeyRound} loading={busy}>Sign in</Button>
            </form>
            </>)}
          </motion.div>
        </div>
      </div>
    </div>
  );
}
