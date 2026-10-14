-- Public author info for comments, plus the staff role model used by every
-- moderation / notification admin function.

-- ── Profiles ────────────────────────────────────────────────────────────────
-- The app keeps name and avatar in auth.users.user_metadata, which other users
-- cannot read. This table mirrors just those two fields so comment authors can
-- be shown. It is written only by the trigger below, never by clients.
create table public.profiles (
    id uuid primary key references auth.users (id) on delete cascade,
    display_name text not null default '',
    avatar_url text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

revoke all on table public.profiles from anon, authenticated;
grant select on public.profiles to authenticated;

create policy "Signed-in users read profiles"
    on public.profiles for select
    to authenticated
    using (true);

-- user_metadata is user controlled, so only bounded text and https URLs are copied
create function public.sync_profile_from_auth()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
    avatar text := new.raw_user_meta_data ->> 'avatar_url';
begin
    insert into public.profiles (id, display_name, avatar_url)
    values (
        new.id,
        left(coalesce(btrim(new.raw_user_meta_data ->> 'name'), ''), 80),
        case when avatar ~ '^https://' then left(avatar, 1000) end
    )
    on conflict (id) do update
        set display_name = excluded.display_name,
            avatar_url = excluded.avatar_url,
            updated_at = now();
    return new;
end;
$$;

create trigger sync_profile_from_auth
    after insert or update of raw_user_meta_data on auth.users
    for each row execute function public.sync_profile_from_auth();

-- Existing accounts
insert into public.profiles (id, display_name, avatar_url)
select
    id,
    left(coalesce(btrim(raw_user_meta_data ->> 'name'), ''), 80),
    case when raw_user_meta_data ->> 'avatar_url' ~ '^https://' then left(raw_user_meta_data ->> 'avatar_url', 1000) end
from auth.users
on conflict (id) do nothing;

-- ── Staff roles ─────────────────────────────────────────────────────────────
-- 'moderator': comment moderation. 'admin': moderation + notifications + roles.
-- No grants to anon/authenticated: rows can only be read through the
-- functions below and only changed by an admin RPC or the service role.
create table public.admin_users (
    user_id uuid primary key references auth.users (id) on delete cascade,
    role text not null check (role in ('admin', 'moderator')),
    granted_by uuid references auth.users (id) on delete set null,
    created_at timestamptz not null default now()
);

alter table public.admin_users enable row level security;
revoke all on table public.admin_users from anon, authenticated;

create function public.staff_role()
returns text
language sql
stable
security definer
set search_path = ''
as $$
    select role from public.admin_users where user_id = (select auth.uid());
$$;

create function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
    select coalesce(public.staff_role() = 'admin', false);
$$;

create function public.is_moderator()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
    select coalesce(public.staff_role() in ('admin', 'moderator'), false);
$$;

-- Functions are executable by PUBLIC by default; only signed-in users need these
revoke execute on function public.staff_role(), public.is_admin(), public.is_moderator() from public, anon;
grant execute on function public.staff_role(), public.is_admin(), public.is_moderator() to authenticated;
revoke execute on function public.sync_profile_from_auth() from public, anon, authenticated;

-- Admins manage staff; nobody can change their own role
create function public.admin_set_staff_role(p_user_id uuid, p_role text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
    if not public.is_admin() then
        raise exception 'Not authorized' using errcode = '42501';
    end if;
    if p_user_id = (select auth.uid()) then
        raise exception 'Admins cannot change their own role' using errcode = '42501';
    end if;
    if p_role is null then
        delete from public.admin_users where user_id = p_user_id;
    elsif p_role in ('admin', 'moderator') then
        insert into public.admin_users (user_id, role, granted_by)
        values (p_user_id, p_role, (select auth.uid()))
        on conflict (user_id) do update set role = excluded.role, granted_by = excluded.granted_by;
    else
        raise exception 'Unknown role %', p_role using errcode = '22023';
    end if;
end;
$$;

revoke execute on function public.admin_set_staff_role(uuid, text) from public, anon;
grant execute on function public.admin_set_staff_role(uuid, text) to authenticated;
