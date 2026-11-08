// Edge Function: manage-login-codes — Super Admin sets one code or applies a bulk list.
// Codes are hashed here (server pepper) so plain codes never reach the database.
// Body: { items: [{ employee_id?: string, user_id?: string, code: string }] }  (max 2000)
import { createClient } from 'npm:@supabase/supabase-js@2.45.4';

const enc = new TextEncoder();
async function hmac(code: string, pepper: string) {
  const key = await crypto.subtle.importKey('raw', enc.encode(pepper), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return Array.from(new Uint8Array(await crypto.subtle.sign('HMAC', key, enc.encode(code))), (b) => b.toString(16).padStart(2, '0')).join('');
}
const normalise = (s: string) => s.replace(/[\s-]/g, '').toUpperCase();

Deno.serve(async (req) => {
  const pepper = Deno.env.get('LOGIN_CODE_PEPPER');
  if (!pepper) return Response.json({ error: 'not configured' }, { status: 503 });
  const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

  // Only an active Super Admin may call this
  const jwt = req.headers.get('Authorization')?.replace('Bearer ', '') ?? '';
  const { data: auth } = await sb.auth.getUser(jwt);
  const { data: me } = auth?.user ? await sb.from('users').select('id, role, is_active').eq('id', auth.user.id).single() : { data: null };
  if (!me || me.role !== 'super_admin' || !me.is_active) return Response.json({ error: 'forbidden' }, { status: 403 });

  const { items } = await req.json().catch(() => ({ items: [] }));
  if (!Array.isArray(items) || !items.length || items.length > 2000) return Response.json({ error: 'bad request' }, { status: 400 });

  const results = [];
  const seen = new Set<string>();
  for (const [i, it] of items.entries()) {
    const code = normalise(String(it.code ?? ''));
    if (!/^[A-Z0-9]{8,20}$/.test(code)) { results.push({ i, error: 'Code must be 8–20 letters or numbers.' }); continue; }
    if (seen.has(code)) { results.push({ i, error: 'Duplicate code in this upload.' }); continue; }
    seen.add(code);
    const q = it.user_id ? sb.from('users').select('id').eq('id', it.user_id) : sb.from('users').select('id').eq('employee_id', String(it.employee_id ?? '').toUpperCase());
    const { data: target } = await q.maybeSingle();
    if (!target) { results.push({ i, error: 'Person not found.' }); continue; }
    const { error } = await sb.from('users').update({ login_code_hash: await hmac(code, pepper), login_code_set_at: new Date().toISOString(), failed_code_attempts: 0, code_locked_until: null }).eq('id', target.id);
    results.push(error ? { i, error: error.code === '23505' ? 'Code already used by someone else.' : 'Could not save.' } : { i, ok: true });
  }
  await sb.from('audit_logs').insert({ actor_id: me.id, action: 'SET_LOGIN_CODE', entity: 'users', entity_id: '-', new_data: { count: results.filter((r) => 'ok' in r).length } });
  return Response.json({ results });
});
