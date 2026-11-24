create table if not exists public.reviews (
  id uuid primary key default gen_random_uuid(),
  customer_name text not null check (char_length(btrim(customer_name)) between 2 and 80),
  rating smallint not null check (rating between 1 and 5),
  comment text not null check (char_length(btrim(comment)) between 10 and 1200),
  status text not null default 'pending' check (status in ('pending', 'approved')),
  created_at timestamptz not null default now()
);

create table if not exists public.review_admins (
  user_id uuid primary key references auth.users(id) on delete cascade
);

alter table public.reviews enable row level security;
alter table public.review_admins enable row level security;

create or replace function public.is_review_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.review_admins
    where user_id = (select auth.uid())
  );
$$;

revoke all on function public.is_review_admin() from public;
grant execute on function public.is_review_admin() to anon, authenticated;

revoke all on table public.reviews from anon, authenticated;
grant select on table public.reviews to anon, authenticated;
grant insert (customer_name, rating, comment) on table public.reviews to anon, authenticated;
grant update (status) on table public.reviews to authenticated;
grant delete on table public.reviews to authenticated;

revoke all on table public.review_admins from anon, authenticated;

drop policy if exists "Anyone can read approved reviews and admins can read all" on public.reviews;
create policy "Anyone can read approved reviews and admins can read all"
  on public.reviews
  for select
  to anon, authenticated
  using (status = 'approved' or (select public.is_review_admin()));

drop policy if exists "Visitors can submit pending reviews" on public.reviews;
create policy "Visitors can submit pending reviews"
  on public.reviews
  for insert
  to anon, authenticated
  with check (status = 'pending');

drop policy if exists "Admins can approve reviews" on public.reviews;
create policy "Admins can approve reviews"
  on public.reviews
  for update
  to authenticated
  using ((select public.is_review_admin()))
  with check ((select public.is_review_admin()));

drop policy if exists "Admins can delete reviews" on public.reviews;
create policy "Admins can delete reviews"
  on public.reviews
  for delete
  to authenticated
  using ((select public.is_review_admin()));

-- After creating your dashboard user in Supabase Auth, authorize its email:
-- insert into public.review_admins (user_id)
-- select id from auth.users where email = 'YOUR_ADMIN_EMAIL'
-- on conflict do nothing;
