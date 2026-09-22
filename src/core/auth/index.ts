import { create } from 'zustand'
import type { Session } from '@supabase/supabase-js'
import { _db as db } from '../db/rpc'
type Status = 'loading' | 'signed_out' | 'signed_in'
interface AuthState { status: Status; session: Session | null; init: () => () => void }
export const useAuth = create<AuthState>((set) => ({
  status: 'loading', session: null,
  init: () => {
    db.auth.getSession().then(({ data }) => set({ session: data.session, status: data.session ? 'signed_in' : 'signed_out' }))
    const sub = db.auth.onAuthStateChange((_e, s) => set({ session: s, status: s ? 'signed_in' : 'signed_out' })).data.subscription
    return () => sub.unsubscribe()
  },
}))
export async function signIn(email: string, password: string) { const { error } = await db.auth.signInWithPassword({ email, password }); if (error) throw error }
export const signOut = () => db.auth.signOut()
export const useLoginId = () => useAuth((s) => s.session?.user.id ?? null)
