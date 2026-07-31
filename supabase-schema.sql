-- LifeTag production schema for Supabase/PostgreSQL
create extension if not exists pgcrypto;

create type public.member_role as enum ('owner','editor','viewer','emergency');
create type public.share_scope as enum ('profile','emergency','care');

create table public.households (
  id uuid primary key default gen_random_uuid(), name text not null,
  owner_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
create table public.household_members (
  household_id uuid references public.households(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade,
  role public.member_role not null default 'viewer', expires_at timestamptz,
  primary key(household_id,user_id)
);
create table public.health_profiles (
  id text primary key, household_id uuid references public.households(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  data jsonb not null default '{}', verified_at timestamptz, version integer not null default 1,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), deleted_at timestamptz
);
create table public.care_records (
  id uuid primary key default gen_random_uuid(), profile_id text not null references public.health_profiles(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  record_type text not null check(record_type in ('medication','appointment','timeline','vital','action_plan','caregiver','vaccine','lab','symptom','device','directive')),
  client_id text not null, data jsonb not null default '{}', occurred_at timestamptz,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), deleted_at timestamptz,
  unique(profile_id,record_type,client_id)
);
create table public.health_documents (
  id uuid primary key default gen_random_uuid(), profile_id text not null references public.health_profiles(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  title text not null, category text, storage_path text not null, mime_type text, size_bytes bigint,
  expires_at date, tags text[] default '{}', created_at timestamptz not null default now()
);
create table public.share_links (
  id uuid primary key default gen_random_uuid(), profile_id text not null references public.health_profiles(id) on delete cascade,
  created_by uuid not null references auth.users(id) on delete cascade, token_hash text not null unique,
  scope public.share_scope not null, expires_at timestamptz not null, revoked_at timestamptz,
  max_uses integer, use_count integer not null default 0, created_at timestamptz not null default now()
);
create table public.audit_events (
  id bigint generated always as identity primary key, actor_id uuid references auth.users(id) on delete set null,
  profile_id text, action text not null, object_type text, object_id text, metadata jsonb default '{}',
  ip inet, created_at timestamptz not null default now()
);
create table public.notification_jobs (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
  profile_id text references public.health_profiles(id) on delete cascade, kind text not null,
  payload jsonb not null default '{}', scheduled_for timestamptz not null, delivered_at timestamptz,
  created_at timestamptz not null default now()
);

create or replace function public.can_access_profile(pid text, required public.member_role default 'viewer') returns boolean
language sql stable security definer set search_path=public as $$
  select exists(select 1 from health_profiles p where p.id=pid and p.deleted_at is null and (
    p.owner_id=auth.uid() or exists(select 1 from household_members m where m.household_id=p.household_id and m.user_id=auth.uid()
      and (m.expires_at is null or m.expires_at>now()) and case required when 'viewer' then m.role in ('owner','editor','viewer') when 'editor' then m.role in ('owner','editor') when 'emergency' then true else m.role='owner' end)))
$$;

alter table public.households enable row level security; alter table public.household_members enable row level security;
alter table public.health_profiles enable row level security; alter table public.care_records enable row level security;
alter table public.health_documents enable row level security; alter table public.share_links enable row level security;
alter table public.audit_events enable row level security; alter table public.notification_jobs enable row level security;

create policy "households owner" on public.households for all using(owner_id=auth.uid()) with check(owner_id=auth.uid());
create policy "members see household" on public.household_members for select using(user_id=auth.uid() or exists(select 1 from households h where h.id=household_id and h.owner_id=auth.uid()));
create policy "owners manage members" on public.household_members for all using(exists(select 1 from households h where h.id=household_id and h.owner_id=auth.uid())) with check(exists(select 1 from households h where h.id=household_id and h.owner_id=auth.uid()));
create policy "profiles read" on public.health_profiles for select using(public.can_access_profile(id,'viewer'));
create policy "profiles insert" on public.health_profiles for insert with check(owner_id=auth.uid());
create policy "profiles update" on public.health_profiles for update using(public.can_access_profile(id,'editor'));
create policy "profiles delete" on public.health_profiles for delete using(owner_id=auth.uid());
create policy "care read" on public.care_records for select using(public.can_access_profile(profile_id,'viewer'));
create policy "care write" on public.care_records for all using(public.can_access_profile(profile_id,'editor')) with check(public.can_access_profile(profile_id,'editor') and owner_id=auth.uid());
create policy "documents read" on public.health_documents for select using(public.can_access_profile(profile_id,'viewer'));
create policy "documents write" on public.health_documents for all using(public.can_access_profile(profile_id,'editor')) with check(public.can_access_profile(profile_id,'editor') and owner_id=auth.uid());
create policy "shares owner" on public.share_links for all using(created_by=auth.uid()) with check(created_by=auth.uid());
create policy "audit own profile" on public.audit_events for select using(public.can_access_profile(profile_id,'viewer'));
create policy "notifications own" on public.notification_jobs for all using(user_id=auth.uid()) with check(user_id=auth.uid());

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('health-documents','health-documents',false,10485760,array['application/pdf','image/jpeg','image/png','text/plain']) on conflict(id) do nothing;
create policy "private health document read" on storage.objects for select using(bucket_id='health-documents' and auth.uid()::text=(storage.foldername(name))[1]);
create policy "private health document upload" on storage.objects for insert with check(bucket_id='health-documents' and auth.uid()::text=(storage.foldername(name))[1]);
create policy "private health document manage" on storage.objects for update using(bucket_id='health-documents' and auth.uid()::text=(storage.foldername(name))[1]);
create policy "private health document delete" on storage.objects for delete using(bucket_id='health-documents' and auth.uid()::text=(storage.foldername(name))[1]);

create index care_profile_type_idx on public.care_records(profile_id,record_type) where deleted_at is null;
create index notification_due_idx on public.notification_jobs(scheduled_for) where delivered_at is null;
create index audit_profile_idx on public.audit_events(profile_id,created_at desc);
