-- Migration 0009: simplified "Carpenter Reward Disbursement Status" model (for a future server deployment).
-- The app currently runs fully on one computer (browser storage). These tables mirror that model so
-- the same rules apply on a server: people only see rows for their assigned territories / areas / zones.
-- Earlier payment-workflow tables (0001–0007) are no longer used by the app.

create table if not exists disbursements (
  id bigint generated always as identity primary key,
  month text not null check (month ~ '^\d{4}-\d{2}$'),
  carpenter_id text,
  carpenter_name text not null,
  bkash_number text,
  territory text not null,
  area text,
  zone text,
  amount numeric(14,2) not null check (amount >= 0),
  status text not null check (status in ('PAID', 'RETURN', 'PENDING')),
  disbursed_on date,
  upload_id uuid not null,
  created_at timestamptz not null default now()
);
create index if not exists idx_disb_month on disbursements (month);
create index if not exists idx_disb_territory on disbursements (lower(territory));
create index if not exists idx_disb_area on disbursements (lower(area));
create index if not exists idx_disb_zone on disbursements (lower(zone));

create table if not exists disbursement_uploads (
  id uuid primary key default gen_random_uuid(),
  file_name text not null,
  row_count int not null,
  uploaded_by uuid references users(id),
  uploaded_at timestamptz not null default now()
);

-- Names each person may see (territory for SR, area for ASM, zone for ZSM/DGM). GM / Super Admin: none = all.
create table if not exists user_scopes (
  user_id uuid not null references users(id) on delete cascade,
  name text not null,
  primary key (user_id, name)
);

-- "Comilla" = "Comilla Zone"; case and spaces ignored; cells may list several names separated by commas.
create or replace function name_key(s text) returns text language sql immutable as $$
  select regexp_replace(regexp_replace(lower(trim(coalesce(s, ''))), '\s+', ' ', 'g'), ' zone$', '')
$$;
create or replace function cell_matches(cell text, uid uuid) returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from unnest(string_to_array(coalesce(cell, ''), ',')) part
    join user_scopes s on s.user_id = uid and name_key(s.name) = name_key(part)
  )
$$;

create or replace function can_see_disbursement(r disbursements) returns boolean language sql stable as $$
  select case current_app_role()
    when 'super_admin' then true
    when 'gm' then true
    when 'dgm' then cell_matches(r.zone, auth.uid())
    when 'zsm' then cell_matches(r.zone, auth.uid())
    when 'asm' then cell_matches(r.area, auth.uid())
    when 'sr'  then cell_matches(r.territory, auth.uid())
    else false end
$$;

alter table disbursements enable row level security;
alter table disbursement_uploads enable row level security;
alter table user_scopes enable row level security;

create policy disb_read on disbursements for select using (can_see_disbursement(disbursements));
create policy disb_admin on disbursements for all using (is_super_admin()) with check (is_super_admin());
create policy upl_read on disbursement_uploads for select using (current_app_role() is not null);
create policy upl_admin on disbursement_uploads for all using (is_super_admin()) with check (is_super_admin());
create policy scope_self on user_scopes for select using (user_id = auth.uid() or is_super_admin());
create policy scope_admin on user_scopes for all using (is_super_admin()) with check (is_super_admin());
