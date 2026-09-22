// The only file that constructs the Supabase client (spec 05). Everything else goes through hooks.
import { createClient } from '@supabase/supabase-js'
import type { Database } from './types.generated'
const url = import.meta.env.VITE_SUPABASE_URL as string
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string
if (!url || !key) throw new Error('VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY are required')
export const db = createClient<Database>(url, key, { auth: { persistSession: true, autoRefreshToken: true } })
