-- Party Trail — Supabase schema
-- Paste into Supabase → SQL Editor → New query → Run. Safe to re-run.

create extension if not exists pgcrypto;

-- ─── Profiles ────────────────────────────────────────────────────────────────
create table if not exists public.profiles (
  id           uuid primary key references auth.users (id) on delete cascade,
  display_name text not null default 'Traveler',
  avatar_url   text,
  created_at   timestamptz not null default now()
);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, display_name, avatar_url)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name',
             new.raw_user_meta_data ->> 'name',
             split_part(new.email, '@', 1)),
    new.raw_user_meta_data ->> 'avatar_url'
  )
  on conflict (id) do update
    set display_name = excluded.display_name,
        avatar_url   = excluded.avatar_url;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ─── Trips & members ─────────────────────────────────────────────────────────
create table if not exists public.trips (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (char_length(name) between 1 and 80),
  destination text,
  start_date  date,
  end_date    date,
  invite_code text not null unique
              default upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6)),
  created_by  uuid not null default auth.uid() references auth.users (id) on delete cascade,
  created_at  timestamptz not null default now()
);

create table if not exists public.trip_members (
  trip_id   uuid not null references public.trips (id) on delete cascade,
  user_id   uuid not null references auth.users (id) on delete cascade,
  role      text not null default 'member' check (role in ('leader', 'member')),
  joined_at timestamptz not null default now(),
  primary key (trip_id, user_id)
);

-- Membership check used by every policy. SECURITY DEFINER avoids RLS recursion.
create or replace function public.is_trip_member(t uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.trip_members
    where trip_id = t and user_id = auth.uid()
  );
$$;

-- The creator becomes the party leader automatically.
create or replace function public.handle_new_trip()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  insert into public.trip_members (trip_id, user_id, role)
  values (new.id, new.created_by, 'leader')
  on conflict do nothing;
  return new;
end;
$$;

drop trigger if exists on_trip_created on public.trips;
create trigger on_trip_created
  after insert on public.trips
  for each row execute function public.handle_new_trip();

-- Join a trip with its invite code. Returns the trip id.
create or replace function public.join_trip(code text)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  t uuid;
begin
  if auth.uid() is null then
    raise exception 'Sign in to join a trip';
  end if;
  select id into t from public.trips where invite_code = upper(trim(code));
  if t is null then
    raise exception 'No trip uses invite code %', upper(trim(code));
  end if;
  insert into public.trip_members (trip_id, user_id)
  values (t, auth.uid())
  on conflict do nothing;
  return t;
end;
$$;

-- ─── Live locations (one row per member per trip) ────────────────────────────
create table if not exists public.locations (
  trip_id    uuid not null references public.trips (id) on delete cascade,
  user_id    uuid not null references auth.users (id) on delete cascade,
  lat        double precision not null,
  lng        double precision not null,
  accuracy   double precision,
  updated_at timestamptz not null default now(),
  primary key (trip_id, user_id)
);

-- ─── Itinerary ───────────────────────────────────────────────────────────────
create table if not exists public.itinerary_items (
  id         uuid primary key default gen_random_uuid(),
  trip_id    uuid not null references public.trips (id) on delete cascade,
  title      text not null check (char_length(title) between 1 and 120),
  kind       text not null default 'activity'
             check (kind in ('activity', 'food', 'transport', 'sight')),
  starts_at  timestamptz not null,
  place_name text,
  lat        double precision,
  lng        double precision,
  notes      text,
  created_by uuid not null default auth.uid() references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);
create index if not exists itinerary_items_trip_idx on public.itinerary_items (trip_id, starts_at);

-- ─── Stays (hotels, hostels, campsites) ──────────────────────────────────────
create table if not exists public.stays (
  id         uuid primary key default gen_random_uuid(),
  trip_id    uuid not null references public.trips (id) on delete cascade,
  name       text not null check (char_length(name) between 1 and 120),
  address    text,
  lat        double precision not null,
  lng        double precision not null,
  check_in   date,
  check_out  date,
  notes      text,
  created_by uuid not null default auth.uid() references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);
create index if not exists stays_trip_idx on public.stays (trip_id);

-- ─── Row Level Security ──────────────────────────────────────────────────────
alter table public.profiles        enable row level security;
alter table public.trips           enable row level security;
alter table public.trip_members    enable row level security;
alter table public.locations       enable row level security;
alter table public.itinerary_items enable row level security;
alter table public.stays           enable row level security;

-- Profiles: you see yourself and anyone you share a trip with.
drop policy if exists "profiles read" on public.profiles;
create policy "profiles read" on public.profiles for select using (
  id = auth.uid() or exists (
    select 1 from public.trip_members a
    join public.trip_members b on a.trip_id = b.trip_id
    where a.user_id = auth.uid() and b.user_id = profiles.id
  )
);
drop policy if exists "profiles update self" on public.profiles;
create policy "profiles update self" on public.profiles for update using (id = auth.uid());

-- Trips
drop policy if exists "trips read" on public.trips;
create policy "trips read" on public.trips for select using (public.is_trip_member(id));
drop policy if exists "trips insert" on public.trips;
create policy "trips insert" on public.trips for insert with check (created_by = auth.uid());
drop policy if exists "trips update" on public.trips;
create policy "trips update" on public.trips for update using (created_by = auth.uid());
drop policy if exists "trips delete" on public.trips;
create policy "trips delete" on public.trips for delete using (created_by = auth.uid());

-- Members: see your party; leave on your own. Joining goes through join_trip().
drop policy if exists "members read" on public.trip_members;
create policy "members read" on public.trip_members for select using (public.is_trip_member(trip_id));
drop policy if exists "members leave" on public.trip_members;
create policy "members leave" on public.trip_members for delete using (user_id = auth.uid());

-- Locations: the party reads; you write only your own row.
drop policy if exists "locations read" on public.locations;
create policy "locations read" on public.locations for select using (public.is_trip_member(trip_id));
drop policy if exists "locations write" on public.locations;
create policy "locations write" on public.locations for insert
  with check (user_id = auth.uid() and public.is_trip_member(trip_id));
drop policy if exists "locations update" on public.locations;
create policy "locations update" on public.locations for update using (user_id = auth.uid());
drop policy if exists "locations delete" on public.locations;
create policy "locations delete" on public.locations for delete using (user_id = auth.uid());

-- Itinerary & stays: any party member can read and edit.
drop policy if exists "itinerary all" on public.itinerary_items;
create policy "itinerary all" on public.itinerary_items for all
  using (public.is_trip_member(trip_id)) with check (public.is_trip_member(trip_id));
drop policy if exists "stays all" on public.stays;
create policy "stays all" on public.stays for all
  using (public.is_trip_member(trip_id)) with check (public.is_trip_member(trip_id));

-- ─── Realtime ────────────────────────────────────────────────────────────────
do $$
declare
  t text;
begin
  foreach t in array array['locations', 'itinerary_items', 'stays', 'trip_members'] loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;

-- Deletes over realtime need the full old row to carry trip_id.
alter table public.locations       replica identity full;
alter table public.itinerary_items replica identity full;
alter table public.stays           replica identity full;
alter table public.trip_members    replica identity full;
