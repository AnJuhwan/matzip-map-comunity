create extension if not exists pgcrypto;

create table if not exists public.anonymous_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  nickname text not null check (char_length(nickname) between 1 and 24),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.places (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  address text not null check (char_length(address) between 1 and 180),
  latitude double precision not null,
  longitude double precision not null,
  category_id text not null,
  tag_ids text[] not null default '{}',
  hero_image_url text,
  status text not null default 'public' check (status in ('public', 'hidden', 'deleted')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.reviews (
  id uuid primary key default gen_random_uuid(),
  place_id uuid not null references public.places(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  nickname text not null check (char_length(nickname) between 1 and 24),
  price_range text not null,
  recommended_menu text not null check (char_length(recommended_menu) between 1 and 80),
  good_point text not null check (char_length(good_point) between 1 and 500),
  bad_point text not null check (char_length(bad_point) between 1 and 500),
  revisit_intent text not null check (revisit_intent in ('yes', 'maybe', 'no')),
  image_url text,
  status text not null default 'public' check (status in ('public', 'hidden', 'deleted')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.reports (
  id uuid primary key default gen_random_uuid(),
  target_type text not null check (target_type in ('place', 'review')),
  target_id uuid not null,
  reporter_id uuid not null references auth.users(id) on delete cascade,
  reason text not null check (char_length(reason) between 2 and 300),
  status text not null default 'open' check (status in ('open', 'reviewed', 'dismissed')),
  created_at timestamptz not null default now()
);

create index if not exists places_status_created_idx on public.places(status, created_at desc);
create index if not exists places_location_idx on public.places(latitude, longitude);
create index if not exists reviews_place_status_idx on public.reviews(place_id, status, created_at desc);
create index if not exists reports_target_idx on public.reports(target_type, target_id);

alter table public.anonymous_profiles enable row level security;
alter table public.places enable row level security;
alter table public.reviews enable row level security;
alter table public.reports enable row level security;

drop policy if exists "Profiles are owned by their anonymous user" on public.anonymous_profiles;
create policy "Profiles are owned by their anonymous user"
on public.anonymous_profiles
for all
to authenticated
using (id = auth.uid())
with check (id = auth.uid());

drop policy if exists "Public places are readable" on public.places;
create policy "Public places are readable"
on public.places
for select
to anon, authenticated
using (status = 'public');

drop policy if exists "Anonymous users can create places" on public.places;
create policy "Anonymous users can create places"
on public.places
for insert
to authenticated
with check (owner_id = auth.uid());

drop policy if exists "Owners can update their places" on public.places;
create policy "Owners can update their places"
on public.places
for update
to authenticated
using (owner_id = auth.uid())
with check (owner_id = auth.uid());

drop policy if exists "Public reviews are readable" on public.reviews;
create policy "Public reviews are readable"
on public.reviews
for select
to anon, authenticated
using (status = 'public');

drop policy if exists "Anonymous users can create reviews" on public.reviews;
create policy "Anonymous users can create reviews"
on public.reviews
for insert
to authenticated
with check (owner_id = auth.uid());

drop policy if exists "Owners can update their reviews" on public.reviews;
create policy "Owners can update their reviews"
on public.reviews
for update
to authenticated
using (owner_id = auth.uid())
with check (owner_id = auth.uid());

drop policy if exists "Authenticated users can report content" on public.reports;
create policy "Authenticated users can report content"
on public.reports
for insert
to authenticated
with check (reporter_id = auth.uid());

insert into storage.buckets (id, name, public)
values ('place-photos', 'place-photos', true)
on conflict (id) do nothing;

drop policy if exists "Place photos are public" on storage.objects;
create policy "Place photos are public"
on storage.objects
for select
to anon, authenticated
using (bucket_id = 'place-photos');

drop policy if exists "Users upload photos to their own folder" on storage.objects;
create policy "Users upload photos to their own folder"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'place-photos'
  and (storage.foldername(name))[1] = auth.uid()::text
);
