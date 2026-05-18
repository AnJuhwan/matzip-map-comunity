drop policy if exists "Owners can update their places" on public.places;
create policy "Owners can update their places"
on public.places
for update
to authenticated
using (
  owner_id = auth.uid()
  and status = 'public'
)
with check (
  owner_id = auth.uid()
  and status in ('public', 'deleted')
);

drop policy if exists "Owners can update their reviews" on public.reviews;
create policy "Owners can update their reviews"
on public.reviews
for update
to authenticated
using (
  owner_id = auth.uid()
  and status = 'public'
  and exists (
    select 1
    from public.places p
    where p.id = reviews.place_id
      and p.status = 'public'
  )
)
with check (
  owner_id = auth.uid()
  and status in ('public', 'deleted')
  and exists (
    select 1
    from public.places p
    where p.id = reviews.place_id
      and p.status = 'public'
  )
);
