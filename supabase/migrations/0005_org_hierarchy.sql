-- Migration 0005: Organisational hierarchy (Super Admin > GM > DGM > ZSM > ASM > SR)
-- Safe, additive changes. Existing payment records are preserved and backfilled.
-- Hierarchy is stored ONCE, on employee_mapping (permanent employee_id). `users` is the login
-- table and links to it via employee_id — no duplicate user table.

-- ---------- roles: id + level ----------
alter table roles add column if not exists id smallint;
alter table roles add column if not exists role_level smallint;
insert into roles (code, label, description) values
  ('super_admin', 'Super Admin', 'Unrestricted system authority'),
  ('gm', 'General Manager', 'Company-wide management access'),
  ('dgm', 'Deputy General Manager', 'Assigned organisational scope'),
  ('zsm', 'Zonal Sales Manager', 'Assigned zone')
on conflict (code) do nothing;
update roles set id = v.id, role_level = v.lvl, label = v.label
from (values ('super_admin'::app_role, 1, 1, 'Super Admin'), ('gm', 2, 2, 'GM'), ('dgm', 3, 3, 'DGM'),
             ('zsm', 4, 4, 'ZSM'), ('asm', 5, 5, 'ASM'), ('sr', 6, 6, 'SR')) as v(code, id, lvl, label)
where roles.code = v.code;
-- Legacy roles (admin/management/finance) are retired: their users must be remapped before go-live.
delete from roles where code in ('admin', 'management', 'finance') and not exists (select 1 from users u where u.role = roles.code);
create unique index if not exists uq_roles_id on roles (id);

-- ---------- organizational_units ----------
create table if not exists organizational_units (
  id text primary key,
  unit_name text not null,
  unit_type text not null check (unit_type in ('COMPANY', 'REGION', 'ZONE', 'AREA', 'TERRITORY')),
  parent_unit_id text references organizational_units(id),
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);
create index if not exists idx_units_parent on organizational_units (parent_unit_id);
-- territories become TERRITORY units (territories table is kept for existing FKs)
insert into organizational_units (id, unit_name, unit_type)
  select id, name, 'TERRITORY' from territories on conflict do nothing;

-- ---------- employee_mapping: hierarchy fields ----------
alter table employee_mapping drop constraint if exists employee_mapping_role_check;
alter table employee_mapping add constraint employee_mapping_role_check check (role in ('gm', 'dgm', 'zsm', 'asm', 'sr'));
alter table employee_mapping add column if not exists designation text;
alter table employee_mapping add column if not exists manager_id text references employee_mapping(employee_id);
alter table employee_mapping add column if not exists org_unit_id text references organizational_units(id);
create index if not exists idx_emp_manager on employee_mapping (manager_id);
update employee_mapping set manager_id = asm_id where role = 'sr' and manager_id is null; -- legacy SR→ASM link

create or replace function role_level(r app_role) returns smallint language sql immutable as $$
  select case r when 'super_admin' then 1 when 'gm' then 2 when 'dgm' then 3 when 'zsm' then 4 when 'asm' then 5 when 'sr' then 6 end::smallint
$$;

-- Reporting rule: manager must be exactly one level above. GM reports to Super Admin (no employee manager).
-- Strictly decreasing levels make circular reporting impossible.
create or replace function validate_reporting() returns trigger language plpgsql as $$
declare m_role app_role;
begin
  if new.role = 'gm' then
    if new.manager_id is not null then raise exception 'GM reports to Super Admin only'; end if;
    return new;
  end if;
  if new.manager_id is null then raise exception '% % must have a reporting manager', new.role, new.employee_id; end if;
  if new.manager_id = new.employee_id then raise exception 'Employee cannot report to themselves'; end if;
  select role into m_role from employee_mapping where employee_id = new.manager_id;
  if m_role is null or role_level(m_role) <> role_level(new.role) - 1 then
    raise exception '% must report to a % (got %)', upper(new.role::text),
      upper((array['super_admin','gm','dgm','zsm','asm'])[role_level(new.role) - 1]), coalesce(m_role::text, 'none');
  end if;
  return new;
end $$;
drop trigger if exists t_emp_validate on employee_mapping;
create constraint trigger t_emp_validate after insert or update of manager_id, role on employee_mapping
  deferrable initially deferred for each row execute function validate_reporting();

-- ---------- employee_assignments (history) ----------
create table if not exists employee_assignments (
  id uuid primary key default gen_random_uuid(),
  employee_id text not null references employee_mapping(employee_id),
  organizational_unit_id text references organizational_units(id),
  manager_id text references employee_mapping(employee_id),
  effective_from timestamptz not null default now(),
  effective_to timestamptz,
  is_active boolean not null default true,
  changed_by uuid references users(id),
  check (effective_to is null or effective_to >= effective_from)
);
create unique index if not exists uq_one_active_assignment on employee_assignments (employee_id) where is_active;

create or replace function track_assignment() returns trigger language plpgsql security definer as $$
begin
  if tg_op = 'UPDATE' and new.manager_id is not distinct from old.manager_id and new.org_unit_id is not distinct from old.org_unit_id then
    return new;
  end if;
  update employee_assignments set is_active = false, effective_to = now() where employee_id = new.employee_id and is_active;
  insert into employee_assignments (employee_id, organizational_unit_id, manager_id, changed_by)
    values (new.employee_id, new.org_unit_id, new.manager_id, auth.uid());
  insert into audit_logs (actor_id, action, entity, entity_id, old_data, new_data)
    values (auth.uid(), case when tg_op = 'INSERT' then 'CREATE_EMPLOYEE' else 'TRANSFER_EMPLOYEE' end, 'employee_mapping', new.employee_id,
            case when tg_op = 'UPDATE' then jsonb_build_object('manager_id', old.manager_id, 'org_unit_id', old.org_unit_id) end,
            jsonb_build_object('manager_id', new.manager_id, 'org_unit_id', new.org_unit_id));
  return new;
end $$;
drop trigger if exists t_emp_assignment on employee_mapping;
create trigger t_emp_assignment after insert or update on employee_mapping for each row execute function track_assignment();
insert into employee_assignments (employee_id, organizational_unit_id, manager_id)
  select employee_id, org_unit_id, manager_id from employee_mapping e
  where not exists (select 1 from employee_assignments a where a.employee_id = e.employee_id);

-- ---------- users: role_id + audit of role changes ----------
alter table users add column if not exists role_id smallint references roles(id);
update users u set role_id = r.id from roles r where r.code = u.role and u.role_id is null;
alter table users drop constraint if exists field_users_need_employee;
alter table users add constraint field_users_need_employee check (role = 'super_admin' or employee_id is not null);
create or replace view v_users_hierarchy as
  select u.id, u.employee_id, u.full_name, u.email, u.role_id, e.manager_id, u.is_active, u.created_at
  from users u left join employee_mapping e on e.employee_id = u.employee_id;

create or replace function audit_user_role() returns trigger language plpgsql security definer as $$
begin
  if new.role is distinct from old.role or new.is_active is distinct from old.is_active or new.employee_id is distinct from old.employee_id then
    insert into audit_logs (actor_id, action, entity, entity_id, old_data, new_data)
      values (auth.uid(), 'CHANGE_USER', 'users', new.id::text,
              jsonb_build_object('role', old.role, 'is_active', old.is_active, 'employee_id', old.employee_id),
              jsonb_build_object('role', new.role, 'is_active', new.is_active, 'employee_id', new.employee_id));
  end if;
  return new;
end $$;
drop trigger if exists t_users_audit on users;
create trigger t_users_audit after update on users for each row execute function audit_user_role();

-- ---------- payment_records: full hierarchy snapshot ----------
-- Snapshots keep historical reports accurate after transfers.
alter table payment_records add column if not exists zsm_id text references employee_mapping(employee_id);
alter table payment_records add column if not exists dgm_id text references employee_mapping(employee_id);
alter table payment_records add column if not exists gm_id text references employee_mapping(employee_id);
create index if not exists idx_pr_zsm on payment_records (zsm_id);
create index if not exists idx_pr_dgm on payment_records (dgm_id);

-- Backfill from the current chain (only where empty). Uses the audit-free path.
alter table payment_records disable trigger t_payment_records_audit;
update payment_records pr set zsm_id = a.manager_id, dgm_id = z.manager_id, gm_id = d.manager_id
from employee_mapping a
left join employee_mapping z on z.employee_id = a.manager_id
left join employee_mapping d on d.employee_id = z.manager_id
where a.employee_id = pr.asm_id and pr.zsm_id is null;
alter table payment_records enable trigger t_payment_records_audit;

-- Fill the snapshot automatically on insert
create or replace function snapshot_chain() returns trigger language plpgsql as $$
begin
  if new.asm_id is null then select manager_id into new.asm_id from employee_mapping where employee_id = new.sr_id; end if;
  if new.zsm_id is null then select manager_id into new.zsm_id from employee_mapping where employee_id = new.asm_id; end if;
  if new.dgm_id is null then select manager_id into new.dgm_id from employee_mapping where employee_id = new.zsm_id; end if;
  if new.gm_id is null then select manager_id into new.gm_id from employee_mapping where employee_id = new.dgm_id; end if;
  return new;
end $$;
drop trigger if exists t_pr_snapshot on payment_records;
create trigger t_pr_snapshot before insert on payment_records for each row execute function snapshot_chain();
