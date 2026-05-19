alter table public.reviews
add column if not exists image_urls text[] not null default '{}';

update public.reviews
set image_urls = array[image_url]
where image_url is not null
  and coalesce(array_length(image_urls, 1), 0) = 0;
