import { createClient, type SupabaseClient } from '@supabase/supabase-js'

// Accounts are optional: without these two settings the site works exactly as
// before, keeping everything on this device. Both values are public by design;
// row-level security in supabase/schema.sql keeps each library private.
const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

export const supabase: SupabaseClient | null =
  url && key
    ? createClient(url, key, {
        // PKCE puts the confirmation code in ?code=, which leaves the router's #/path alone.
        auth: { flowType: 'pkce', persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, storageKey: 'aura:auth' },
      })
    : null

export const accountsEnabled = !!supabase
