// Saving a setting: one call, then the organization and the change log are read again (spec 02)
import { create } from 'zustand'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { rpc, Refusal, type FnName } from '../../db/rpc'
import { useChoice } from '../../hooks/organization'

// each Settings page opens to whoever holds its own manage: action (a clinic's own role may hold only some)
export const PAGE_ACTION: Record<string, string> = { organization: 'manage:organization', departments: 'manage:departments', services: 'manage:services', users: 'manage:users',
  roles: 'manage:roles', templates: 'manage:templates', packs: 'manage:organization', reads: 'manage:organization' }
/** a manage: call refused for want of a second factor opens the MFA prompt */
export const useMfaNeeded = create<{ needed: boolean; set: (v: boolean) => void }>((set) => ({ needed: false, set: (needed) => set({ needed }) }))
// functions keyed by the row's own id (retire_…) take no organization_id; the API refuses a call with a parameter the function lacks
const BY_ID: FnName[] = ['retire_department', 'retire_service', 'retire_template', 'retire_role']
export function useSave(fn: FnName) {
  const qc = useQueryClient(); const orgId = useChoice((s) => s.organizationId)
  return useMutation({ mutationFn: (a: Record<string, unknown>) => rpc(fn, BY_ID.includes(fn) ? a : { organization_id: orgId, ...a }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['organization'] }); qc.invalidateQueries({ queryKey: ['settings_changes'] }) },
    onError: (e) => { if (e instanceof Refusal && e.code === 'mfa_required') useMfaNeeded.getState().set(true) } })
}
