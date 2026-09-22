// The organization and the department the client is showing (a client-held choice, spec 05).
import { useQuery } from '@tanstack/react-query'
import { create } from 'zustand'
import { rpc } from '../db/rpc'
import type { Organization } from '../db/types'
import { useLoginId } from '../auth'

// which organization: the first the login belongs to (one per login in v1); remembered per browser
const ORG_KEY = 'opencare.organization_id', DEPT_KEY = 'opencare.department_id'
const read = (k: string) => { try { return localStorage.getItem(k) } catch { return null } }
const write = (k: string, v: string | null) => { try { if (v) localStorage.setItem(k, v); else localStorage.removeItem(k) } catch { /* no storage */ } }

interface Choice { organizationId: string | null; departmentId: string | null; setOrganization: (id: string | null) => void; setDepartment: (id: string | null) => void }
export const useChoice = create<Choice>((set) => ({
  organizationId: read(ORG_KEY), departmentId: read(DEPT_KEY),
  setOrganization: (id) => { write(ORG_KEY, id); set({ organizationId: id }) },
  setDepartment: (id) => { write(DEPT_KEY, id); set({ departmentId: id }) },
}))

// find my organization from the login: read_organization needs the id, so we ask the server for the login's row first
export async function discoverOrganization(): Promise<string | null> {
  try { return await rpc<string | null>('my_organization') } catch { return null }
}

export function useOrganization() {
  const loginId = useLoginId()
  const orgId = useChoice((s) => s.organizationId)
  return useQuery({ queryKey: ['organization', orgId, loginId], queryFn: () => rpc<Organization>('read_organization', { organization_id: orgId }), enabled: !!loginId && !!orgId, staleTime: 60_000 })
}

export function useDepartment() {
  const org = useOrganization()
  const departmentId = useChoice((s) => s.departmentId)
  const mine = org.data?.me.departments ?? []
  const dept = mine.find((d) => d.id === departmentId) ?? null
  const can = (action: string) => org.data?.me.actions.includes(action) ?? false
  return { org: org.data, isLoading: org.isLoading, error: org.error, departments: mine, dept, can, setDepartment: useChoice.getState().setDepartment }
}
