-- Push notifications: device tokens, user preferences, admin-managed daily
-- campaigns, per-device delivery log and an outbox for event notifications
-- (comment replies, moderation). Sending happens in the
-- `notifications-dispatch` Edge Function, driven by Supabase Cron (next
-- migration). The notif_* functions below are its set-based building blocks
-- and are callable by the service role only.
--
-- Delivery states, in the order Expo reports them:
--   queued → sending → ticket_ok   (Expo accepted the message)
--                    → ticket_error (Expo rejected it, error_code set)
--          ticket_ok → delivered   (receipt ok: handed to APNs/FCM)
--                    → failed      (receipt error)
--   sending → unknown: the request's outcome is unknown (timeout, crash), so
--             it is NOT retried, to avoid sending the same message twice.

-- ── Preferences ─────────────────────────────────────────────────────────────
-- No row means the defaults below.
create table public.notification_preferences (
    user_id uuid primary key default auth.uid() references auth.users (id) on delete cascade,
    daily_discovery boolean not null default true,
    comment_replies boolean not null default true,
    moderation_updates boolean not null default true,
    language text not null default 'en' check (language in ('ar', 'en')),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

alter table public.notification_preferences enable row level security;

revoke all on table public.notification_preferences from anon, authenticated;
grant select on public.notification_preferences to authenticated;
grant insert (daily_discovery, comment_replies, moderation_updates, language) on public.notification_preferences to authenticated;
grant update (daily_discovery, comment_replies, moderation_updates, language) on public.notification_preferences to authenticated;

create policy "Users read their own notification preferences"
    on public.notification_preferences for select
    to authenticated
    using (user_id = (select auth.uid()));

create policy "Users create their own notification preferences"
    on public.notification_preferences for insert
    to authenticated
    with check (user_id = (select auth.uid()));

create policy "Users change their own notification preferences"
    on public.notification_preferences for update
    to authenticated
    using (user_id = (select auth.uid()))
    with check (user_id = (select auth.uid()));

create function public.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
    new.updated_at := now();
    return new;
end;
$$;

create trigger notification_preferences_touch
    before update on public.notification_preferences
    for each row execute function public.touch_updated_at();

-- ── Device tokens ───────────────────────────────────────────────────────────
-- Only signed-in users register tokens (the app has no guest mode). Tokens are
-- never readable by clients; register/unregister go through RPCs so a device
-- that switches accounts moves its token to the new user.
create table public.user_push_tokens (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references auth.users (id) on delete cascade,
    expo_push_token text not null unique
        check (expo_push_token ~ '^Expo(nent)?PushToken\[[A-Za-z0-9_\-]{8,200}\]$'),
    platform text not null check (platform in ('ios', 'android', 'web')),
    is_active boolean not null default true,
    deactivated_reason text check (deactivated_reason in ('logout', 'device_not_registered', 'permission_denied', 'replaced')),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    last_seen_at timestamptz not null default now()
);

create index user_push_tokens_user_idx on public.user_push_tokens (user_id) where is_active;

alter table public.user_push_tokens enable row level security;
revoke all on table public.user_push_tokens from anon, authenticated;

create function public.register_push_token(p_token text, p_platform text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
    uid uuid := (select auth.uid());
begin
    if uid is null then
        raise exception 'Not signed in' using errcode = '42501';
    end if;
    insert into public.user_push_tokens (user_id, expo_push_token, platform)
    values (uid, p_token, p_platform)
    on conflict (expo_push_token) do update
        set user_id = uid,
            platform = excluded.platform,
            is_active = true,
            deactivated_reason = null,
            updated_at = now(),
            last_seen_at = now();
end;
$$;

-- Called before sign out and when the user turns notifications off
create function public.unregister_push_token(p_token text, p_reason text default 'logout')
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
    update public.user_push_tokens
        set is_active = false,
            deactivated_reason = case when p_reason in ('logout', 'permission_denied') then p_reason else 'logout' end,
            updated_at = now()
        where expo_push_token = p_token and user_id = (select auth.uid());
end;
$$;

-- ── Campaigns ───────────────────────────────────────────────────────────────
-- Each enabled campaign is sent once per local day at schedule_time in its
-- timezone. Admins edit rows directly (RLS: admins only); the dispatcher
-- reads them every run, so edits take effect on the next cron tick.
create table public.notification_campaigns (
    id uuid primary key default gen_random_uuid(),
    name text not null check (char_length(name) between 1 and 120),
    campaign_type text not null default 'daily_discovery'
        check (campaign_type in ('daily_discovery', 'new_content', 'reminder')),
    title_ar text not null check (char_length(title_ar) between 1 and 100),
    body_ar text not null check (char_length(body_ar) between 1 and 240),
    title_en text not null check (char_length(title_en) between 1 and 100),
    body_en text not null check (char_length(body_en) between 1 and 240),
    -- Rotate through notification_templates instead of always using the text above
    use_template_rotation boolean not null default false,
    -- none: plain message; fixed: the title below; catalog: a pick from today's catalog
    recommendation_source text not null default 'none' check (recommendation_source in ('none', 'fixed', 'catalog')),
    content_provider text check (content_provider in ('trakt', 'shoofaflam')),
    content_type text check (content_type in ('movie', 'series')),
    content_id text check (char_length(content_id) between 1 and 200),
    content_title_ar text,
    content_title_en text,
    schedule_time time not null default '19:00',
    timezone text not null default 'Africa/Cairo',
    target_audience text not null default 'all' check (target_audience in ('all', 'ar', 'en')),
    is_enabled boolean not null default false,
    -- Last time is_enabled became true; runs scheduled before it are never sent
    enabled_at timestamptz,
    created_by uuid default auth.uid() references auth.users (id) on delete set null,
    updated_by uuid references auth.users (id) on delete set null,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint notification_campaigns_fixed_content check (
        recommendation_source <> 'fixed'
        or (content_provider is not null and content_type is not null and content_id is not null)
    )
);

create function public.notification_campaigns_before_write()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
    -- Rejects unknown zones ("invalid time zone") before they reach the scheduler
    perform now() at time zone new.timezone;
    new.updated_at := now();
    new.updated_by := (select auth.uid());
    if new.is_enabled and (tg_op = 'INSERT' or not old.is_enabled) then
        new.enabled_at := now();
    end if;
    if tg_op = 'INSERT' then
        new.created_by := coalesce((select auth.uid()), new.created_by);
        new.created_at := now();
    else
        new.created_by := old.created_by;
        new.created_at := old.created_at;
    end if;
    return new;
end;
$$;

create trigger notification_campaigns_before_write
    before insert or update on public.notification_campaigns
    for each row execute function public.notification_campaigns_before_write();

-- Rotation pool for campaigns with use_template_rotation. {title} is replaced
-- by the recommended title when there is one; templates using {title} are
-- skipped when there isn't.
create table public.notification_templates (
    id uuid primary key default gen_random_uuid(),
    title_ar text not null check (char_length(title_ar) between 1 and 100),
    body_ar text not null check (char_length(body_ar) between 1 and 240),
    title_en text not null check (char_length(title_en) between 1 and 100),
    body_en text not null check (char_length(body_en) between 1 and 240),
    is_active boolean not null default true,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create trigger notification_templates_touch
    before update on public.notification_templates
    for each row execute function public.touch_updated_at();

insert into public.notification_templates (title_en, body_en, title_ar, body_ar) values
    ('🎬 Moov', 'Discover your next favorite movie on Moov!', '🎬 Moov', 'اكتشف فيلمك الجديد النهارده على Moov!'),
    ('🍿 Movie time?', 'Looking for something new to watch? Explore today''s picks.', '🍿 وقت فيلم؟', 'بتدور على حاجة جديدة تتفرج عليها؟ شوف ترشيحات النهارده.'),
    ('✨ Tonight on Moov', 'Your next movie night starts with Moov.', '✨ الليلة على Moov', 'سهرتك الجاية بتبدأ من Moov.'),
    ('🎥 Today''s pick', 'Tonight''s pick: {title}. Tap to see where to watch.', '🎥 ترشيح النهارده', 'ترشيح الليلة: {title}. اضغط وشوف تتفرج عليه فين.');

-- ── Executions, deliveries, events ──────────────────────────────────────────

create table public.campaign_executions (
    id uuid primary key default gen_random_uuid(),
    campaign_id uuid not null references public.notification_campaigns (id) on delete cascade,
    -- The campaign's local calendar day this run belongs to
    scheduled_date date not null,
    scheduled_for timestamptz not null,
    status text not null default 'preparing' check (status in ('preparing', 'sending', 'completed', 'failed')),
    -- Resolved per-language text and deep link actually sent
    message jsonb,
    eligible_count integer not null default 0,
    submitted_count integer not null default 0,
    ticket_ok_count integer not null default 0,
    ticket_error_count integer not null default 0,
    delivered_count integer not null default 0,
    delivery_error_count integer not null default 0,
    unknown_count integer not null default 0,
    error text,
    started_at timestamptz not null default now(),
    finished_at timestamptz,
    updated_at timestamptz not null default now(),
    -- Idempotency: at most one run per campaign per local day
    constraint campaign_executions_once_per_day unique (campaign_id, scheduled_date)
);

create index campaign_executions_recent_idx on public.campaign_executions (started_at desc);

-- Outbox written by triggers; the dispatcher turns rows into deliveries
create table public.notification_events (
    id bigint generated always as identity primary key,
    kind text not null check (kind in ('comment_reply', 'moderation')),
    recipient_user_id uuid not null references auth.users (id) on delete cascade,
    payload jsonb not null default '{}'::jsonb,
    status text not null default 'pending' check (status in ('pending', 'processed')),
    created_at timestamptz not null default now(),
    processed_at timestamptz
);

create index notification_events_pending_idx on public.notification_events (id) where status = 'pending';

create table public.notification_deliveries (
    id bigint generated always as identity primary key,
    kind text not null check (kind in ('campaign', 'test', 'comment_reply', 'moderation')),
    execution_id uuid references public.campaign_executions (id) on delete cascade,
    campaign_id uuid references public.notification_campaigns (id) on delete set null,
    event_id bigint references public.notification_events (id) on delete set null,
    user_id uuid references auth.users (id) on delete cascade,
    token_id uuid not null references public.user_push_tokens (id) on delete cascade,
    -- Campaign local day; set for campaign deliveries only
    scheduled_date date,
    title text not null,
    body text not null,
    data jsonb not null default '{}'::jsonb,
    status text not null default 'queued'
        check (status in ('queued', 'sending', 'ticket_ok', 'ticket_error', 'delivered', 'failed', 'unknown')),
    attempts smallint not null default 0,
    ticket_id text,
    error_code text,
    error_message text,
    created_at timestamptz not null default now(),
    submitted_at timestamptz,
    receipt_checked_at timestamptz,
    updated_at timestamptz not null default now(),
    constraint notification_deliveries_campaign_fields check (kind <> 'campaign' or (execution_id is not null and scheduled_date is not null))
);

-- At most one campaign notification per device per day, across all campaigns
create unique index notification_deliveries_one_campaign_per_device_day
    on public.notification_deliveries (token_id, scheduled_date)
    where kind = 'campaign';
-- One delivery per event and device
create unique index notification_deliveries_event_token
    on public.notification_deliveries (event_id, token_id)
    where event_id is not null;
create index notification_deliveries_queue_idx on public.notification_deliveries (id) where status = 'queued';
create index notification_deliveries_sending_idx on public.notification_deliveries (updated_at) where status = 'sending';
create index notification_deliveries_receipts_idx on public.notification_deliveries (submitted_at)
    where status = 'ticket_ok' and receipt_checked_at is null;
create index notification_deliveries_execution_idx on public.notification_deliveries (execution_id, status);
create index notification_deliveries_created_idx on public.notification_deliveries (created_at desc);

alter table public.notification_campaigns enable row level security;
alter table public.notification_templates enable row level security;
alter table public.campaign_executions enable row level security;
alter table public.notification_events enable row level security;
alter table public.notification_deliveries enable row level security;

revoke all on table
    public.notification_campaigns, public.notification_templates, public.campaign_executions,
    public.notification_events, public.notification_deliveries
from anon, authenticated;

-- Admin panel: full control of campaigns and templates, read-only logs
grant select, insert, update, delete on public.notification_campaigns, public.notification_templates to authenticated;
grant select on public.campaign_executions, public.notification_deliveries to authenticated;

create policy "Admins manage campaigns" on public.notification_campaigns
    for all to authenticated
    using ((select public.is_admin())) with check ((select public.is_admin()));
create policy "Admins manage templates" on public.notification_templates
    for all to authenticated
    using ((select public.is_admin())) with check ((select public.is_admin()));
create policy "Admins read executions" on public.campaign_executions
    for select to authenticated using ((select public.is_admin()));
create policy "Admins read deliveries" on public.notification_deliveries
    for select to authenticated using ((select public.is_admin()));

-- App route for a title, as the app's contentHref() builds it. Trakt accepts
-- numeric ids wherever it accepts slugs.
create function public.content_url(p_provider text, p_type text, p_content_id text)
returns text
language sql
immutable
set search_path = ''
as $$
    select case
        when p_provider = 'trakt' and p_type = 'movie' then '/movie/' || p_content_id
        else '/content/' || p_provider || '/' || p_type || '/' || p_content_id
    end;
$$;

-- ── Event triggers ──────────────────────────────────────────────────────────

-- A reply notifies the author of the comment replied to (not themselves)
create function public.comments_enqueue_reply_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
    parent_author uuid;
begin
    if new.parent_comment_id is null then
        return null;
    end if;
    select user_id into parent_author from public.comments where id = new.parent_comment_id;
    if parent_author is null or parent_author = new.user_id then
        return null;
    end if;
    insert into public.notification_events (kind, recipient_user_id, payload)
    values ('comment_reply', parent_author, jsonb_build_object(
        'comment_id', new.id,
        'parent_comment_id', new.parent_comment_id,
        'replier_name', (select display_name from public.profiles where id = new.user_id),
        'content_provider', new.content_provider,
        'content_type', new.content_type,
        'content_id', new.content_id
    ));
    return null;
end;
$$;

create trigger comments_enqueue_reply_event
    after insert on public.comments
    for each row execute function public.comments_enqueue_reply_event();

-- Tell authors when a moderator removes their comment
create function public.comments_enqueue_moderation_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
    if new.deletion_reason = 'moderator' and old.deletion_reason is distinct from 'moderator' then
        insert into public.notification_events (kind, recipient_user_id, payload)
        values ('moderation', new.user_id, jsonb_build_object(
            'comment_id', new.id,
            'content_provider', new.content_provider,
            'content_type', new.content_type,
            'content_id', new.content_id
        ));
    end if;
    return null;
end;
$$;

create trigger comments_enqueue_moderation_event
    after update of deletion_reason on public.comments
    for each row execute function public.comments_enqueue_moderation_event();

-- ── Scheduling helpers ──────────────────────────────────────────────────────

-- The run for a local day: schedule_time on that date in the campaign's zone
create function public.campaign_run_at(p_day date, p_time time, p_timezone text)
returns timestamptz
language sql
stable
set search_path = ''
as $$
    select (p_day + p_time) at time zone p_timezone;
$$;

-- Next run strictly after now (null when disabled)
create function public.campaign_next_run(p_campaign public.notification_campaigns)
returns timestamptz
language sql
stable
set search_path = ''
as $$
    select case when p_campaign.is_enabled then (
        select min(run_at) from (
            select public.campaign_run_at((now() at time zone p_campaign.timezone)::date + d, p_campaign.schedule_time, p_campaign.timezone) as run_at
            from generate_series(0, 1) d
        ) runs
        where run_at > now()
    ) end;
$$;

-- ── Dispatcher building blocks (service role only) ──────────────────────────

-- Opens today's execution for every enabled campaign whose run time has
-- passed within the catch-up window, and returns executions still waiting
-- for a message (including ones a crashed run left behind). The unique
-- (campaign_id, scheduled_date) constraint makes concurrent calls safe.
create function public.notif_claim_due_campaigns(p_catch_up interval default interval '3 hours')
returns table (
    execution_id uuid,
    campaign_id uuid,
    scheduled_date date
)
language plpgsql
security definer
set search_path = ''
as $$
begin
    insert into public.campaign_executions (campaign_id, scheduled_date, scheduled_for)
    select c.id, runs.day, runs.run_at
    from public.notification_campaigns c
    cross join lateral (
        select day, public.campaign_run_at(day, c.schedule_time, c.timezone) as run_at
        from (
            select (now() at time zone c.timezone)::date - d as day from generate_series(0, 1) d
        ) days
    ) runs
    where c.is_enabled
        and runs.run_at <= now()
        and runs.run_at > now() - p_catch_up
        -- Turning a campaign on after today's time doesn't send late
        and runs.run_at >= c.enabled_at
    on conflict on constraint campaign_executions_once_per_day do nothing;

    return query
    select e.id, e.campaign_id, e.scheduled_date
    from public.campaign_executions e
    where e.status = 'preparing' and e.message is null and e.started_at > now() - interval '1 day';
end;
$$;

-- Stores the resolved message and fans it out to one queued delivery per
-- eligible device. Eligible: active token, daily_discovery not turned off,
-- language matching the audience. A device that already got a campaign
-- notification that day is skipped by the unique index.
-- p_message: { title_ar, body_ar, title_en, body_en, data }
create function public.notif_prepare_execution(p_execution_id uuid, p_message jsonb)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
    exec public.campaign_executions;
    campaign public.notification_campaigns;
    queued integer;
begin
    select * into exec from public.campaign_executions where id = p_execution_id for update;
    if not found or exec.status <> 'preparing' or exec.message is not null then
        return 0;
    end if;
    select * into campaign from public.notification_campaigns where id = exec.campaign_id;

    insert into public.notification_deliveries (kind, execution_id, campaign_id, user_id, token_id, scheduled_date, title, body, data)
    select
        'campaign', exec.id, exec.campaign_id, t.user_id, t.id, exec.scheduled_date,
        case when lang = 'ar' then p_message ->> 'title_ar' else p_message ->> 'title_en' end,
        case when lang = 'ar' then p_message ->> 'body_ar' else p_message ->> 'body_en' end,
        coalesce(p_message -> 'data', '{}'::jsonb) || jsonb_build_object('kind', 'campaign', 'campaign_id', exec.campaign_id)
    from public.user_push_tokens t
    left join public.notification_preferences p on p.user_id = t.user_id
    cross join lateral (select coalesce(p.language, 'en') as lang) l
    where t.is_active
        and coalesce(p.daily_discovery, true)
        and (campaign.target_audience = 'all' or campaign.target_audience = lang)
    on conflict do nothing;
    get diagnostics queued = row_count;

    update public.campaign_executions
        set message = p_message, status = 'sending', eligible_count = queued, updated_at = now()
        where id = exec.id;
    return queued;
end;
$$;

-- Turns pending outbox events into deliveries, honoring preferences.
-- p_messages: { comment_reply: {title_ar, body_ar, title_en, body_en}, moderation: {...} }
-- where {name} in the body is replaced by the replier's name.
create function public.notif_expand_events(p_messages jsonb, p_limit integer default 500)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
    expanded integer;
begin
    with batch as (
        select e.* from public.notification_events e
        where e.status = 'pending'
        order by e.id
        limit p_limit
        for update skip locked
    ), inserted as (
        insert into public.notification_deliveries (kind, event_id, user_id, token_id, title, body, data)
        select
            b.kind, b.id, b.recipient_user_id, t.id,
            p_messages -> b.kind ->> ('title_' || lang),
            replace(p_messages -> b.kind ->> ('body_' || lang), '{name}', coalesce(nullif(b.payload ->> 'replier_name', ''), 'Moov')),
            jsonb_build_object('kind', b.kind, 'url', public.content_url(
                b.payload ->> 'content_provider', b.payload ->> 'content_type', b.payload ->> 'content_id'
            ) || '?focus=comments')
        from batch b
        join public.user_push_tokens t on t.user_id = b.recipient_user_id and t.is_active
        left join public.notification_preferences p on p.user_id = b.recipient_user_id
        cross join lateral (select coalesce(p.language, 'en') as lang) l
        where (b.kind = 'comment_reply' and coalesce(p.comment_replies, true))
            or (b.kind = 'moderation' and coalesce(p.moderation_updates, true))
        on conflict do nothing
        returning 1
    )
    update public.notification_events e
        set status = 'processed', processed_at = now()
        from batch b
        where e.id = b.id;
    get diagnostics expanded = row_count;
    return expanded;
end;
$$;

-- Claims up to p_limit queued deliveries for sending. SKIP LOCKED lets two
-- overlapping dispatcher runs split the queue instead of double sending.
create function public.notif_claim_queued(p_limit integer default 500)
returns table (
    id bigint,
    expo_push_token text,
    title text,
    body text,
    data jsonb
)
language plpgsql
security definer
set search_path = ''
as $$
begin
    -- Sends that never reported back (function crash/timeout) are not retried
    -- Devices that were signed out or unregistered since being queued
    update public.notification_deliveries d
        set status = 'failed', error_code = 'TokenInactive', updated_at = now()
        from public.user_push_tokens t
        where d.status = 'queued' and t.id = d.token_id and not t.is_active;

    update public.notification_deliveries
        set status = 'unknown', error_message = coalesce(error_message, 'No response recorded'), updated_at = now()
        where status = 'sending' and updated_at < now() - interval '10 minutes';

    return query
    with batch as (
        select d.id from public.notification_deliveries d
        where d.status = 'queued'
        order by d.id
        limit p_limit
        for update skip locked
    )
    update public.notification_deliveries d
        set status = 'sending', attempts = d.attempts + 1, updated_at = now()
        from batch, public.user_push_tokens t
        where d.id = batch.id and t.id = d.token_id
    returning d.id, t.expo_push_token, d.title, d.body, d.data;
end;
$$;

-- Records Expo's answer for claimed deliveries.
-- p_results: [{ id, status: ticket_ok|ticket_error|retry|unknown, ticket_id?, error_code?, error_message? }]
-- 'retry' (Expo refused the whole request: 429/5xx) re-queues up to 3 attempts.
create function public.notif_record_tickets(p_results jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
    with r as (
        select * from jsonb_to_recordset(p_results)
            as x(id bigint, status text, ticket_id text, error_code text, error_message text)
    )
    update public.notification_deliveries d
        set status = case
                when r.status = 'retry' and d.attempts < 3 then 'queued'
                when r.status = 'retry' then 'failed'
                when r.status in ('ticket_ok', 'ticket_error', 'unknown') then r.status
                else 'unknown'
            end,
            ticket_id = r.ticket_id,
            error_code = r.error_code,
            error_message = left(r.error_message, 500),
            submitted_at = case when r.status in ('ticket_ok', 'ticket_error') then now() else d.submitted_at end,
            updated_at = now()
        from r
        where d.id = r.id and d.status = 'sending';

    -- Expo says the token is dead: stop sending to it
    update public.user_push_tokens t
        set is_active = false, deactivated_reason = 'device_not_registered', updated_at = now()
        from jsonb_to_recordset(p_results) as x(id bigint, error_code text), public.notification_deliveries d
        where x.error_code = 'DeviceNotRegistered' and d.id = x.id and t.id = d.token_id and t.is_active;
end;
$$;

-- Tickets old enough to have a receipt (Expo suggests waiting ~15 minutes;
-- receipts are kept for 24 hours)
create function public.notif_pending_receipts(p_limit integer default 1000)
returns table (id bigint, ticket_id text)
language sql
stable
security definer
set search_path = ''
as $$
    select d.id, d.ticket_id
    from public.notification_deliveries d
    where d.status = 'ticket_ok'
        and d.receipt_checked_at is null
        and d.ticket_id is not null
        and d.submitted_at < now() - interval '15 minutes'
        and d.submitted_at > now() - interval '23 hours'
    order by d.submitted_at
    limit p_limit;
$$;

-- p_results: [{ id, status: delivered|failed|missing, error_code?, error_message? }]
-- 'missing': Expo had no receipt yet — checked again on a later run.
create function public.notif_record_receipts(p_results jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
    with r as (
        select * from jsonb_to_recordset(p_results)
            as x(id bigint, status text, error_code text, error_message text)
        where x.status in ('delivered', 'failed')
    )
    update public.notification_deliveries d
        set status = r.status,
            error_code = r.error_code,
            error_message = left(r.error_message, 500),
            receipt_checked_at = now(),
            updated_at = now()
        from r
        where d.id = r.id and d.status = 'ticket_ok';

    update public.user_push_tokens t
        set is_active = false, deactivated_reason = 'device_not_registered', updated_at = now()
        from jsonb_to_recordset(p_results) as x(id bigint, error_code text), public.notification_deliveries d
        where x.error_code = 'DeviceNotRegistered' and d.id = x.id and t.id = d.token_id and t.is_active;
end;
$$;

-- Recounts recent executions from their deliveries and closes those with
-- nothing left in flight
create function public.notif_finalize_executions()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
    update public.campaign_executions e
        set submitted_count = s.submitted,
            ticket_ok_count = s.ticket_ok,
            ticket_error_count = s.ticket_error,
            delivered_count = s.delivered,
            delivery_error_count = s.failed,
            unknown_count = s.unknown,
            status = case when e.status = 'sending' and s.in_flight = 0 then 'completed' else e.status end,
            finished_at = case when e.status = 'sending' and s.in_flight = 0 then now() else e.finished_at end,
            updated_at = now()
        from (
            select
                d.execution_id,
                count(*) filter (where d.status in ('ticket_ok', 'ticket_error', 'delivered', 'failed')) as submitted,
                count(*) filter (where d.status in ('ticket_ok', 'delivered', 'failed')) as ticket_ok,
                count(*) filter (where d.status = 'ticket_error') as ticket_error,
                count(*) filter (where d.status = 'delivered') as delivered,
                count(*) filter (where d.status = 'failed') as failed,
                count(*) filter (where d.status = 'unknown') as unknown,
                count(*) filter (where d.status in ('queued', 'sending')) as in_flight
            from public.notification_deliveries d
            join public.campaign_executions x on x.id = d.execution_id
            where x.started_at > now() - interval '2 days'
            group by d.execution_id
        ) s
        where e.id = s.execution_id;

    -- Runs that matched no device
    update public.campaign_executions
        set status = 'completed', finished_at = now(), updated_at = now()
        where status = 'sending' and eligible_count = 0;

    -- Runs stuck preparing (dispatcher kept failing) are given up after a day
    update public.campaign_executions
        set status = 'failed', error = coalesce(error, 'Message was never prepared'), finished_at = now(), updated_at = now()
        where status = 'preparing' and started_at < now() - interval '1 day';
end;
$$;

-- Test send: queues a delivery to each of the calling admin's own devices.
-- Returns how many were queued (0 = no registered device).
create function public.admin_queue_test_notification(p_title text, p_body text, p_data jsonb default '{}'::jsonb)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
    queued integer;
begin
    if not public.is_admin() then
        raise exception 'Not authorized' using errcode = '42501';
    end if;
    if coalesce(char_length(p_title), 0) not between 1 and 100 or coalesce(char_length(p_body), 0) not between 1 and 240 then
        raise exception 'invalid_message' using errcode = '22023';
    end if;
    insert into public.notification_deliveries (kind, user_id, token_id, title, body, data)
    select 'test', t.user_id, t.id, p_title, p_body, coalesce(p_data, '{}'::jsonb) || '{"kind":"test"}'::jsonb
    from public.user_push_tokens t
    where t.user_id = (select auth.uid()) and t.is_active;
    get diagnostics queued = row_count;
    return queued;
end;
$$;

-- Dashboard numbers. Labels match what is measured: "submitted" = sent to
-- Expo, "accepted" = Expo returned an ok ticket, "delivered" = Expo's
-- receipt says it reached Apple/Google (not that the user saw it).
create function public.admin_notification_stats(p_days integer default 30)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
    since timestamptz := now() - make_interval(days => least(greatest(coalesce(p_days, 30), 1), 365));
begin
    if not public.is_admin() then
        raise exception 'Not authorized' using errcode = '42501';
    end if;
    return jsonb_build_object(
        'period_days', least(greatest(coalesce(p_days, 30), 1), 365),
        'tokens_total', (select count(*) from public.user_push_tokens),
        'tokens_active', (select count(*) from public.user_push_tokens where is_active),
        'users_with_active_tokens', (select count(distinct user_id) from public.user_push_tokens where is_active),
        'daily_discovery_opted_out', (select count(*) from public.notification_preferences where not daily_discovery),
        'deliveries', (
            select jsonb_build_object(
                'queued', count(*) filter (where status in ('queued', 'sending')),
                'submitted', count(*) filter (where status in ('ticket_ok', 'ticket_error', 'delivered', 'failed')),
                'accepted', count(*) filter (where status in ('ticket_ok', 'delivered', 'failed')),
                'rejected', count(*) filter (where status = 'ticket_error'),
                'delivered', count(*) filter (where status = 'delivered'),
                'delivery_failed', count(*) filter (where status = 'failed'),
                'unknown', count(*) filter (where status = 'unknown'),
                'awaiting_receipt', count(*) filter (where status = 'ticket_ok')
            )
            from public.notification_deliveries where created_at >= since
        ),
        'top_errors', coalesce((
            select jsonb_agg(jsonb_build_object('error_code', error_code, 'count', n) order by n desc)
            from (
                select error_code, count(*) as n from public.notification_deliveries
                where created_at >= since and error_code is not null
                group by error_code order by n desc limit 10
            ) e
        ), '[]'::jsonb),
        'last_execution', (
            select to_jsonb(e) - 'message' || jsonb_build_object('campaign_name', c.name)
            from public.campaign_executions e join public.notification_campaigns c on c.id = e.campaign_id
            order by e.started_at desc limit 1
        ),
        'next_run', (
            select jsonb_build_object('campaign_id', c.id, 'campaign_name', c.name, 'run_at', public.campaign_next_run(c))
            from public.notification_campaigns c
            where c.is_enabled
            order by public.campaign_next_run(c) nulls last limit 1
        )
    );
end;
$$;

-- Campaign list for the admin panel with last run and next run
create view public.notification_campaigns_overview
with (security_invoker = true)
as
select
    c.*,
    public.campaign_next_run(c) as next_run_at,
    last.id as last_execution_id,
    last.status as last_execution_status,
    last.started_at as last_execution_at
from public.notification_campaigns c
left join lateral (
    select e.id, e.status, e.started_at from public.campaign_executions e
    where e.campaign_id = c.id order by e.started_at desc limit 1
) last on true;

revoke all on public.notification_campaigns_overview from anon, authenticated;
grant select on public.notification_campaigns_overview to authenticated;

-- ── Function privileges ─────────────────────────────────────────────────────
revoke execute on function
    public.touch_updated_at(),
    public.register_push_token(text, text),
    public.unregister_push_token(text, text),
    public.notification_campaigns_before_write(),
    public.comments_enqueue_reply_event(),
    public.comments_enqueue_moderation_event(),
    public.campaign_run_at(date, time, text),
    public.campaign_next_run(public.notification_campaigns),
    public.content_url(text, text, text),
    public.notif_claim_due_campaigns(interval),
    public.notif_prepare_execution(uuid, jsonb),
    public.notif_expand_events(jsonb, integer),
    public.notif_claim_queued(integer),
    public.notif_record_tickets(jsonb),
    public.notif_pending_receipts(integer),
    public.notif_record_receipts(jsonb),
    public.notif_finalize_executions(),
    public.admin_queue_test_notification(text, text, jsonb),
    public.admin_notification_stats(integer)
from public, anon, authenticated;

grant execute on function
    public.register_push_token(text, text),
    public.unregister_push_token(text, text),
    public.campaign_run_at(date, time, text),
    public.campaign_next_run(public.notification_campaigns),
    public.admin_queue_test_notification(text, text, jsonb),
    public.admin_notification_stats(integer)
to authenticated;

grant execute on function
    public.notif_claim_due_campaigns(interval),
    public.notif_prepare_execution(uuid, jsonb),
    public.notif_expand_events(jsonb, integer),
    public.notif_claim_queued(integer),
    public.notif_record_tickets(jsonb),
    public.notif_pending_receipts(integer),
    public.notif_record_receipts(jsonb),
    public.notif_finalize_executions()
to service_role;
