-- Spindle accounts: one synced library document per user.
-- Paste this whole file into Supabase → SQL Editor → Run. Safe to run again.
--
-- The document is { section: { key: { at, v?, del? } } }. Every entry carries the
-- time it last changed, so two devices merge entry by entry (newest wins) and a
-- deletion on one device ("del") beats an older copy on another.

create table if not exists public.libraries (
  user_id uuid primary key references auth.users (id) on delete cascade,
  doc jsonb not null default '{}'::jsonb,
  device text,
  updated_at timestamptz not null default now()
);

alter table public.libraries enable row level security;

drop policy if exists "own library: read" on public.libraries;
create policy "own library: read" on public.libraries for select using (auth.uid() = user_id);
drop policy if exists "own library: insert" on public.libraries;
create policy "own library: insert" on public.libraries for insert with check (auth.uid() = user_id);
drop policy if exists "own library: update" on public.libraries;
create policy "own library: update" on public.libraries for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Merge two { key: entry } maps, keeping the newer entry for each key.
create or replace function public.merge_entries(a jsonb, b jsonb) returns jsonb
language sql immutable as $$
  select coalesce(jsonb_object_agg(k,
    case when coalesce((b -> k ->> 'at')::bigint, -1) >= coalesce((a -> k ->> 'at')::bigint, -1) then b -> k else a -> k end
  ), '{}'::jsonb)
  from (
    select jsonb_object_keys(coalesce(a, '{}'::jsonb)) as k
    union
    select jsonb_object_keys(coalesce(b, '{}'::jsonb))
  ) keys
$$;

-- Merge two whole documents, section by section.
create or replace function public.merge_doc(a jsonb, b jsonb) returns jsonb
language sql immutable as $$
  select coalesce(jsonb_object_agg(s, public.merge_entries(a -> s, b -> s)), '{}'::jsonb)
  from (
    select jsonb_object_keys(coalesce(a, '{}'::jsonb)) as s
    union
    select jsonb_object_keys(coalesce(b, '{}'::jsonb))
  ) sections
$$;

-- Fold a device's changes into the stored library atomically and return the result.
create or replace function public.sync_library(patch jsonb, device text) returns jsonb
language plpgsql security invoker as $$
declare
  result jsonb;
begin
  if auth.uid() is null then
    raise exception 'not signed in';
  end if;
  -- Listening history has its own table now (below); older app versions still send it here.
  if patch ? 'plays' or patch ? 'ptracks' then
    perform public.add_plays(
      coalesce((select jsonb_agg(e -> 'v') from jsonb_each(patch -> 'plays') x (k, e) where e ? 'v'), '[]'::jsonb),
      coalesce((select jsonb_object_agg(k, e -> 'v') from jsonb_each(patch -> 'ptracks') x (k, e) where e ? 'v'), '{}'::jsonb)
    );
    patch := patch - 'plays' - 'ptracks';
  end if;
  insert into public.libraries as l (user_id, doc, device)
  values (auth.uid(), public.merge_doc('{}'::jsonb, patch), device)
  on conflict (user_id) do update
    set doc = public.merge_doc(l.doc, excluded.doc), device = excluded.device, updated_at = now()
  returning l.doc into result;
  return result;
end
$$;

grant execute on function public.sync_library(jsonb, text) to authenticated;

-- Tell other signed-in devices when the library changes.
do $$
begin
  alter publication supabase_realtime add table public.libraries;
exception when duplicate_object then null;
end
$$;

-- Let a signed-in listener delete their own account; their library goes with it (on delete cascade).
create or replace function public.delete_account() returns void
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then
    raise exception 'not signed in';
  end if;
  delete from auth.users where id = auth.uid();
end
$$;

revoke execute on function public.delete_account() from public, anon;
grant execute on function public.delete_account() to authenticated;

-- ---------- Sharing ----------
-- A shared song, playlist or album: a public snapshot anyone with the link can open.
-- One link per item per owner, so sharing the same thing again keeps the same link.
create table if not exists public.shares (
  code text primary key,
  owner uuid not null default auth.uid() references auth.users (id) on delete cascade,
  owner_name text,
  kind text not null check (kind in ('track', 'playlist', 'album')),
  item_key text not null,
  title text not null,
  subtitle text,
  image text,
  payload jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner, kind, item_key)
);

alter table public.shares enable row level security;

drop policy if exists "shares: anyone with the link" on public.shares;
create policy "shares: anyone with the link" on public.shares for select using (true);
drop policy if exists "shares: owner inserts" on public.shares;
create policy "shares: owner inserts" on public.shares for insert with check (auth.uid() = owner);
drop policy if exists "shares: owner updates" on public.shares;
create policy "shares: owner updates" on public.shares for update using (auth.uid() = owner) with check (auth.uid() = owner);
drop policy if exists "shares: owner deletes" on public.shares;
create policy "shares: owner deletes" on public.shares for delete using (auth.uid() = owner);

-- Create or refresh the link for an item and return its code.
create or replace function public.share_item(
  p_kind text, p_item_key text, p_title text, p_subtitle text, p_image text, p_payload jsonb, p_owner_name text
) returns text
language plpgsql security invoker as $$
declare
  result text;
begin
  if auth.uid() is null then
    raise exception 'not signed in';
  end if;
  insert into public.shares as s (code, owner, owner_name, kind, item_key, title, subtitle, image, payload)
  values (substr(replace(gen_random_uuid()::text, '-', ''), 1, 10), auth.uid(), p_owner_name, p_kind, p_item_key, p_title, p_subtitle, p_image, p_payload)
  on conflict (owner, kind, item_key) do update
    set title = excluded.title, subtitle = excluded.subtitle, image = excluded.image,
        payload = excluded.payload, owner_name = excluded.owner_name, updated_at = now()
  returning s.code into result;
  return result;
end
$$;

grant execute on function public.share_item(text, text, text, text, text, jsonb, text) to authenticated;

-- ---------- Hardening ----------
-- Fixed search paths, so a function can't be tricked into calling a look-alike object.
alter function public.merge_entries(jsonb, jsonb) set search_path = '';
alter function public.merge_doc(jsonb, jsonb) set search_path = '';
alter function public.sync_library(jsonb, text) set search_path = '';
alter function public.share_item(text, text, text, text, text, jsonb, text) set search_path = '';

-- Only signed-in listeners may call the write functions (they also check inside).
revoke execute on function public.sync_library(jsonb, text) from public, anon;
revoke execute on function public.share_item(text, text, text, text, text, jsonb, text) from public, anon;
revoke execute on function public.merge_entries(jsonb, jsonb) from public, anon;
revoke execute on function public.merge_doc(jsonb, jsonb) from public, anon;
grant execute on function public.sync_library(jsonb, text) to authenticated;
grant execute on function public.share_item(text, text, text, text, text, jsonb, text) to authenticated;

-- Visitors opening a shared link see what was shared, not who owns it internally.
revoke select on public.shares from anon;
grant select (code, kind, item_key, title, subtitle, image, payload, owner_name, created_at, updated_at) on public.shares to anon;

-- ---------- Crash reports ----------
-- The site adds a row when something breaks (src/lib/errors.ts). Signed-in
-- listeners can only add their own; nobody can read them from the site. Read
-- them in the Supabase dashboard: Table Editor → client_errors.
create table if not exists public.client_errors (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  user_id uuid default auth.uid() references auth.users on delete cascade,
  message text not null check (length(message) <= 500),
  stack text check (length(stack) <= 4000),
  url text check (length(url) <= 300),
  ua text check (length(ua) <= 300),
  release text check (length(release) <= 40)
);
create index if not exists client_errors_at on public.client_errors (at desc);
create index if not exists client_errors_user on public.client_errors (user_id, at desc);

alter table public.client_errors enable row level security;
drop policy if exists "add own reports" on public.client_errors;
create policy "add own reports" on public.client_errors for insert to authenticated with check (user_id = (select auth.uid()));

revoke all on public.client_errors from anon, authenticated;
grant insert (message, stack, url, ua, release) on public.client_errors to authenticated;

-- At most 50 reports per person per day, so a broken loop can't fill the database.
create or replace function public.limit_client_errors() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if (select count(*) from public.client_errors where user_id = new.user_id and at > now() - interval '1 day') >= 50 then
    return null;
  end if;
  return new;
end
$$;
revoke execute on function public.limit_client_errors() from public, anon, authenticated;
drop trigger if exists limit_client_errors on public.client_errors;
create trigger limit_client_errors before insert on public.client_errors for each row execute function public.limit_client_errors();

-- ---------- Listening history ----------
-- Every play, for Stats and playlist play counts. Kept out of the library
-- document so the library stays small however much someone listens.
create table if not exists public.plays (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  at bigint not null, -- when the play started, in ms
  track_id text not null check (length(track_id) <= 200),
  secs integer not null default 0 check (secs between 0 and 86400),
  updated_at timestamptz not null default now(),
  primary key (user_id, at, track_id)
);
create index if not exists plays_pull on public.plays (user_id, updated_at);

-- Each played song's details, stored once per listener.
create table if not exists public.play_tracks (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  track_id text not null check (length(track_id) <= 200),
  track jsonb not null,
  primary key (user_id, track_id)
);

alter table public.plays enable row level security;
alter table public.play_tracks enable row level security;
drop policy if exists "own plays: read" on public.plays;
create policy "own plays: read" on public.plays for select to authenticated using (user_id = (select auth.uid()));
drop policy if exists "own play tracks: read" on public.play_tracks;
create policy "own play tracks: read" on public.play_tracks for select to authenticated using (user_id = (select auth.uid()));
-- Writes go through add_plays only.
revoke all on public.plays, public.play_tracks from anon, authenticated;
grant select on public.plays, public.play_tracks to authenticated;

-- Add plays (and their songs) for the signed-in listener. The same play sent
-- twice keeps the longer listening time.
create or replace function public.add_plays(p_plays jsonb, p_tracks jsonb default '{}'::jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
begin
  if me is null then
    raise exception 'not signed in';
  end if;
  if jsonb_typeof(p_plays) <> 'array' or jsonb_array_length(p_plays) > 20000 then
    raise exception 'send plays as an array of at most 20000';
  end if;
  insert into public.plays as p (user_id, at, track_id, secs)
  select distinct on (at, id) me, at, id, secs
  from (
    select (e ->> 'at')::bigint as at, e ->> 'id' as id, least(greatest(coalesce((e ->> 'secs')::int, 0), 0), 86400) as secs
    from jsonb_array_elements(p_plays) e
    where e ->> 'id' is not null and length(e ->> 'id') <= 200 and (e ->> 'at') ~ '^\d{1,15}$'
  ) rows
  order by at, id, secs desc
  on conflict (user_id, at, track_id) do update set secs = excluded.secs, updated_at = now()
    where excluded.secs > p.secs;

  if jsonb_typeof(p_tracks) = 'object' then
    insert into public.play_tracks (user_id, track_id, track)
    select me, key, value
    from jsonb_each(p_tracks)
    where length(key) <= 200 and jsonb_typeof(value) = 'object' and pg_column_size(value) <= 8000
    limit 20000
    on conflict do nothing;
  end if;
end
$$;
revoke execute on function public.add_plays(jsonb, jsonb) from public, anon;
grant execute on function public.add_plays(jsonb, jsonb) to authenticated;

-- One-time move of plays out of library documents (does nothing once they're moved).
insert into public.plays (user_id, at, track_id, secs)
select distinct on (user_id, at, track_id) user_id, at, track_id, secs
from (
  select l.user_id, (e -> 'v' ->> 'at')::bigint as at, e -> 'v' ->> 'id' as track_id,
    least(greatest(coalesce((e -> 'v' ->> 'secs')::int, 0), 0), 86400) as secs
  from public.libraries l, jsonb_each(l.doc -> 'plays') x (k, e)
  where e ? 'v' and length(e -> 'v' ->> 'id') <= 200 and (e -> 'v' ->> 'at') ~ '^\d{1,15}$'
) old
order by user_id, at, track_id, secs desc
on conflict do nothing;
insert into public.play_tracks (user_id, track_id, track)
select l.user_id, k, e -> 'v'
from public.libraries l, jsonb_each(l.doc -> 'ptracks') x (k, e)
where e ? 'v' and length(k) <= 200 and jsonb_typeof(e -> 'v') = 'object'
on conflict do nothing;
update public.libraries set doc = doc - 'plays' - 'ptracks' where doc ? 'plays' or doc ? 'ptracks';

-- Tell a listener's other devices about new plays.
do $$
begin
  alter publication supabase_realtime add table public.plays;
exception when duplicate_object then null;
end
$$;

-- ---------- Feedback ----------
-- Bug reports and ideas from listeners. Each person sees their own, with the
-- reply; admins see and answer all of them in the app (#/admin).
create table if not exists public.admins (
  user_id uuid primary key references auth.users (id) on delete cascade
);
alter table public.admins enable row level security; -- no policies: invisible to the site
revoke all on public.admins from anon, authenticated;

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.admins where user_id = auth.uid())
$$;
revoke execute on function public.is_admin() from public, anon;
grant execute on function public.is_admin() to authenticated;

create table if not exists public.feedback (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  email text,
  name text check (length(name) <= 80),
  kind text not null check (kind in ('bug', 'idea', 'other')),
  message text not null check (length(message) between 3 and 4000),
  page text check (length(page) <= 300),
  ua text check (length(ua) <= 300),
  release text check (length(release) <= 40),
  status text not null default 'new' check (status in ('new', 'seen', 'planned', 'fixed', 'closed')),
  reply text check (length(reply) <= 4000),
  updated_at timestamptz not null default now()
);
create index if not exists feedback_user on public.feedback (user_id, at desc);
create index if not exists feedback_status on public.feedback (status, at desc);

alter table public.feedback enable row level security;
drop policy if exists "feedback: add own" on public.feedback;
create policy "feedback: add own" on public.feedback for insert to authenticated with check (user_id = (select auth.uid()));
drop policy if exists "feedback: read own, admins all" on public.feedback;
create policy "feedback: read own, admins all" on public.feedback for select to authenticated using (user_id = (select auth.uid()) or (select public.is_admin()));
drop policy if exists "feedback: admins answer" on public.feedback;
create policy "feedback: admins answer" on public.feedback for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));

revoke all on public.feedback from anon, authenticated;
grant select on public.feedback to authenticated;
grant insert (kind, message, page, ua, release, name) on public.feedback to authenticated;
grant update (status, reply) on public.feedback to authenticated;

-- Fills in who sent it (so it can't be faked) and keeps it to 20 a day per person.
create or replace function public.feedback_before() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    if (select count(*) from public.feedback where user_id = new.user_id and at > now() - interval '1 day') >= 20 then
      raise exception 'You''ve sent a lot today. Try again tomorrow.';
    end if;
    new.email := (select email from auth.users where id = new.user_id);
  end if;
  new.updated_at := now();
  return new;
end
$$;
revoke execute on function public.feedback_before() from public, anon, authenticated;
drop trigger if exists feedback_before on public.feedback;
create trigger feedback_before before insert or update on public.feedback for each row execute function public.feedback_before();

-- Admins can read and clear crash reports in the app.
drop policy if exists "crash reports: admins read" on public.client_errors;
create policy "crash reports: admins read" on public.client_errors for select to authenticated using ((select public.is_admin()));
drop policy if exists "crash reports: admins clear" on public.client_errors;
create policy "crash reports: admins clear" on public.client_errors for delete to authenticated using ((select public.is_admin()));
grant select, delete on public.client_errors to authenticated;

-- ---------- Discord alerts ----------
-- New feedback, and crashes not seen in the last day, post to a Discord channel.
-- Switch on by saving a channel webhook (see README); nothing is sent without one.
do $$
begin
  create extension if not exists pg_net;
exception when others then
  raise notice 'pg_net is not available, so Discord alerts are off: %', sqlerrm;
end
$$;

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
create table if not exists private.settings (key text primary key, value text not null);

create or replace function private.discord(embed jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare
  hook text := (select value from private.settings where key = 'discord_webhook');
begin
  if hook is null then
    return;
  end if;
  perform net.http_post(
    url := hook,
    body := jsonb_build_object('username', 'Spindle', 'embeds', jsonb_build_array(embed)),
    headers := '{"Content-Type": "application/json"}'::jsonb
  );
exception when others then
  null; -- An alert must never stop feedback or a crash report from saving.
end
$$;
revoke execute on function private.discord(jsonb) from public, anon, authenticated;

create or replace function public.feedback_alert() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform private.discord(jsonb_build_object(
    'title', case new.kind when 'bug' then '🐞 Bug report' when 'idea' then '💡 Idea' else '💬 Feedback' end,
    'description', left(new.message, 3500),
    'color', case new.kind when 'bug' then 15548997 when 'idea' then 16705372 else 5793266 end,
    'fields', jsonb_build_array(
      jsonb_build_object('name', 'From', 'value', coalesce(nullif(new.name, ''), 'Someone') || ' · ' || coalesce(new.email, 'no email'), 'inline', true),
      jsonb_build_object('name', 'Page', 'value', coalesce(nullif(new.page, ''), '/'), 'inline', true)
    ),
    'footer', jsonb_build_object('text', 'Reply in Spindle → Admin · #' || new.id),
    'timestamp', to_jsonb(new.at)
  ));
  return new;
end
$$;
revoke execute on function public.feedback_alert() from public, anon, authenticated;
drop trigger if exists feedback_alert on public.feedback;
create trigger feedback_alert after insert on public.feedback for each row execute function public.feedback_alert();

create or replace function public.crash_alert() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if exists (select 1 from public.client_errors where message = new.message and id <> new.id and at > now() - interval '1 day') then
    return new;
  end if;
  perform private.discord(jsonb_build_object(
    'title', '💥 New crash',
    'description', '```' || left(new.message, 400) || chr(10) || left(coalesce(new.stack, ''), 1200) || '```',
    'color', 15158332,
    'fields', jsonb_build_array(
      jsonb_build_object('name', 'Page', 'value', coalesce(nullif(new.url, ''), '/'), 'inline', true),
      jsonb_build_object('name', 'Version', 'value', coalesce(new.release, '?'), 'inline', true)
    ),
    'timestamp', to_jsonb(new.at)
  ));
  return new;
end
$$;
revoke execute on function public.crash_alert() from public, anon, authenticated;
drop trigger if exists crash_alert on public.client_errors;
create trigger crash_alert after insert on public.client_errors for each row execute function public.crash_alert();

-- ---------- Insights ----------
-- Spindle's own visitor counting: no third party, no cookies. Each browser
-- keeps a random ID (no name, email or IP) and is counted once a day, along
-- with the site it came from. Signed-in visits also mark the account active
-- that day. Nobody can read these from the site; admins see totals in #/admin.
create table if not exists public.visits (
  day date not null default (now() at time zone 'utc')::date,
  visitor uuid not null,
  signed_in boolean not null default false,
  desktop boolean not null default false,
  source text check (length(source) <= 100),
  first_at timestamptz not null default now(),
  primary key (day, visitor)
);
alter table public.visits enable row level security; -- no policies: write-only through track_visit
revoke all on public.visits from anon, authenticated;

create table if not exists public.active_days (
  user_id uuid not null references auth.users (id) on delete cascade,
  day date not null default (now() at time zone 'utc')::date,
  primary key (user_id, day)
);
alter table public.active_days enable row level security;
revoke all on public.active_days from anon, authenticated;

create or replace function public.track_visit(p_visitor uuid, p_source text default null, p_desktop boolean default false) returns void
language plpgsql security definer set search_path = '' as $$
declare
  today date := (now() at time zone 'utc')::date;
begin
  insert into public.visits (day, visitor, signed_in, desktop, source)
  values (today, p_visitor, auth.uid() is not null, coalesce(p_desktop, false), nullif(left(lower(trim(p_source)), 100), ''))
  on conflict (day, visitor) do update set signed_in = public.visits.signed_in or excluded.signed_in;
  if auth.uid() is not null then
    insert into public.active_days (user_id, day) values (auth.uid(), today) on conflict do nothing;
  end if;
end
$$;
revoke execute on function public.track_visit(uuid, text, boolean) from public;
grant execute on function public.track_visit(uuid, text, boolean) to anon, authenticated;

-- Everything the admin Insights tab shows, in one call. Admins only.
create or replace function public.admin_insights(p_days integer default 30) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  today date := (now() at time zone 'utc')::date;
  first_day date := today - (least(greatest(p_days, 7), 120) - 1);
begin
  if not public.is_admin() then
    raise exception 'admins only';
  end if;
  return jsonb_build_object(
    'totals', jsonb_build_object(
      'accounts', (select count(*) from auth.users),
      'new_week', (select count(*) from auth.users where created_at >= now() - interval '7 days'),
      'visitors_today', (select count(*) from public.visits where day = today),
      'visitors_week', (select count(distinct visitor) from public.visits where day > today - 7),
      'active_today', (select count(*) from public.active_days where day = today),
      'active_week', (select count(distinct user_id) from public.active_days where day > today - 7),
      'active_month', (select count(distinct user_id) from public.active_days where day > today - 30),
      'plays_today', (select count(*) from public.plays where at >= extract(epoch from today::timestamp) * 1000),
      'desktop_week', (select count(distinct visitor) from public.visits where day > today - 7 and desktop),
      'open_feedback', (select count(*) from public.feedback where status in ('new', 'seen', 'planned'))
    ),
    'days', (
      select jsonb_agg(jsonb_build_object(
        'day', d::date,
        'visitors', (select count(*) from public.visits v where v.day = d::date),
        'signups', (select count(*) from auth.users u where (u.created_at at time zone 'utc')::date = d::date),
        'active', (select count(*) from public.active_days a where a.day = d::date),
        'plays', (select count(*) from public.plays p where p.at >= extract(epoch from d) * 1000 and p.at < extract(epoch from d + interval '1 day') * 1000)
      ) order by d)
      from generate_series(first_day::timestamp, today::timestamp, interval '1 day') d
    ),
    'sources', coalesce((
      select jsonb_agg(jsonb_build_object('source', source, 'visitors', n) order by n desc)
      from (
        select coalesce(source, 'Direct or unknown') as source, count(*) as n
        from public.visits where day >= first_day
        group by 1 order by 2 desc limit 8
      ) s
    ), '[]'::jsonb),
    'top_songs', coalesce((
      select jsonb_agg(jsonb_build_object('title', t.track ->> 'title', 'artist', t.track ->> 'artist', 'plays', s.n, 'listeners', s.people) order by s.n desc)
      from (
        select track_id, count(*) as n, count(distinct user_id) as people
        from public.plays where at >= extract(epoch from first_day::timestamp) * 1000
        group by track_id order by 2 desc limit 8
      ) s
      left join lateral (select track from public.play_tracks pt where pt.track_id = s.track_id limit 1) t on true
    ), '[]'::jsonb)
  );
end
$$;
revoke execute on function public.admin_insights(integer) from public, anon;
grant execute on function public.admin_insights(integer) to authenticated;
