-- LifeTag owner policy repair. Safe to run more than once.
alter table public.health_profiles enable row level security;

drop policy if exists "profile owner select" on public.health_profiles;
drop policy if exists "profile owner insert" on public.health_profiles;
drop policy if exists "profile owner update" on public.health_profiles;
drop policy if exists "profile owner delete" on public.health_profiles;

create policy "profile owner select"
on public.health_profiles for select
to authenticated
using (owner_id = (select auth.uid()));

create policy "profile owner insert"
on public.health_profiles for insert
to authenticated
with check (owner_id = (select auth.uid()));

create policy "profile owner update"
on public.health_profiles for update
to authenticated
using (owner_id = (select auth.uid()))
with check (owner_id = (select auth.uid()));

create policy "profile owner delete"
on public.health_profiles for delete
to authenticated
using (owner_id = (select auth.uid()));

-- Confirm the effective policies after the migration.
select policyname, cmd, roles, qual, with_check
from pg_policies
where schemaname = 'public' and tablename = 'health_profiles'
order by policyname;
