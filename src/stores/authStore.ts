import { create } from 'zustand'
import type { User, Session } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import type { Profile, Permission } from '../types'

interface AuthState {
  user: User | null
  session: Session | null
  profile: Profile | null
  loading: boolean
  permissions: Permission[]
  roleSlugs: string[]
  // Actions
  setUser: (user: User | null) => void
  setSession: (session: Session | null) => void
  setLoading: (loading: boolean) => void
  can: (perm: Permission) => boolean
  hasRole: (slug: string) => boolean
  signIn: (email: string, password: string) => Promise<{ error: string | null }>
  signOut: () => Promise<void>
  fetchProfile: () => Promise<void>
  updateProfile: (data: Partial<Pick<Profile, 'full_name'>>) => Promise<{ error: string | null }>
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  session: null,
  profile: null,
  loading: true,
  permissions: [],
  roleSlugs: [],

  setUser: (user) => set({ user }),
  setSession: (session) => set({ session }),
  setLoading: (loading) => set({ loading }),

  can: (perm) => get().permissions.includes(perm),
  hasRole: (slug) => get().roleSlugs.includes(slug),

  signIn: async (email, password) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) return { error: error.message }
    return { error: null }
  },

  signOut: async () => {
    await supabase.auth.signOut()
    set({ user: null, session: null, profile: null, permissions: [], roleSlugs: [] })
  },

  fetchProfile: async () => {
    const { user } = get()
    if (!user) return

    // Fetch profile
    let { data: profile } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .single()

    if (!profile) {
      const { data: newProfile } = await supabase
        .from('profiles')
        .insert({ id: user.id, full_name: '' })
        .select()
        .single()
      profile = newProfile
    }

    if (profile) set({ profile })

    // Fetch permissions + role slugs (parallel)
    const [permsResult, slugsResult] = await Promise.all([
      supabase.rpc('get_my_permissions'),
      supabase.rpc('get_my_role_slugs'),
    ])

    set({
      permissions: (permsResult.data ?? []) as Permission[],
      roleSlugs: (slugsResult.data ?? []) as string[],
    })
  },

  updateProfile: async (data) => {
    const { user } = get()
    if (!user) return { error: 'Not authenticated' }

    const { data: updated, error } = await supabase
      .from('profiles')
      .update(data)
      .eq('id', user.id)
      .select()
      .single()

    if (error) return { error: error.message }
    if (updated) set({ profile: updated })
    return { error: null }
  },
}))
