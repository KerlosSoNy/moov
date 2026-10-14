-- Moov community ratings (1–5 stars), independent of third-party ratings.
-- content_rating_stats is maintained by trigger with atomic increments, so
-- reading the average is O(1) and clients can never write it.

create table public.content_ratings (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
    content_type text not null check (content_type in ('movie', 'series')),
    content_provider text not null check (content_provider in ('trakt', 'shoofaflam')),
    content_id text not null check (char_length(content_id) between 1 and 200),
    rating smallint not null check (rating between 1 and 5),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint content_ratings_one_per_user unique (user_id, content_provider, content_type, content_id)
);

alter table public.content_ratings enable row level security;

revoke all on table public.content_ratings from anon, authenticated;
-- SELECT is needed for INSERT … ON CONFLICT; RLS limits it to the user's own rows
grant select, delete on public.content_ratings to authenticated;
grant insert (content_type, content_provider, content_id, rating) on public.content_ratings to authenticated;
grant update (rating) on public.content_ratings to authenticated;

create policy "Users read their own ratings"
    on public.content_ratings for select
    to authenticated
    using (user_id = (select auth.uid()));

create policy "Users add their own ratings"
    on public.content_ratings for insert
    to authenticated
    with check (user_id = (select auth.uid()));

create policy "Users change their own ratings"
    on public.content_ratings for update
    to authenticated
    using (user_id = (select auth.uid()))
    with check (user_id = (select auth.uid()));

create policy "Users remove their own ratings"
    on public.content_ratings for delete
    to authenticated
    using (user_id = (select auth.uid()));

create table public.content_rating_stats (
    content_provider text not null,
    content_type text not null,
    content_id text not null,
    rating_count integer not null default 0 check (rating_count >= 0),
    rating_sum integer not null default 0 check (rating_sum >= 0),
    average numeric(3, 2) generated always as (
        case when rating_count > 0 then round(rating_sum::numeric / rating_count, 2) end
    ) stored,
    updated_at timestamptz not null default now(),
    primary key (content_provider, content_type, content_id)
);

alter table public.content_rating_stats enable row level security;

revoke all on table public.content_rating_stats from anon, authenticated;
grant select on public.content_rating_stats to anon, authenticated;

create policy "Anyone reads rating stats"
    on public.content_rating_stats for select
    to anon, authenticated
    using (true);

create function public.content_ratings_before_write()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
    if tg_op = 'UPDATE' and (new.user_id, new.content_provider, new.content_type, new.content_id)
        is distinct from (old.user_id, old.content_provider, old.content_type, old.content_id) then
        raise exception 'immutable_field' using errcode = '42501';
    end if;
    if tg_op = 'INSERT' then
        new.created_at := now();
    end if;
    new.updated_at := now();
    return new;
end;
$$;

create trigger content_ratings_before_write
    before insert or update on public.content_ratings
    for each row execute function public.content_ratings_before_write();

create function public.content_ratings_update_stats()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
    if tg_op = 'INSERT' then
        insert into public.content_rating_stats as s (content_provider, content_type, content_id, rating_count, rating_sum)
        values (new.content_provider, new.content_type, new.content_id, 1, new.rating)
        on conflict (content_provider, content_type, content_id) do update
            set rating_count = s.rating_count + 1, rating_sum = s.rating_sum + new.rating, updated_at = now();
    elsif tg_op = 'UPDATE' then
        update public.content_rating_stats
            set rating_sum = rating_sum - old.rating + new.rating, updated_at = now()
            where (content_provider, content_type, content_id) = (new.content_provider, new.content_type, new.content_id);
    else
        update public.content_rating_stats
            set rating_count = rating_count - 1, rating_sum = rating_sum - old.rating, updated_at = now()
            where (content_provider, content_type, content_id) = (old.content_provider, old.content_type, old.content_id);
    end if;
    return null;
end;
$$;

create trigger content_ratings_update_stats
    after insert or update of rating or delete on public.content_ratings
    for each row execute function public.content_ratings_update_stats();

-- Community average, count and the caller's own rating in one round trip
create function public.get_content_rating(p_provider text, p_type text, p_content_id text)
returns table (average numeric, rating_count integer, my_rating smallint)
language sql
stable
security invoker
set search_path = ''
as $$
    select
        s.average,
        coalesce(s.rating_count, 0),
        (select r.rating from public.content_ratings r
            where r.user_id = (select auth.uid())
                and r.content_provider = p_provider and r.content_type = p_type and r.content_id = p_content_id)
    from (select 1) one
    left join public.content_rating_stats s
        on s.content_provider = p_provider and s.content_type = p_type and s.content_id = p_content_id;
$$;

-- Sets (1–5) or clears (null) the caller's rating; returns the fresh stats.
-- Runs as the caller, so the grants and policies above still apply.
create function public.set_content_rating(p_provider text, p_type text, p_content_id text, p_rating smallint)
returns table (average numeric, rating_count integer, my_rating smallint)
language plpgsql
security invoker
set search_path = ''
as $$
begin
    if (select auth.uid()) is null then
        raise exception 'Not signed in' using errcode = '42501';
    end if;
    if p_rating is null then
        delete from public.content_ratings
            where user_id = (select auth.uid())
                and content_provider = p_provider and content_type = p_type and content_id = p_content_id;
    else
        insert into public.content_ratings (content_provider, content_type, content_id, rating)
        values (p_provider, p_type, p_content_id, p_rating)
        on conflict (user_id, content_provider, content_type, content_id) do update
            set rating = excluded.rating;
    end if;
    return query select * from public.get_content_rating(p_provider, p_type, p_content_id);
end;
$$;

revoke execute on function
    public.content_ratings_before_write(),
    public.content_ratings_update_stats(),
    public.get_content_rating(text, text, text),
    public.set_content_rating(text, text, text, smallint)
from public, anon, authenticated;
grant execute on function
    public.get_content_rating(text, text, text),
    public.set_content_rating(text, text, text, smallint)
to authenticated;
