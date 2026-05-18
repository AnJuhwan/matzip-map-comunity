alter table public.places
add column if not exists photo_urls text[] not null default '{}';
