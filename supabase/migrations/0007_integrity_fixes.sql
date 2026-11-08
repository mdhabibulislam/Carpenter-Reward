-- Migration 0007: server-side rules for issues found in testing (mirrors the app's checks).

-- (16) Partial payments and real payment dates
alter table payment_records drop constraint if exists paid_amount_le_eligible;
alter table payment_records add constraint paid_amount_le_eligible check (paid_amount <= eligible_amount);
alter table payment_records drop constraint if exists payment_date_not_future;
alter table payment_records add constraint payment_date_not_future check (payment_date is null or payment_date <= now() + interval '5 minutes') not valid;

-- (4) Correcting a confirmed payment requires a written reason; the reversal is audit-logged by t_payment_records_audit.
create or replace function guard_paid_correction() returns trigger language plpgsql as $$
begin
  if old.status = 'PAID' and new.status <> 'PAID' then
    if not is_super_admin() then raise exception 'Only Super Admin can correct a confirmed payment'; end if;
    if new.failure_note is null or new.failure_note not like 'Correction:%' or length(new.failure_note) < 22 then
      raise exception 'A correction reason of at least 10 characters is required (failure_note must start with "Correction:")';
    end if;
    new.paid_amount := 0;
    new.transaction_id := null;
    new.payment_date := null;
  end if;
  return new;
end $$;
drop trigger if exists t_pr_correction on payment_records;
create trigger t_pr_correction before update on payment_records for each row execute function guard_paid_correction();

-- (2) A batch cannot be reconciled while any of its payments are still pending
create or replace function guard_batch_reconcile() returns trigger language plpgsql as $$
declare n int;
begin
  if new.status = 'RECONCILED' and old.status <> 'RECONCILED' then
    select count(*) into n from payment_records where batch_id = new.id and status = 'PENDING';
    if n > 0 then raise exception '% payment(s) in batch % are still pending confirmation', n, new.batch_no; end if;
  end if;
  return new;
end $$;
drop trigger if exists t_batch_reconcile on payment_batches;
create trigger t_batch_reconcile before update on payment_batches for each row execute function guard_batch_reconcile();

-- (9) Keep every upload's unmatched rows for review
create table if not exists batch_unmatched_rows (
  id bigint generated always as identity primary key,
  batch_id uuid not null references payment_batches(id),
  carpenter_id text, transaction_id text, amount numeric(12,2), status text, note text not null,
  uploaded_at timestamptz not null default now(),
  uploaded_by uuid references users(id)
);
alter table batch_unmatched_rows enable row level security;
create policy bur_read on batch_unmatched_rows for select using (is_super_admin());
create policy bur_write on batch_unmatched_rows for insert with check (is_super_admin());

-- (5) An employee's unit must sit inside their manager's unit
create or replace function validate_unit_nesting() returns trigger language plpgsql as $$
declare m_unit text; u_parent text;
begin
  if new.role = 'gm' or new.manager_id is null then return new; end if;
  select org_unit_id into m_unit from employee_mapping where employee_id = new.manager_id;
  select parent_unit_id into u_parent from organizational_units where id = new.org_unit_id;
  if new.org_unit_id is null or u_parent is distinct from m_unit then
    raise exception 'Unit % is not inside the manager''s unit %', new.org_unit_id, m_unit;
  end if;
  return new;
end $$;
drop trigger if exists t_emp_unit_nesting on employee_mapping;
create constraint trigger t_emp_unit_nesting after insert or update of manager_id, org_unit_id on employee_mapping
  deferrable initially deferred for each row execute function validate_unit_nesting();

-- (6) An SR with active carpenters cannot be deactivated
create or replace function guard_sr_deactivation() returns trigger language plpgsql as $$
declare n int;
begin
  if old.is_active and not new.is_active then
    if exists (select 1 from employee_mapping where manager_id = new.employee_id and is_active) then
      raise exception 'Reassign direct reports of % before deactivating', new.employee_id;
    end if;
    select count(*) into n from carpenters where sr_id = new.employee_id and is_active;
    if n > 0 then raise exception '% active carpenters are still assigned to %', n, new.employee_id; end if;
  end if;
  return new;
end $$;
drop trigger if exists t_emp_deactivate on employee_mapping;
create trigger t_emp_deactivate before update of is_active on employee_mapping for each row execute function guard_sr_deactivation();

-- (7) Carpenter territory/ASM always follow the assigned SR's current assignment (hierarchy is owned here)
create or replace function carpenter_follow_sr() returns trigger language plpgsql as $$
declare t text; a text; act boolean;
begin
  select territory_id, manager_id, is_active into t, a, act from employee_mapping where employee_id = new.sr_id and role = 'sr';
  if t is null then raise exception 'Unknown SR % for carpenter %', new.sr_id, new.carpenter_id; end if;
  if not act and new.is_active then raise exception 'SR % is inactive', new.sr_id; end if;
  new.territory_id := t; new.asm_id := a;
  return new;
end $$;
drop trigger if exists t_carp_follow_sr on carpenters;
create trigger t_carp_follow_sr before insert or update of sr_id, territory_id, asm_id on carpenters for each row execute function carpenter_follow_sr();

-- (12) Case-insensitive unique login emails
create unique index if not exists uq_users_email_ci on users (lower(email));
