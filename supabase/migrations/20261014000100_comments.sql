-- Comments on movies / series, likes, reports and comment moderation.
--
-- Deletion strategy: comments are always soft deleted (by their author or a
-- moderator). The row is kept so replies stay attached, reports keep their
-- evidence and moderators can restore it; get_comments() never returns the
-- text of a deleted comment. Replies are one level deep: replying to a reply
-- attaches to the same top-level comment.
--
-- Clients write only through column-level grants and the RPCs below, so they
-- can never set user_id, deletion fields, counts or report status.

create extension if not exists pg_trgm with schema extensions;

create table public.comments (
    id uuid primary key default gen_random_uuid(),
    content_type text not null check (content_type in ('movie', 'series')),
    content_provider text not null check (content_provider in ('trakt', 'shoofaflam')),
    content_id text not null check (char_length(content_id) between 1 and 200),
    user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
    parent_comment_id uuid references public.comments (id) on delete cascade,
    content text not null check (char_length(content) between 1 and 2000),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    edited_at timestamptz,
    is_deleted boolean not null default false,
    deleted_at timestamptz,
    deleted_by uuid references auth.users (id) on delete set null,
    deletion_reason text check (deletion_reason in ('author', 'moderator')),
    constraint comments_deleted_fields check (is_deleted = (deleted_at is not null) and is_deleted = (deletion_reason is not null)),
    constraint comments_not_own_parent check (parent_comment_id is distinct from id)
);

-- Top-level thread for a title, newest first (keyset pagination)
create index comments_thread_idx on public.comments
    (content_provider, content_type, content_id, created_at desc, id desc)
    where parent_comment_id is null;
create index comments_replies_idx on public.comments (parent_comment_id, created_at, id);
create index comments_user_idx on public.comments (user_id, created_at desc);
create index comments_created_idx on public.comments (created_at desc);
create index comments_content_trgm_idx on public.comments using gin (content extensions.gin_trgm_ops);

alter table public.comments enable row level security;

revoke all on table public.comments from anon, authenticated;
grant select on public.comments to authenticated;
grant insert (content_type, content_provider, content_id, parent_comment_id, content) on public.comments to authenticated;
grant update (content) on public.comments to authenticated;

create policy "Read visible comments, own comments, or all as staff"
    on public.comments for select
    to authenticated
    using (not is_deleted or user_id = (select auth.uid()) or (select public.is_moderator()));

create policy "Users add their own comments"
    on public.comments for insert
    to authenticated
    with check (user_id = (select auth.uid()));

create policy "Users edit their own live comments"
    on public.comments for update
    to authenticated
    using (user_id = (select auth.uid()) and not is_deleted)
    with check (user_id = (select auth.uid()) and not is_deleted);

-- Validates replies, trims text, keeps server-owned fields server-owned and
-- rate limits posting. Runs as definer so it can read a parent the caller
-- might not see.
create function public.comments_before_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
    parent public.comments;
begin
    new.content := btrim(new.content);

    if tg_op = 'INSERT' then
        new.created_at := now();
        new.updated_at := now();
        new.edited_at := null;
        new.is_deleted := false;
        new.deleted_at := null;
        new.deleted_by := null;
        new.deletion_reason := null;

        if new.parent_comment_id is not null then
            select * into parent from public.comments where id = new.parent_comment_id;
            if not found or parent.is_deleted then
                raise exception 'comment_unavailable' using errcode = 'P0002',
                    detail = 'The comment you are replying to no longer exists';
            end if;
            if (parent.content_provider, parent.content_type, parent.content_id)
                is distinct from (new.content_provider, new.content_type, new.content_id) then
                raise exception 'invalid_parent' using errcode = '22023';
            end if;
            new.parent_comment_id := coalesce(parent.parent_comment_id, parent.id);
        end if;

        if (select count(*) from public.comments
            where user_id = new.user_id and created_at > now() - interval '1 minute') >= 10 then
            raise exception 'rate_limited' using errcode = 'P0001';
        end if;
        return new;
    end if;

    if (new.content_provider, new.content_type, new.content_id, new.user_id, new.parent_comment_id, new.created_at)
        is distinct from (old.content_provider, old.content_type, old.content_id, old.user_id, old.parent_comment_id, old.created_at) then
        raise exception 'immutable_field' using errcode = '42501';
    end if;
    if new.content is distinct from old.content then
        if old.is_deleted then
            raise exception 'comment_unavailable' using errcode = 'P0002';
        end if;
        new.edited_at := now();
    end if;
    new.updated_at := now();
    return new;
end;
$$;

create trigger comments_before_write
    before insert or update on public.comments
    for each row execute function public.comments_before_write();

create function public.comment_is_active(p_comment_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
    select exists (select 1 from public.comments where id = p_comment_id and not is_deleted);
$$;

-- ── Likes ───────────────────────────────────────────────────────────────────
-- The primary key makes a second like a no-op (clients insert with
-- ON CONFLICT DO NOTHING), so double taps and retries can't double count.
create table public.comment_likes (
    comment_id uuid not null references public.comments (id) on delete cascade,
    user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
    created_at timestamptz not null default now(),
    primary key (comment_id, user_id)
);

create index comment_likes_user_idx on public.comment_likes (user_id);

alter table public.comment_likes enable row level security;

revoke all on table public.comment_likes from anon, authenticated;
grant select, delete on public.comment_likes to authenticated;
grant insert (comment_id) on public.comment_likes to authenticated;

create policy "Users see their own likes"
    on public.comment_likes for select
    to authenticated
    using (user_id = (select auth.uid()));

create policy "Users like live comments"
    on public.comment_likes for insert
    to authenticated
    with check (user_id = (select auth.uid()) and public.comment_is_active(comment_id));

create policy "Users remove their own likes"
    on public.comment_likes for delete
    to authenticated
    using (user_id = (select auth.uid()));

-- ── Reports ─────────────────────────────────────────────────────────────────
-- No client grants: users file reports through report_comment(), staff read
-- and resolve them through the admin_* functions. Reporters are never exposed
-- to other users.
create table public.comment_reports (
    id uuid primary key default gen_random_uuid(),
    comment_id uuid not null references public.comments (id) on delete cascade,
    reporter_user_id uuid not null references auth.users (id) on delete cascade,
    reason text not null check (reason in ('spam', 'harassment', 'offensive', 'spoilers', 'other')),
    description text check (description is null or char_length(description) <= 500),
    status text not null default 'pending' check (status in ('pending', 'reviewed', 'resolved', 'rejected')),
    reviewed_by uuid references auth.users (id) on delete set null,
    reviewed_at timestamptz,
    resolution_note text check (resolution_note is null or char_length(resolution_note) <= 1000),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

-- One open report per user and comment; a closed one can be followed by a new one
create unique index comment_reports_one_open_idx on public.comment_reports (comment_id, reporter_user_id)
    where status in ('pending', 'reviewed');
create index comment_reports_status_idx on public.comment_reports (status, created_at desc);
create index comment_reports_comment_idx on public.comment_reports (comment_id);

alter table public.comment_reports enable row level security;
revoke all on table public.comment_reports from anon, authenticated;

-- ── Moderation log ──────────────────────────────────────────────────────────
create table public.moderation_actions (
    id bigint generated always as identity primary key,
    actor_id uuid references auth.users (id) on delete set null,
    action text not null check (action in (
        'remove_comment', 'restore_comment', 'report_reviewed', 'report_resolved', 'report_rejected'
    )),
    comment_id uuid references public.comments (id) on delete set null,
    report_id uuid references public.comment_reports (id) on delete set null,
    note text check (note is null or char_length(note) <= 1000),
    created_at timestamptz not null default now()
);

create index moderation_actions_comment_idx on public.moderation_actions (comment_id, created_at desc);
create index moderation_actions_created_idx on public.moderation_actions (created_at desc);

alter table public.moderation_actions enable row level security;
revoke all on table public.moderation_actions from anon, authenticated;

-- ── User RPCs ───────────────────────────────────────────────────────────────

-- One page of a thread. Top level: newest first; replies: oldest first.
-- Pass the last row's created_at + id as the cursor for the next page.
-- Deleted comments come back without text, and only while they still have
-- visible replies to hold together.
create function public.get_comments(
    p_provider text,
    p_type text,
    p_content_id text,
    p_parent_id uuid default null,
    p_cursor_created_at timestamptz default null,
    p_cursor_id uuid default null,
    p_limit integer default 20
)
returns table (
    id uuid,
    parent_comment_id uuid,
    author_name text,
    author_avatar text,
    content text,
    is_deleted boolean,
    deletion_reason text,
    is_mine boolean,
    created_at timestamptz,
    edited_at timestamptz,
    like_count bigint,
    liked_by_me boolean,
    reply_count bigint
)
language sql
stable
security definer
set search_path = ''
as $$
    select
        c.id,
        c.parent_comment_id,
        p.display_name,
        p.avatar_url,
        case when c.is_deleted then null else c.content end,
        c.is_deleted,
        c.deletion_reason,
        c.user_id = (select auth.uid()),
        c.created_at,
        c.edited_at,
        (select count(*) from public.comment_likes l where l.comment_id = c.id),
        exists (select 1 from public.comment_likes l where l.comment_id = c.id and l.user_id = (select auth.uid())),
        (select count(*) from public.comments r where r.parent_comment_id = c.id and not r.is_deleted)
    from public.comments c
    left join public.profiles p on p.id = c.user_id
    where c.content_provider = p_provider
        and c.content_type = p_type
        and c.content_id = p_content_id
        and c.parent_comment_id is not distinct from p_parent_id
        and (
            not c.is_deleted
            or (p_parent_id is null and exists (
                select 1 from public.comments r where r.parent_comment_id = c.id and not r.is_deleted
            ))
        )
        and (
            p_cursor_created_at is null
            or (p_parent_id is null and (c.created_at, c.id) < (p_cursor_created_at, p_cursor_id))
            or (p_parent_id is not null and (c.created_at, c.id) > (p_cursor_created_at, p_cursor_id))
        )
    order by
        case when p_parent_id is null then c.created_at end desc,
        case when p_parent_id is null then c.id end desc,
        case when p_parent_id is not null then c.created_at end asc,
        case when p_parent_id is not null then c.id end asc
    limit least(greatest(coalesce(p_limit, 20), 1), 50);
$$;

create function public.get_comment_count(p_provider text, p_type text, p_content_id text)
returns bigint
language sql
stable
security definer
set search_path = ''
as $$
    select count(*) from public.comments
    where content_provider = p_provider and content_type = p_type and content_id = p_content_id and not is_deleted;
$$;

create function public.delete_comment(p_comment_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
    update public.comments
        set is_deleted = true, deleted_at = now(), deleted_by = (select auth.uid()), deletion_reason = 'author'
        where id = p_comment_id and user_id = (select auth.uid()) and not is_deleted;
    if not found then
        raise exception 'comment_unavailable' using errcode = 'P0002';
    end if;
end;
$$;

create function public.report_comment(p_comment_id uuid, p_reason text, p_description text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
    uid uuid := (select auth.uid());
    author uuid;
begin
    if uid is null then
        raise exception 'Not signed in' using errcode = '42501';
    end if;
    select user_id into author from public.comments where id = p_comment_id and not is_deleted;
    if not found then
        raise exception 'comment_unavailable' using errcode = 'P0002';
    end if;
    if author = uid then
        raise exception 'own_comment' using errcode = '22023';
    end if;
    insert into public.comment_reports (comment_id, reporter_user_id, reason, description)
    values (p_comment_id, uid, p_reason, nullif(btrim(p_description), ''));
exception
    when unique_violation then
        raise exception 'already_reported' using errcode = '23505';
end;
$$;

-- ── Staff RPCs ──────────────────────────────────────────────────────────────

create function public.assert_moderator()
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
    if not public.is_moderator() then
        raise exception 'Not authorized' using errcode = '42501';
    end if;
end;
$$;

-- Escapes LIKE wildcards so a search for "100%" matches literally
create function public.like_pattern(p_text text)
returns text
language sql
immutable
set search_path = ''
as $$
    select '%' || replace(replace(replace(p_text, '\', '\\'), '%', '\%'), '_', '\_') || '%';
$$;

create function public.admin_list_comments(
    p_search text default null,
    p_status text default 'all',          -- all | visible | deleted
    p_content_type text default null,     -- movie | series
    p_reported_only boolean default false,
    p_from timestamptz default null,
    p_to timestamptz default null,
    p_page integer default 1,
    p_page_size integer default 25
)
returns table (
    id uuid,
    content_provider text,
    content_type text,
    content_id text,
    parent_comment_id uuid,
    user_id uuid,
    author_name text,
    author_email text,
    content text,
    is_deleted boolean,
    deletion_reason text,
    deleted_at timestamptz,
    created_at timestamptz,
    edited_at timestamptz,
    like_count bigint,
    reply_count bigint,
    report_count bigint,
    open_report_count bigint,
    total_count bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
    size integer := least(greatest(coalesce(p_page_size, 25), 1), 100);
    pattern text := case when nullif(btrim(p_search), '') is not null then public.like_pattern(btrim(p_search)) end;
begin
    perform public.assert_moderator();
    return query
    select
        c.id, c.content_provider, c.content_type, c.content_id, c.parent_comment_id, c.user_id,
        p.display_name, u.email::text, c.content, c.is_deleted, c.deletion_reason, c.deleted_at,
        c.created_at, c.edited_at,
        (select count(*) from public.comment_likes l where l.comment_id = c.id),
        (select count(*) from public.comments r where r.parent_comment_id = c.id),
        (select count(*) from public.comment_reports cr where cr.comment_id = c.id),
        (select count(*) from public.comment_reports cr where cr.comment_id = c.id and cr.status in ('pending', 'reviewed')),
        count(*) over ()
    from public.comments c
    left join public.profiles p on p.id = c.user_id
    left join auth.users u on u.id = c.user_id
    where (pattern is null
            or c.content ilike pattern
            or c.content_id ilike pattern
            or p.display_name ilike pattern
            or u.email ilike pattern
            or c.user_id::text = btrim(p_search)
            or c.id::text = btrim(p_search))
        and (coalesce(p_status, 'all') = 'all'
            or (p_status = 'visible' and not c.is_deleted)
            or (p_status = 'deleted' and c.is_deleted))
        and (p_content_type is null or c.content_type = p_content_type)
        and (not coalesce(p_reported_only, false)
            or exists (select 1 from public.comment_reports cr where cr.comment_id = c.id))
        and (p_from is null or c.created_at >= p_from)
        and (p_to is null or c.created_at < p_to)
    order by c.created_at desc, c.id desc
    limit size offset (greatest(coalesce(p_page, 1), 1) - 1) * size;
end;
$$;

-- Everything the admin needs for one comment: the comment, its thread
-- context, replies, reports and moderation history
create function public.admin_get_comment(p_comment_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
    result jsonb;
begin
    perform public.assert_moderator();
    select jsonb_build_object(
        'comment', to_jsonb(c) || jsonb_build_object('author_name', p.display_name, 'author_email', u.email),
        'parent', (select to_jsonb(pc) from public.comments pc where pc.id = c.parent_comment_id),
        'replies', coalesce((
            select jsonb_agg(to_jsonb(r) || jsonb_build_object('author_name', rp.display_name) order by r.created_at)
            from public.comments r left join public.profiles rp on rp.id = r.user_id
            where r.parent_comment_id = c.id
        ), '[]'::jsonb),
        'reports', coalesce((
            select jsonb_agg(to_jsonb(cr) || jsonb_build_object('reporter_name', rp.display_name) order by cr.created_at desc)
            from public.comment_reports cr left join public.profiles rp on rp.id = cr.reporter_user_id
            where cr.comment_id = c.id
        ), '[]'::jsonb),
        'history', coalesce((
            select jsonb_agg(to_jsonb(m) || jsonb_build_object('actor_name', ap.display_name) order by m.created_at desc)
            from public.moderation_actions m left join public.profiles ap on ap.id = m.actor_id
            where m.comment_id = c.id
        ), '[]'::jsonb)
    )
    into result
    from public.comments c
    left join public.profiles p on p.id = c.user_id
    left join auth.users u on u.id = c.user_id
    where c.id = p_comment_id;

    if result is null then
        raise exception 'comment_unavailable' using errcode = 'P0002';
    end if;
    return result;
end;
$$;

create function public.admin_list_reports(
    p_status text default 'pending',      -- pending | reviewed | resolved | rejected | open | all
    p_page integer default 1,
    p_page_size integer default 25
)
returns table (
    id uuid,
    comment_id uuid,
    reason text,
    description text,
    status text,
    created_at timestamptz,
    reviewed_at timestamptz,
    reviewed_by_name text,
    resolution_note text,
    reporter_name text,
    comment_content text,
    comment_is_deleted boolean,
    comment_author_name text,
    content_provider text,
    content_type text,
    content_id text,
    comment_report_count bigint,
    total_count bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
    size integer := least(greatest(coalesce(p_page_size, 25), 1), 100);
begin
    perform public.assert_moderator();
    return query
    select
        r.id, r.comment_id, r.reason, r.description, r.status, r.created_at, r.reviewed_at,
        rv.display_name, r.resolution_note, rp.display_name,
        c.content, c.is_deleted, ap.display_name,
        c.content_provider, c.content_type, c.content_id,
        (select count(*) from public.comment_reports x where x.comment_id = r.comment_id),
        count(*) over ()
    from public.comment_reports r
    join public.comments c on c.id = r.comment_id
    left join public.profiles rp on rp.id = r.reporter_user_id
    left join public.profiles ap on ap.id = c.user_id
    left join public.profiles rv on rv.id = r.reviewed_by
    where coalesce(p_status, 'all') = 'all'
        or r.status = p_status
        or (p_status = 'open' and r.status in ('pending', 'reviewed'))
    order by r.created_at desc, r.id desc
    limit size offset (greatest(coalesce(p_page, 1), 1) - 1) * size;
end;
$$;

create function public.admin_remove_comment(p_comment_id uuid, p_note text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
    actor uuid := (select auth.uid());
begin
    perform public.assert_moderator();
    update public.comments
        set is_deleted = true, deleted_at = now(), deleted_by = actor, deletion_reason = 'moderator'
        where id = p_comment_id and (not is_deleted or deletion_reason = 'author');
    if not found then
        raise exception 'comment_unavailable' using errcode = 'P0002';
    end if;
    -- Removing the comment settles every open report against it
    update public.comment_reports
        set status = 'resolved', reviewed_by = actor, reviewed_at = now(), updated_at = now(),
            resolution_note = coalesce(resolution_note, p_note)
        where comment_id = p_comment_id and status in ('pending', 'reviewed');
    insert into public.moderation_actions (actor_id, action, comment_id, note)
    values (actor, 'remove_comment', p_comment_id, p_note);
end;
$$;

create function public.admin_restore_comment(p_comment_id uuid, p_note text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
    perform public.assert_moderator();
    update public.comments
        set is_deleted = false, deleted_at = null, deleted_by = null, deletion_reason = null
        where id = p_comment_id and is_deleted;
    if not found then
        raise exception 'comment_unavailable' using errcode = 'P0002';
    end if;
    insert into public.moderation_actions (actor_id, action, comment_id, note)
    values ((select auth.uid()), 'restore_comment', p_comment_id, p_note);
end;
$$;

create function public.admin_set_report_status(p_report_id uuid, p_status text, p_note text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
    target uuid;
begin
    perform public.assert_moderator();
    if p_status not in ('reviewed', 'resolved', 'rejected') then
        raise exception 'invalid_status' using errcode = '22023';
    end if;
    update public.comment_reports
        set status = p_status, reviewed_by = (select auth.uid()), reviewed_at = now(), updated_at = now(),
            resolution_note = coalesce(p_note, resolution_note)
        where id = p_report_id
        returning comment_id into target;
    if not found then
        raise exception 'report_not_found' using errcode = 'P0002';
    end if;
    insert into public.moderation_actions (actor_id, action, comment_id, report_id, note)
    values ((select auth.uid()), 'report_' || p_status, target, p_report_id, p_note);
end;
$$;

create function public.admin_moderation_history(
    p_comment_id uuid default null,
    p_page integer default 1,
    p_page_size integer default 50
)
returns table (
    id bigint,
    action text,
    actor_id uuid,
    actor_name text,
    comment_id uuid,
    report_id uuid,
    note text,
    created_at timestamptz,
    total_count bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
    size integer := least(greatest(coalesce(p_page_size, 50), 1), 200);
begin
    perform public.assert_moderator();
    return query
    select m.id, m.action, m.actor_id, p.display_name, m.comment_id, m.report_id, m.note, m.created_at, count(*) over ()
    from public.moderation_actions m
    left join public.profiles p on p.id = m.actor_id
    where p_comment_id is null or m.comment_id = p_comment_id
    order by m.created_at desc, m.id desc
    limit size offset (greatest(coalesce(p_page, 1), 1) - 1) * size;
end;
$$;

-- ── Function privileges ─────────────────────────────────────────────────────
revoke execute on function
    public.comments_before_write(),
    public.comment_is_active(uuid),
    public.get_comments(text, text, text, uuid, timestamptz, uuid, integer),
    public.get_comment_count(text, text, text),
    public.delete_comment(uuid),
    public.report_comment(uuid, text, text),
    public.assert_moderator(),
    public.like_pattern(text),
    public.admin_list_comments(text, text, text, boolean, timestamptz, timestamptz, integer, integer),
    public.admin_get_comment(uuid),
    public.admin_list_reports(text, integer, integer),
    public.admin_remove_comment(uuid, text),
    public.admin_restore_comment(uuid, text),
    public.admin_set_report_status(uuid, text, text),
    public.admin_moderation_history(uuid, integer, integer)
from public, anon;

-- The trigger function needs no grant. Staff functions check the role themselves.
revoke execute on function public.comments_before_write() from authenticated;
grant execute on function
    public.comment_is_active(uuid),
    public.get_comments(text, text, text, uuid, timestamptz, uuid, integer),
    public.get_comment_count(text, text, text),
    public.delete_comment(uuid),
    public.report_comment(uuid, text, text),
    public.admin_list_comments(text, text, text, boolean, timestamptz, timestamptz, integer, integer),
    public.admin_get_comment(uuid),
    public.admin_list_reports(text, integer, integer),
    public.admin_remove_comment(uuid, text),
    public.admin_restore_comment(uuid, text),
    public.admin_set_report_status(uuid, text, text),
    public.admin_moderation_history(uuid, integer, integer)
to authenticated;
