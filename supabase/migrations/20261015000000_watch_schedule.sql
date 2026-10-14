-- Personal watch schedule: "watch this title at this date and time".
-- One entry per user and title; scheduling it again moves it. The title and
-- poster are stored so the schedule screen renders without refetching each
-- title (same approach as favorites). Reminders are local notifications on
-- the device that created them, so nothing here is sent by the server.

create table public.watch_schedule (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
    content_type text not null check (content_type in ('movie', 'series')),
    content_provider text not null check (content_provider in ('trakt', 'shoofaflam')),
    content_id text not null check (char_length(content_id) between 1 and 200),
    -- Route slug for Trakt titles (their detail screen is slug based)
    content_slug text check (content_slug is null or char_length(content_slug) <= 200),
    title_ar text check (title_ar is null or char_length(title_ar) <= 300),
    title_en text check (title_en is null or char_length(title_en) <= 300),
    poster_url text check (poster_url is null or (poster_url ~ '^https://' and char_length(poster_url) <= 1000)),
    scheduled_at timestamptz not null,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint watch_schedule_has_title check (title_ar is not null or title_en is not null),
    constraint watch_schedule_one_per_title unique (user_id, content_provider, content_type, content_id)
);

create index watch_schedule_user_time_idx on public.watch_schedule (user_id, scheduled_at);

alter table public.watch_schedule enable row level security;

revoke all on table public.watch_schedule from anon, authenticated;
-- SELECT is also needed for INSERT … ON CONFLICT; RLS limits it to the user's own rows
grant select, delete on public.watch_schedule to authenticated;
grant insert (content_type, content_provider, content_id, content_slug, title_ar, title_en, poster_url, scheduled_at)
    on public.watch_schedule to authenticated;
grant update (content_slug, title_ar, title_en, poster_url, scheduled_at) on public.watch_schedule to authenticated;

create policy "Users read their own schedule"
    on public.watch_schedule for select
    to authenticated
    using (user_id = (select auth.uid()));

create policy "Users add to their own schedule"
    on public.watch_schedule for insert
    to authenticated
    with check (user_id = (select auth.uid()));

create policy "Users change their own schedule"
    on public.watch_schedule for update
    to authenticated
    using (user_id = (select auth.uid()))
    with check (user_id = (select auth.uid()));

create policy "Users remove from their own schedule"
    on public.watch_schedule for delete
    to authenticated
    using (user_id = (select auth.uid()));

-- touch_updated_at() comes from the push notifications migration
create trigger watch_schedule_touch
    before update on public.watch_schedule
    for each row execute function public.touch_updated_at();
