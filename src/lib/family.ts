// Family accounts: sign-ups are off, so the owner adds people from #/admin →
// Family with an ID and a password the owner picks (supabase/schema.sql,
// "Family accounts"). Behind the scenes the ID is an email at a made-up domain.
import { supabase } from './supabase'

export const FAMILY_DOMAIN = 'spindle.family'

/** "papa" → papa@spindle.family; a real email is left as it is. */
export const loginEmail = (id: string) => {
  const v = id.trim().toLowerCase()
  return v.includes('@') ? v : `${v}@${FAMILY_DOMAIN}`
}

export interface FamilyMember {
  id: string
  login: string
  created_at: string
  last_sign_in_at: string | null
}

async function rpc<T>(fn: string, args?: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase!.rpc(fn, args)
  if (error) throw new Error(error.message)
  return data as T
}

export const familyMembers = () => rpc<FamilyMember[]>('family_members')
export const addFamily = (login: string, password: string) => rpc<string>('family_add', { p_login: login, p_password: password })
export const setFamilyPassword = (id: string, password: string) => rpc<void>('family_set_password', { p_id: id, p_password: password })
export const removeFamily = (id: string) => rpc<void>('family_remove', { p_id: id })
