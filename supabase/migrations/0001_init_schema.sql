-- Anwar Cement Sheet · Carpenter Payment Disbursement Management System
-- Migration 0001: core schema
-- Master data rules:
--   * Company API is master for carpenter info (carpenters table).
--   * Local DB is master for payments (payment_* tables). Sync NEVER touches payment tables.

create extension if not exists "pgcrypto";

create type app_role as enum ('admin', 'management', 'finance', 'asm', 'sr');
create type payment_status as enum ('PAID', 'PENDING', 'FAILED', 'NOT_SENT');
create type period_status as enum ('DRAFT', 'OPEN', 'CLOSED');
create type batch_status as enum ('DRAFT', 'PREPARED', 'EXPORTED', 'RESULTS_UPLOADED', 'RECONCILED');
create type data_source as enum ('DEMO', 'COMPANY_API', 'MANUAL_IMPORT');

create table roles (
  code app_role primary key,
  label text not null,
  description text
);

create table territories (
  id text primary key,                       -- company territory ID
  name text not null,
  region text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Employees (ASM / SR) as delivered by the company API
create table employee_mapping (
  employee_id text primary key,
  name text not null,
  role app_role not null check (role in ('asm', 'sr')),
  territory_id text references territories(id),   -- SR: assigned territory
  asm_id text references employee_mapping(employee_id), -- SR: reporting ASM
  mobile text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on employee_mapping (asm_id);
create index on employee_mapping (territory_id);

-- Application users, linked to Supabase auth
create table users (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null unique,
  full_name text not null,
  role app_role not null references roles(code),
  employee_id text references employee_mapping(employee_id), -- required for asm / sr
  is_active boolean not null default true,
  last_login_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint field_users_need_employee check (role not in ('asm','sr') or employee_id is not null)
);

create table carpenters (
  carpenter_id text primary key,             -- permanent unique identifier from company API
  name text not null,
  mobile text,
  bkash_number text,
  territory_id text references territories(id),
  sr_id text references employee_mapping(employee_id),
  asm_id text references employee_mapping(employee_id),
  eligible_amount numeric(12,2) not null default 0 check (eligible_amount >= 0),
  eligibility_status text not null default 'ELIGIBLE',
  is_active boolean not null default true,   -- inactive carpenters are never deleted
  source data_source not null default 'COMPANY_API',
  source_hash text,                          -- for change detection during incremental sync
  last_synced_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on carpenters (territory_id);
create index on carpenters (sr_id);
create index on carpenters (asm_id);
create index on carpenters using gin (to_tsvector('simple', name));

create table payment_periods (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,                 -- e.g. 2026-10
  label text not null,
  start_date date not null,
  end_date date not null,
  status period_status not null default 'DRAFT',
  created_by uuid references users(id),
  created_at timestamptz not null default now(),
  check (end_date >= start_date)
);

create table payment_batches (
  id uuid primary key default gen_random_uuid(),
  batch_no text not null unique,
  period_id uuid not null references payment_periods(id),
  status batch_status not null default 'DRAFT',
  record_count int not null default 0,
  total_amount numeric(14,2) not null default 0,
  exported_at timestamptz,
  results_uploaded_at timestamptz,
  created_by uuid references users(id),
  created_at timestamptz not null default now()
);
create index on payment_batches (period_id);

create table failure_reasons (
  code text primary key,
  label text not null,
  sort_order int not null default 0
);

-- One record per carpenter per period. Territory/SR/ASM are SNAPSHOT at creation
-- so historical reports keep the original assignment.
create table payment_records (
  id uuid primary key default gen_random_uuid(),
  carpenter_id text not null references carpenters(carpenter_id) on delete restrict,
  period_id uuid not null references payment_periods(id),
  batch_id uuid references payment_batches(id),
  territory_id text not null references territories(id),
  sr_id text references employee_mapping(employee_id),
  asm_id text references employee_mapping(employee_id),
  bkash_number_snapshot text,
  eligible_amount numeric(12,2) not null check (eligible_amount >= 0),
  paid_amount numeric(12,2) not null default 0 check (paid_amount >= 0),
  status payment_status not null default 'NOT_SENT',
  transaction_id text,
  payment_date timestamptz,
  failure_reason_code text references failure_reasons(code),
  failure_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint uq_carpenter_period unique (carpenter_id, period_id),
  constraint paid_requires_txn check (status <> 'PAID' or (transaction_id is not null and payment_date is not null)),
  constraint failed_requires_reason check (status <> 'FAILED' or failure_reason_code is not null)
);
create index on payment_records (period_id, status);
create index on payment_records (territory_id);
create index on payment_records (sr_id);
create index on payment_records (asm_id);
-- No transaction ID may confirm two payments
create unique index uq_payment_txn on payment_records (transaction_id) where transaction_id is not null;
-- Belt and braces: at most one PAID record per carpenter per period
create unique index uq_one_paid_per_period on payment_records (carpenter_id, period_id) where status = 'PAID';

create table payment_attempts (
  id uuid primary key default gen_random_uuid(),
  payment_record_id uuid not null references payment_records(id) on delete restrict,
  attempt_no int not null,
  batch_id uuid references payment_batches(id),
  amount numeric(12,2) not null,
  status payment_status not null,
  transaction_id text,
  failure_reason_code text references failure_reasons(code),
  raw_response jsonb,
  attempted_at timestamptz not null default now(),
  recorded_by uuid references users(id),
  unique (payment_record_id, attempt_no)
);
create unique index uq_one_success_attempt on payment_attempts (payment_record_id) where status = 'PAID';

create table payment_followups (
  id uuid primary key default gen_random_uuid(),
  payment_record_id uuid not null references payment_records(id) on delete restrict,
  comment text not null check (length(comment) between 1 and 2000),
  resolution text,
  created_by uuid not null references users(id),
  created_at timestamptz not null default now()
);
create index on payment_followups (payment_record_id);

create table sync_logs (
  id uuid primary key default gen_random_uuid(),
  trigger text not null check (trigger in ('MANUAL', 'SCHEDULED', 'INITIAL')),
  mode text not null check (mode in ('FULL', 'INCREMENTAL')),
  status text not null check (status in ('RUNNING', 'SUCCESS', 'PARTIAL', 'FAILED')),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  total_received int not null default 0,
  new_records int not null default 0,
  updated_records int not null default 0,
  skipped_records int not null default 0,
  failed_records int not null default 0,
  errors jsonb not null default '[]'::jsonb,
  started_by uuid references users(id)
);

create table audit_logs (
  id bigint generated always as identity primary key,
  actor_id uuid references users(id),
  action text not null,
  entity text not null,
  entity_id text,
  old_data jsonb,
  new_data jsonb,
  created_at timestamptz not null default now()
);
create index on audit_logs (entity, entity_id);
create index on audit_logs (created_at desc);

-- updated_at triggers
create or replace function set_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;
create trigger t_carpenters_u before update on carpenters for each row execute function set_updated_at();
create trigger t_payment_records_u before update on payment_records for each row execute function set_updated_at();
create trigger t_users_u before update on users for each row execute function set_updated_at();
create trigger t_territories_u before update on territories for each row execute function set_updated_at();
create trigger t_employee_u before update on employee_mapping for each row execute function set_updated_at();

-- Audit trigger for payment changes
create or replace function audit_payment_change() returns trigger language plpgsql security definer as $$
begin
  insert into audit_logs (actor_id, action, entity, entity_id, old_data, new_data)
  values (auth.uid(), tg_op, 'payment_records', coalesce(new.id, old.id)::text,
          case when tg_op <> 'INSERT' then to_jsonb(old) end,
          case when tg_op <> 'DELETE' then to_jsonb(new) end);
  return coalesce(new, old);
end $$;
create trigger t_payment_records_audit after insert or update or delete on payment_records
  for each row execute function audit_payment_change();

-- Payment records cannot be deleted (history must be preserved)
create or replace function forbid_delete() returns trigger language plpgsql as $$
begin raise exception 'Deleting % is not allowed; history must be preserved', tg_table_name; end $$;
create trigger t_payment_records_nodelete before delete on payment_records for each row execute function forbid_delete();
create trigger t_payment_attempts_nodelete before delete on payment_attempts for each row execute function forbid_delete();
