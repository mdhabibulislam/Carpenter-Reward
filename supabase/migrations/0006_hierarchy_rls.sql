-- Migration 0006: hierarchical Row Level Security. Replaces the role helpers from 0002.
-- Payment data is scoped by the SNAPSHOT chain on each record (history stays with the manager
-- who owned it); carpenter master data is scoped by the CURRENT reporting chain.

create or replace function is_super_admin() returns boolean language sql stable as $$
  select current_app_role() = 'super_admin'
$$;
-- GM is company-wide (read only). Super Admin is unrestricted.
create or replace function is_org_wide() returns boolean language sql stable as $$
  select current_app_role() in ('super_admin', 'gm')
$$;
-- Payment status, batches, periods, sync, users, settings: Super Admin only.
create or replace function can_edit_payments() returns boolean language sql stable as $$
  select is_super_admin()
$$;

-- All employees under me (current chain), including me.
create or replace function my_subordinates() returns setof text language sql stable security definer set search_path = public as $$
  with recursive t as (
    select employee_id from employee_mapping where employee_id = current_employee_id()
    union all
    select e.employee_id from employee_mapping e join t on e.manager_id = t.employee_id
  ) select employee_id from t
$$;

-- Record-level check using the snapshot columns.
create or replace function in_scope_chain(p_sr text, p_asm text, p_zsm text, p_dgm text) returns boolean language sql stable as $$
  select case current_app_role()
    when 'super_admin' then true
    when 'gm'  then true
    when 'dgm' then p_dgm = current_employee_id()
    when 'zsm' then p_zsm = current_employee_id()
    when 'asm' then p_asm = current_employee_id()
    when 'sr'  then p_sr  = current_employee_id()
    else false end
$$;
-- Kept for 0002 policies that still call it (carpenters): current chain.
create or replace function in_scope(p_sr text, p_asm text) returns boolean language sql stable as $$
  select is_org_wide() or p_sr in (select my_subordinates())
$$;

drop policy if exists pr_read on payment_records;
create policy pr_read on payment_records for select using (in_scope_chain(sr_id, asm_id, zsm_id, dgm_id));

drop policy if exists pa_read on payment_attempts;
create policy pa_read on payment_attempts for select using (exists (
  select 1 from payment_records r where r.id = payment_record_id and in_scope_chain(r.sr_id, r.asm_id, r.zsm_id, r.dgm_id)));

-- Every role may comment on records it can see; SR included ("permitted follow-up comments").
drop policy if exists pf_read on payment_followups;
drop policy if exists pf_insert on payment_followups;
create policy pf_read on payment_followups for select using (exists (
  select 1 from payment_records r where r.id = payment_record_id and in_scope_chain(r.sr_id, r.asm_id, r.zsm_id, r.dgm_id)));
create policy pf_insert on payment_followups for insert with check (created_by = auth.uid() and exists (
  select 1 from payment_records r where r.id = payment_record_id and in_scope_chain(r.sr_id, r.asm_id, r.zsm_id, r.dgm_id)));

drop policy if exists carp_admin on carpenters;
create policy carp_admin on carpenters for all using (is_super_admin()) with check (is_super_admin());

-- Employees: see yourself and your subtree (never upward or sideways); GM/SA see all. SA manages.
drop policy if exists ref_emp on employee_mapping;
create policy emp_read on employee_mapping for select using (is_org_wide() or employee_id in (select my_subordinates()));
create policy emp_admin on employee_mapping for all using (is_super_admin()) with check (is_super_admin());

alter table organizational_units enable row level security;
alter table employee_assignments enable row level security;
create policy units_read on organizational_units for select using (current_app_role() is not null);
create policy units_admin on organizational_units for all using (is_super_admin()) with check (is_super_admin());
create policy assign_read on employee_assignments for select using (is_org_wide() or employee_id in (select my_subordinates()));
create policy assign_admin on employee_assignments for all using (is_super_admin()) with check (is_super_admin());

drop policy if exists users_self on users;
drop policy if exists users_admin on users;
create policy users_self on users for select using (id = auth.uid() or is_super_admin());
create policy users_admin on users for all using (is_super_admin()) with check (is_super_admin());

drop policy if exists pb_read on payment_batches;
create policy pb_read on payment_batches for select using (is_org_wide());
drop policy if exists sync_read on sync_logs;
create policy sync_read on sync_logs for select using (is_super_admin());
drop policy if exists audit_read on audit_logs;
create policy audit_read on audit_logs for select using (is_super_admin());
