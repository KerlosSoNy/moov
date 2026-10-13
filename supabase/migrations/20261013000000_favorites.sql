-- Favorite movies per user. The movie snapshot is stored so the favorites
-- screen renders without refetching each movie from Trakt.
create table public.favorites (
    user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
    movie_id bigint not null, -- Trakt id
    movie jsonb not null,
    created_at timestamptz not null default now(),
    primary key (user_id, movie_id)
);

alter table public.favorites enable row level security;

-- New tables aren't exposed to the API roles by default; RLS below still limits rows to the owner
grant select, insert, delete on public.favorites to authenticated;

create policy "Users read their own favorites"
    on public.favorites for select
    to authenticated
    using ((select auth.uid()) = user_id);

create policy "Users add their own favorites"
    on public.favorites for insert
    to authenticated
    with check ((select auth.uid()) = user_id);

create policy "Users remove their own favorites"
    on public.favorites for delete
    to authenticated
    using ((select auth.uid()) = user_id);
