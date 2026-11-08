// Supabase Edge Function: company-sync
// Runs SERVER-SIDE. Company API credentials are read from function secrets, never shipped to the browser.
// Endpoints are NOT invented: base URL, paths and field names come from secrets / the mapping below,
// to be filled in once the company provides API documentation.
//
// Deploy:  supabase functions deploy company-sync
// Secrets: supabase secrets set COMPANY_API_BASE_URL=... COMPANY_API_TOKEN=... COMPANY_API_CARPENTERS_PATH=...
// Schedule: use pg_cron / Supabase scheduled functions to POST {"trigger":"SCHEDULED","mode":"INCREMENTAL"}.
import { createClient } from 'npm:@supabase/supabase-js@2.45.4';

// Map our canonical fields -> company API field names (edit when docs arrive)
const FIELD_MAP: Record<string, string> = {
  carpenter_id: 'carpenter_id', name: 'carpenter_name', mobile: 'mobile_number', bkash_number: 'bkash_number',
  territory_id: 'territory_id', territory_name: 'territory_name', sr_id: 'sr_id', sr_name: 'sr_name',
  asm_id: 'asm_id', asm_name: 'asm_name', eligible_amount: 'eligible_reward_amount', eligibility_status: 'eligibility_status',
};

Deno.serve(async (req) => {
  const base = Deno.env.get('COMPANY_API_BASE_URL');
  const path = Deno.env.get('COMPANY_API_CARPENTERS_PATH');
  const token = Deno.env.get('COMPANY_API_TOKEN');
  if (!base || !path || !token) return Response.json({ error: 'Company API not configured' }, { status: 503 });

  const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  // Only admin/finance callers may trigger manual syncs
  const jwt = req.headers.get('Authorization')?.replace('Bearer ', '');
  const { data: u } = await sb.auth.getUser(jwt ?? '');
  const { data: me } = u?.user ? await sb.from('users').select('role').eq('id', u.user.id).single() : { data: null };
  const body = await req.json().catch(() => ({}));
  if (body.trigger !== 'SCHEDULED' && !['admin', 'finance'].includes(me?.role)) return Response.json({ error: 'Forbidden' }, { status: 403 });

  const { data: log } = await sb.from('sync_logs').insert({ trigger: body.trigger ?? 'MANUAL', mode: body.mode ?? 'INCREMENTAL', status: 'RUNNING', started_by: u?.user?.id }).select().single();
  const stats = { total_received: 0, new_records: 0, updated_records: 0, skipped_records: 0, failed_records: 0 };
  const errors: unknown[] = [];
  const seen = new Set<string>();
  let page = 1;
  try {
    for (;;) {
      const res = await fetch(`${base}${path}?page=${page}`, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) throw new Error(`Company API HTTP ${res.status}`);
      const json = await res.json();
      const rows: Record<string, unknown>[] = json.data ?? json.items ?? json;
      if (!rows.length) break;
      for (const raw of rows) {
        stats.total_received++;
        const r = Object.fromEntries(Object.entries(FIELD_MAP).map(([k, v]) => [k, raw[v]]));
        const id = String(r.carpenter_id ?? '').trim();
        if (id && seen.has(id)) { stats.skipped_records++; errors.push({ id, error: 'Duplicate in payload' }); continue; }
        if (!id || !r.name) { stats.failed_records++; errors.push({ id, error: 'Missing carpenter_id or name' }); continue; }
        seen.add(id);
        // Hierarchy is owned by this system: territory/ASM come from the SR's current assignment (trigger t_carp_follow_sr enforces it too).
        const { data: sr } = await sb.from('employee_mapping').select('territory_id, manager_id, is_active, role').eq('employee_id', r.sr_id).maybeSingle();
        if (!sr || sr.role !== 'sr' || !sr.is_active) { stats.failed_records++; errors.push({ id, error: `Unknown or inactive SR ${r.sr_id}` }); continue; }
        r.territory_id = sr.territory_id; r.asm_id = sr.manager_id;
        const hash = JSON.stringify(r);
        const { data: existing } = await sb.from('carpenters').select('source_hash').eq('carpenter_id', id).maybeSingle();
        if (existing?.source_hash === hash) { stats.skipped_records++; continue; }
        // Upsert carpenter master data ONLY. payment_records are never touched here.
        const { error } = await sb.from('carpenters').upsert({
          carpenter_id: id, name: r.name, mobile: r.mobile, bkash_number: r.bkash_number, territory_id: r.territory_id,
          sr_id: r.sr_id, asm_id: r.asm_id, eligible_amount: Number(r.eligible_amount ?? 0),
          eligibility_status: r.eligibility_status ?? 'ELIGIBLE', source: 'COMPANY_API', source_hash: hash, last_synced_at: new Date().toISOString(),
        });
        if (error) { stats.failed_records++; errors.push({ id, error: error.message }); }
        else existing ? stats.updated_records++ : stats.new_records++;
      }
      if (!json.next_page && !json.has_more) break;
      page++;
    }
    await sb.from('sync_logs').update({ ...stats, errors, status: errors.length ? 'PARTIAL' : 'SUCCESS', finished_at: new Date().toISOString() }).eq('id', log.id);
    return Response.json({ ok: true, ...stats });
  } catch (e) {
    await sb.from('sync_logs').update({ ...stats, errors: [...errors, { error: String(e) }], status: 'FAILED', finished_at: new Date().toISOString() }).eq('id', log.id);
    return Response.json({ ok: false, error: String(e) }, { status: 502 });
  }
});
