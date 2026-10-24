// The database rules in supabase/schema.sql, run against a real Postgres (PGlite).
import { PGlite } from '@electric-sql/pglite'
import { readFileSync } from 'node:fs'
import { beforeAll, describe, expect, it } from 'vitest'

const ME = '11111111-1111-1111-1111-111111111111'
const YOU = '22222222-2222-2222-2222-222222222222'
const ADMIN = '33333333-3333-3333-3333-333333333333'
const SQL = readFileSync('supabase/schema.sql', 'utf8')
let db: PGlite

beforeAll(async () => {
  db = new PGlite()
  // Just enough of Supabase for the schema: auth, the two roles, and a stand-in
  // for pg_net that records the Discord posts instead of sending them.
  await db.exec(`
    create schema auth;
    create table auth.users (id uuid primary key, email text);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('test.uid', true), '')::uuid $$;
    create role authenticated; create role anon;
    grant usage on schema public, auth to authenticated, anon;
    grant execute on function auth.uid() to authenticated, anon;
    -- Supabase's defaults: new tables and functions are open to both roles until the schema narrows them.
    alter default privileges in schema public grant all on tables to authenticated, anon;
    alter default privileges in schema public grant execute on functions to authenticated, anon;
    create publication supabase_realtime;
    create schema net;
    create table net.sent (url text, body jsonb);
    create function net.http_post(url text, body jsonb, headers jsonb) returns bigint language sql as $$ insert into net.sent values (url, body) returning 1 $$;
    insert into auth.users values ('${ME}', 'me@example.com'), ('${YOU}', 'you@example.com'), ('${ADMIN}', 'boss@example.com');
  `)
  await db.exec(SQL)
  await db.exec(SQL) // Safe to run again on an existing project.
  await db.exec(`insert into public.admins values ('${ADMIN}')`)
})

/** Run a query as a signed-in listener, or as a visitor when uid is null. */
async function as<T>(uid: string | null, q: string, params: unknown[] = []) {
  await db.exec(`set role ${uid ? 'authenticated' : 'anon'}; set test.uid = '${uid ?? ''}'`)
  try {
    return (await db.query<T>(q, params)).rows
  } finally {
    await db.exec('reset role; reset test.uid')
  }
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sync = async (uid: string | null, patch: object, device: string): Promise<any> =>
  (await as<{ d: unknown }>(uid, 'select public.sync_library($1::jsonb, $2) as d', [JSON.stringify(patch), device]))[0].d
const count = async (q: string) => (await db.query<{ n: number }>(`select count(*)::int n from ${q}`)).rows[0].n

describe('library sync', () => {
  it('merges entry by entry: newest wins, deletions carry over', async () => {
    await sync(ME, { liked: { s1: { at: 10, v: 'one' }, s2: { at: 11, v: 'two' } } }, 'phone')
    // An older, offline device deletes s1 (too old to win) and adds s3.
    await sync(ME, { liked: { s1: { at: 9, del: true }, s3: { at: 12, v: 'three' } } }, 'laptop')
    // A newer delete of s2 wins.
    const doc = await sync(ME, { liked: { s2: { at: 20, del: true } } }, 'laptop')
    expect(doc.liked.s1).toMatchObject({ at: 10, v: 'one' })
    expect(doc.liked.s2).toMatchObject({ at: 20, del: true })
    expect(doc.liked.s3).toMatchObject({ v: 'three' })
  })

  it('keeps each library to its owner', async () => {
    const doc = await sync(YOU, { liked: { mine: { at: 1, v: 'x' } } }, 'web')
    expect(doc.liked.s1).toBeUndefined()
    expect(await as(YOU, 'select * from public.libraries')).toHaveLength(1)
  })

  it('refuses people who aren’t signed in', async () => {
    await expect(sync(null, {}, 'x')).rejects.toThrow()
  })
})

describe('listening history', () => {
  const add = (uid: string, plays: object[], tracks: object = {}) =>
    as(uid, 'select public.add_plays($1::jsonb, $2::jsonb)', [JSON.stringify(plays), JSON.stringify(tracks)])
  const mine = (uid: string) => as<{ at: number; track_id: string; secs: number }>(uid, 'select at, track_id, secs from public.plays order by at')

  it('adds plays once, keeping the longest listen', async () => {
    await add(ME, [{ id: 'a', at: 1000, secs: 30 }, { id: 'b', at: 2000, secs: 40 }], { a: { title: 'A' } })
    await add(ME, [{ id: 'a', at: 1000, secs: 95 }, { id: 'a', at: 1000, secs: 60 }, { id: 'b', at: 2000, secs: 10 }])
    expect(await mine(ME)).toEqual([
      { at: 1000, track_id: 'a', secs: 95 },
      { at: 2000, track_id: 'b', secs: 40 },
    ])
    expect(await as(ME, 'select track from public.play_tracks')).toEqual([{ track: { title: 'A' } }])
  })

  it('keeps plays private and only writable through add_plays', async () => {
    expect(await mine(YOU)).toEqual([])
    await expect(as(ME, `insert into public.plays (at, track_id) values (1, 'x')`)).rejects.toThrow(/permission/)
    await expect(add(null as unknown as string, [])).rejects.toThrow()
  })

  it('skips malformed plays instead of failing the batch', async () => {
    await add(YOU, [{ id: 'ok', at: 5, secs: 1 }, { id: 'x'.repeat(300), at: 6 }, { at: 7 }, { id: 'bad', at: 'soon' }, { id: 'neg', at: 8, secs: -50 }])
    expect((await mine(YOU)).map((p) => [p.track_id, p.secs])).toEqual([['ok', 1], ['neg', 0]])
  })

  it('redirects plays from older app versions out of the library', async () => {
    const doc = await sync(ME, { plays: { '3000.c': { at: 1, v: { id: 'c', at: 3000, secs: 33 } } }, ptracks: { c: { at: 1, v: { title: 'C' } } }, liked: {} }, 'old')
    expect(doc.plays).toBeUndefined()
    expect((await mine(ME)).map((p) => p.track_id)).toContain('c')
  })

  it('moves plays already in library documents when the schema runs', async () => {
    await db.exec(`update public.libraries set doc = doc || '{"plays": {"9.z": {"at": 1, "v": {"id": "z", "at": 9, "secs": 12}}}, "ptracks": {"z": {"at": 1, "v": {"title": "Z"}}}}' where user_id = '${YOU}'`)
    await db.exec(SQL)
    expect((await mine(YOU)).map((p) => p.track_id)).toContain('z')
    expect(await count(`public.libraries where doc ? 'plays' or doc ? 'ptracks'`)).toBe(0)
  })
})

describe('crash reports', () => {
  const report = (uid: string | null, message = 'boom') => as(uid, 'insert into public.client_errors (message) values ($1)', [message])

  it('lets members add their own; only admins read them', async () => {
    await report(ME)
    await expect(as(ME, `insert into public.client_errors (message, user_id) values ('x', '${YOU}')`)).rejects.toThrow(/permission/)
    expect(await as(ME, 'select * from public.client_errors')).toEqual([])
    expect((await as(ADMIN, 'select message from public.client_errors')).length).toBeGreaterThan(0)
    await expect(report(null)).rejects.toThrow(/permission/)
  })

  it('caps the size and the number per day', async () => {
    await expect(report(ME, 'x'.repeat(501))).rejects.toThrow(/check constraint/)
    for (let i = 0; i < 60; i++) await report(YOU)
    expect(await count(`public.client_errors where user_id = '${YOU}'`)).toBe(50)
  })
})

describe('feedback', () => {
  const send = (uid: string | null, message = 'The lyrics are out of sync', kind = 'bug') =>
    as(uid, 'insert into public.feedback (kind, message, page, name) values ($1, $2, $3, $4)', [kind, message, '/#/search', 'Me'])

  it('records who sent it, and they can see their own', async () => {
    await send(ME)
    const rows = await as<{ email: string; status: string }>(ME, 'select email, status from public.feedback')
    expect(rows).toEqual([{ email: 'me@example.com', status: 'new' }])
    // Someone else can't see it, or send as somebody else.
    expect(await as(YOU, 'select * from public.feedback')).toEqual([])
    await expect(as(ME, `insert into public.feedback (kind, message, user_id) values ('bug', 'hello', '${YOU}')`)).rejects.toThrow(/permission/)
    await expect(as(ME, `insert into public.feedback (kind, message, email) values ('bug', 'hello', 'fake@x.com')`)).rejects.toThrow(/permission/)
    await expect(send(null)).rejects.toThrow(/permission/)
  })

  it('only admins can answer, and only the status and reply', async () => {
    const [{ id }] = await as<{ id: number }>(ME, 'select id from public.feedback limit 1')
    expect(await as(ME, `update public.feedback set status = 'fixed' where id = ${id} returning id`)).toEqual([])
    await as(ADMIN, `update public.feedback set status = 'fixed', reply = 'Thanks, fixed!' where id = ${id}`)
    expect(await as(ME, 'select status, reply from public.feedback')).toEqual([{ status: 'fixed', reply: 'Thanks, fixed!' }])
    await expect(as(ADMIN, `update public.feedback set message = 'edited' where id = ${id}`)).rejects.toThrow(/permission/)
    expect(await as(ADMIN, 'select public.is_admin() as a')).toEqual([{ a: true }])
    expect(await as(ME, 'select public.is_admin() as a')).toEqual([{ a: false }])
  })

  it('checks the kind and length, and keeps it to 20 a day', async () => {
    await expect(send(YOU, 'hi', 'bug')).rejects.toThrow(/check constraint/)
    await expect(send(YOU, 'A real message', 'rant')).rejects.toThrow(/check constraint/)
    for (let i = 0; i < 20; i++) await send(YOU, `Idea number ${i}`, 'idea')
    await expect(send(YOU, 'One more idea', 'idea')).rejects.toThrow(/a lot today/)
  })

  it('posts to Discord only once a webhook is saved', async () => {
    await db.exec('delete from net.sent')
    await send(ME, 'Before the webhook')
    expect(await count('net.sent')).toBe(0)
    await db.exec(`insert into private.settings values ('discord_webhook', 'https://discord.test/hook') on conflict (key) do update set value = excluded.value`)
    await send(ME, 'After the webhook')
    const [post] = (await db.query<{ url: string; body: any }>('select url, body from net.sent')).rows // eslint-disable-line @typescript-eslint/no-explicit-any
    expect(post.url).toBe('https://discord.test/hook')
    expect(post.body.embeds[0]).toMatchObject({ title: '🐞 Bug report', description: 'After the webhook' })
    expect(post.body.embeds[0].fields[0].value).toContain('me@example.com')
    // A crash posts the first time it's seen in a day, not every time.
    await db.exec('delete from net.sent')
    await as(ME, `insert into public.client_errors (message) values ('page: brand new crash')`)
    await as(ME, `insert into public.client_errors (message) values ('page: brand new crash')`)
    expect(await count('net.sent')).toBe(1)
    // Visitors can't read the webhook.
    await expect(as(ME, 'select * from private.settings')).rejects.toThrow(/permission/)
  })
})
