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
  roleNames: string[]
  preferredBlocks: string[]   // IDs of blocks to show; empty = show all
  pinnedBlocks: string[]      // IDs pinned to the top of the Add Block menu
  inDept: boolean
  hasBilling: boolean
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
  updatePreferredBlocks: (ids: string[]) => Promise<{ error: string | null }>
  updatePinnedBlocks: (ids: string[]) => Promise<{ error: string | null }>
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  session: null,
  profile: null,
  loading: true,
  permissions: [],
  roleSlugs: [],
  roleNames: [],
  preferredBlocks: [],
  pinnedBlocks: [],
  inDept: false,
  hasBilling: false,

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
    set({ user: null, session: null, profile: null, permissions: [], roleSlugs: [], roleNames: [], inDept: false, hasBilling: false })
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

    if (profile) set({ profile, preferredBlocks: profile.preferred_blocks ?? [], pinnedBlocks: profile.pinned_blocks ?? [] })

    // Fetch permissions + role slugs + role names + dept membership (parallel)
    const [permsResult, slugsResult, deptResult] = await Promise.all([
      supabase.rpc('get_my_permissions'),
      supabase.rpc('get_my_role_slugs'),
      supabase.from('department_members').select('id').eq('user_id', user.id).limit(1),
    ])

    const slugs = (slugsResult.data ?? []) as string[]

    let names: string[] = []
    if (slugs.length > 0) {
      const { data: rolesData } = await supabase
        .from('roles')
        .select('name, slug')
        .in('slug', slugs)
      if (rolesData) names = rolesData.map((r) => r.name)
    }

    const perms = (permsResult.data ?? []) as Permission[]
    set({
      permissions: perms,
      roleSlugs: slugs,
      roleNames: names,
      inDept: (deptResult.data?.length ?? 0) > 0,
      hasBilling: perms.some(p => p.startsWith('billing.')),
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

  updatePreferredBlocks: async (ids) => {
    const { user } = get()
    if (!user) return { error: 'Not authenticated' }

    const { data: updated, error } = await supabase
      .from('profiles')
      .update({ preferred_blocks: ids.length > 0 ? ids : null })
      .eq('id', user.id)
      .select()
      .single()

    if (error) return { error: error.message }
    if (updated) set({ profile: updated, preferredBlocks: ids })
    return { error: null }
  },

  updatePinnedBlocks: async (ids) => {
    const { user } = get()
    if (!user) return { error: 'Not authenticated' }

    const { data: updated, error } = await supabase
      .from('profiles')
      .update({ pinned_blocks: ids.length > 0 ? ids : null })
      .eq('id', user.id)
      .select()
      .single()

    if (error) return { error: error.message }
    if (updated) set({ profile: updated, pinnedBlocks: ids })
    return { error: null }
  },
}))
