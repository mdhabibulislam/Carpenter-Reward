-- Migration 0002: Row Level Security. Frontend role checks are cosmetic; these policies are the real gate.

create or replace function current_app_role() returns app_role language sql stable security definer set search_path = public as $$
  select role from users where id = auth.uid() and is_active
$$;
create or replace function current_employee_id() returns text language sql stable security definer set search_path = public as $$
  select employee_id from users where id = auth.uid() and is_active
$$;
create or replace function is_org_wide() returns boolean language sql stable as $$
  select current_app_role() in ('admin', 'management', 'finance')
$$;
create or replace function can_edit_payments() returns boolean language sql stable as $$
  select current_app_role() in ('admin', 'finance')
$$;
-- Can the current user see rows belonging to this SR / ASM?
create or replace function in_scope(p_sr text, p_asm text) returns boolean language sql stable as $$
  select is_org_wide()
      or (current_app_role() = 'asm' and p_asm = current_employee_id())
      or (current_app_role() = 'sr'  and p_sr  = current_employee_id())
$$;

alter table roles enable row level security;
alter table territories enable row level security;
alter table employee_mapping enable row level security;
alter table users enable row level security;
alter table carpenters enable row level security;
alter table payment_periods enable row level security;
alter table payment_batches enable row level security;
alter table failure_reasons enable row level security;
alter table payment_records enable row level security;
alter table payment_attempts enable row level security;
alter table payment_followups enable row level security;
alter table sync_logs enable row level security;
alter table audit_logs enable row level security;

-- Reference data: readable by any signed-in active user
create policy ref_roles on roles for select using (current_app_role() is not null);
create policy ref_terr on territories for select using (current_app_role() is not null);
create policy ref_emp on employee_mapping for select using (current_app_role() is not null);
create policy ref_fr on failure_reasons for select using (current_app_role() is not null);
create policy ref_periods on payment_periods for select using (current_app_role() is not null);

-- Users
create policy users_self on users for select using (id = auth.uid() or current_app_role() = 'admin');
create policy users_admin on users for all using (current_app_role() = 'admin') with check (current_app_role() = 'admin');

-- Carpenters: scoped read; writes only via service role (sync edge function) or admin
create policy carp_read on carpenters for select using (in_scope(sr_id, asm_id));
create policy carp_admin on carpenters for all using (current_app_role() = 'admin') with check (current_app_role() = 'admin');

-- Payment records: scoped read (uses SNAPSHOT sr/asm), Finance/Admin write
create policy pr_read on payment_records for select using (in_scope(sr_id, asm_id));
create policy pr_insert on payment_records for insert with check (can_edit_payments());
create policy pr_update on payment_records for update using (can_edit_payments()) with check (can_edit_payments());

create policy pa_read on payment_attempts for select using (
  exists (select 1 from payment_records r where r.id = payment_record_id and in_scope(r.sr_id, r.asm_id)));
create policy pa_write on payment_attempts for insert with check (can_edit_payments());

-- Follow-ups: anyone who can see the record may comment (ASM, SR, Finance...) but only as themselves
create policy pf_read on payment_followups for select using (
  exists (select 1 from payment_records r where r.id = payment_record_id and in_scope(r.sr_id, r.asm_id)));
create policy pf_insert on payment_followups for insert with check (
  created_by = auth.uid() and current_app_role() in ('admin','finance','asm','management')
  and exists (select 1 from payment_records r where r.id = payment_record_id and in_scope(r.sr_id, r.asm_id)));

-- Batches / periods: finance & admin manage
create policy pb_read on payment_batches for select using (is_org_wide());
create policy pb_write on payment_batches for all using (can_edit_payments()) with check (can_edit_payments());
create policy pp_write on payment_periods for all using (can_edit_payments()) with check (can_edit_payments());

-- Sync & audit: read-only to admin/management; written by service role only
create policy sync_read on sync_logs for select using (current_app_role() in ('admin','management','finance'));
create policy audit_read on audit_logs for select using (current_app_role() in ('admin','management'));
