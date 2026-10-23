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
