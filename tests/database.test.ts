// The database rules in supabase/schema.sql, run against a real Postgres (PGlite).
import { PGlite } from '@electric-sql/pglite'
import { readFileSync } from 'node:fs'
import { beforeAll, describe, expect, it } from 'vitest'

const ME = '11111111-1111-1111-1111-111111111111'
const YOU = '22222222-2222-2222-2222-222222222222'
let db: PGlite

beforeAll(async () => {
  db = new PGlite()
  // Just enough of Supabase for the schema: auth.uid() and the two roles.
  await db.exec(`
    create schema auth;
    create table auth.users (id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('test.uid', true), '')::uuid $$;
    create role authenticated; create role anon;
    grant usage on schema public, auth to authenticated, anon;
    grant execute on function auth.uid() to authenticated, anon;
    -- Supabase's defaults: new tables and functions are open to both roles until the schema narrows them.
    alter default privileges in schema public grant all on tables to authenticated, anon;
    alter default privileges in schema public grant execute on functions to authenticated, anon;
    create publication supabase_realtime;
    insert into auth.users values ('${ME}'), ('${YOU}');
  `)
  const sql = readFileSync('supabase/schema.sql', 'utf8')
  await db.exec(sql)
  await db.exec(sql) // Safe to run again on an existing project.
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

describe('crash reports', () => {
  const report = (uid: string | null, message = 'boom') => as(uid, 'insert into public.client_errors (message) values ($1)', [message])

  it('lets members add their own, and nobody read them', async () => {
    await report(ME)
    await expect(as(ME, `insert into public.client_errors (message, user_id) values ('x', '${YOU}')`)).rejects.toThrow(/permission/)
    await expect(as(ME, 'select * from public.client_errors')).rejects.toThrow(/permission/)
    await expect(report(null)).rejects.toThrow(/permission/)
  })

  it('caps the size and the number per day', async () => {
    await expect(report(ME, 'x'.repeat(501))).rejects.toThrow(/check constraint/)
    for (let i = 0; i < 60; i++) await report(YOU)
    const [{ n }] = (await db.query<{ n: number }>(`select count(*)::int n from public.client_errors where user_id = '${YOU}'`)).rows
    expect(n).toBe(50)
  })
})
