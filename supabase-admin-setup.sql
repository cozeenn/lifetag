-- Run after replacing the email below with the first administrator's confirmed Supabase Auth email.
create table if not exists public.admin_users (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null check(role in ('support','organization_admin','clinical_reviewer','security_auditor','system_admin')),
  active boolean not null default true, created_at timestamptz not null default now(), created_by uuid references auth.users(id)
);
alter table public.admin_users enable row level security;
drop policy if exists "admins see own assignment" on public.admin_users;
create policy "admins see own assignment" on public.admin_users for select to authenticated using(user_id=(select auth.uid()) and active=true);

insert into public.admin_users(user_id,role)
select id,'system_admin' from auth.users where email='reotan040@gmail.com'
on conflict(user_id) do update set role='system_admin',active=true;

select a.user_id,u.email,a.role,a.active from public.admin_users a join auth.users u on u.id=a.user_id;
