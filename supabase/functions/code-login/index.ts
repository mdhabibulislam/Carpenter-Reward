// Edge Function: code-login — sign in with a login code only.
// Secrets: LOGIN_CODE_PEPPER (long random string). Uses the service role server-side only.
// Flow: code → HMAC lookup → checks (active, lockouts) → one-time magic-link token → client calls auth.verifyOtp().
import { createClient } from 'npm:@supabase/supabase-js@2.45.4';

// A wrong code matches nobody, so brute force is limited per IP; Super Admin can also lock an account (code_locked_until).
const PER_IP_MAX = 20, PER_IP_WINDOW_MIN = 15;    // 20 wrong tries from one IP in 15 min → refuse

const enc = new TextEncoder();
async function hmac(code: string, pepper: string) {
  const key = await crypto.subtle.importKey('raw', enc.encode(pepper), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(code));
  return Array.from(new Uint8Array(sig), (b) => b.toString(16).padStart(2, '0')).join('');
}
const normalise = (s: string) => s.replace(/[\s-]/g, '').toUpperCase();
const generic = () => Response.json({ error: 'invalid' }, { status: 401 }); // never say why

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });
  const pepper = Deno.env.get('LOGIN_CODE_PEPPER');
  if (!pepper) return Response.json({ error: 'not configured' }, { status: 503 });
  const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const ip = (req.headers.get('x-forwarded-for') ?? '').split(',')[0].trim() || null;

  // Per-IP throttle
  const since = new Date(Date.now() - PER_IP_WINDOW_MIN * 60_000).toISOString();
  const { count } = await sb.from('login_attempts').select('id', { count: 'exact', head: true }).eq('ip', ip).eq('success', false).gte('at', since);
  if ((count ?? 0) >= PER_IP_MAX) return Response.json({ error: 'too_many' }, { status: 429 });

  const { code } = await req.json().catch(() => ({ code: '' }));
  const c = normalise(String(code ?? ''));
  if (!/^[A-Z0-9]{8,20}$/.test(c)) { await sb.from('login_attempts').insert({ ip, success: false }); return generic(); }

  const { data: u } = await sb.from('users').select('id, email, is_active, failed_code_attempts, code_locked_until').eq('login_code_hash', await hmac(c, pepper)).maybeSingle();
  if (!u || !u.is_active) { await sb.from('login_attempts').insert({ ip, success: false }); return generic(); }
  if (u.code_locked_until && new Date(u.code_locked_until) > new Date()) { await sb.from('login_attempts').insert({ ip, user_id: u.id, success: false }); return generic(); }

  // Issue a one-time sign-in token for this user's internal identity
  const { data: link, error } = await sb.auth.admin.generateLink({ type: 'magiclink', email: u.email });
  if (error || !link?.properties?.hashed_token) return Response.json({ error: 'unavailable' }, { status: 503 });
  await sb.from('users').update({ failed_code_attempts: 0, code_locked_until: null, last_login_at: new Date().toISOString() }).eq('id', u.id);
  await sb.from('login_attempts').insert({ ip, user_id: u.id, success: true });
  return Response.json({ token_hash: link.properties.hashed_token });
});
