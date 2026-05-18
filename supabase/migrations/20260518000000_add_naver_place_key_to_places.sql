alter table public.places
add column if not exists naver_place_key text;

create unique index if not exists places_naver_place_key_idx
on public.places(naver_place_key)
where naver_place_key is not null and status = 'public';
