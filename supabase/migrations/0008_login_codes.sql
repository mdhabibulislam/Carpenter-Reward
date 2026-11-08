-- Migration 0008: sign-in by login code only (no email/password for people).
-- Codes are never stored: only HMAC-SHA256(code, server pepper) — computed in Edge Functions.
-- Email stays as an INTERNAL identity for Supabase Auth (e.g. sr-006@staff.internal) and is never shown or entered.

alter table users add column if not exists login_code_hash text;
alter table users add column if not exists login_code_set_at timestamptz;
alter table users add column if not exists failed_code_attempts int not null default 0;
alter table users add column if not exists code_locked_until timestamptz;
create unique index if not exists uq_users_login_code_hash on users (login_code_hash) where login_code_hash is not null;

-- Nobody can read hashes through the API: column-level revoke + users policy already limits rows.
revoke select (login_code_hash, failed_code_attempts, code_locked_until) on users from anon, authenticated;

-- Attempt log for server-side rate limiting by IP (rows older than a day can be purged)
create table if not exists login_attempts (
  id bigint generated always as identity primary key,
  ip inet,
  user_id uuid references users(id),
  success boolean not null,
  at timestamptz not null default now()
);
create index if not exists idx_login_attempts_ip_at on login_attempts (ip, at desc);
alter table login_attempts enable row level security;
create policy la_read on login_attempts for select using (is_super_admin());

-- Changes to codes/roles are audited (never the code itself)
create or replace function audit_login_code() returns trigger language plpgsql security definer as $$
begin
  if new.login_code_hash is distinct from old.login_code_hash then
    insert into audit_logs (actor_id, action, entity, entity_id, new_data)
      values (auth.uid(), 'SET_LOGIN_CODE', 'users', new.id::text, jsonb_build_object('set_at', new.login_code_set_at));
  end if;
  return new;
end $$;
drop trigger if exists t_users_code_audit on users;
create trigger t_users_code_audit after update of login_code_hash on users for each row execute function audit_login_code();
