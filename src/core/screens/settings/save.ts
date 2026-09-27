// Saving a setting: one of the other doors (spec/openCare.md §3.12) — save/remove for people, roles and places, write_setting
// for everything the base declares — then the directory and the change log are read again.
import { create } from 'zustand'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Refusal } from '../../db/rpc'

// each Settings page opens to whoever holds its own manage: action (a clinic's own role may hold only some)
export const PAGE_ACTION: Record<string, string> = { organization: 'manage:settings', departments: 'manage:places', services: 'manage:settings', users: 'manage:users',
  roles: 'manage:roles', templates: 'manage:settings', packs: 'manage:settings', reads: 'read:log' }
/** a manage: call refused for want of a second factor opens the MFA prompt */
export const useMfaNeeded = create<{ needed: boolean; set: (v: boolean) => void }>((set) => ({ needed: false, set: (needed) => set({ needed }) }))
export function useSave<A>(fn: (a: A) => Promise<unknown>) {
  const qc = useQueryClient()
  return useMutation({ mutationFn: fn,
    // the save is pending until the directory is read again, so a form never works from the old rows (a second Add, a next move);
    // a failed one is read again too, so a half-done reorder shows as it landed
    onSettled: () => Promise.all([qc.invalidateQueries({ queryKey: ['organization'] }), qc.invalidateQueries({ queryKey: ['settings_changes'] })]),
    onError: (e) => { if (e instanceof Refusal && e.code === 'mfa_required') useMfaNeeded.getState().set(true) } })
}
