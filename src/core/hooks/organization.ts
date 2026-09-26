// Who I am here and where I work (spec/openCare.md §3.1): the directory comes from read({shape:'me'}); the department I work in is
// a client-held choice. A login with users in several organizations chooses one per session (choose_user).
import { useQuery } from '@tanstack/react-query'
import { create } from 'zustand'
import { read } from '../db/rpc'
import type { Organization, ServerMe } from '../db/types'
import { directory, mayIn } from '../db/views'
import { setClinicTimeZone } from '../ui'
import { useLoginId } from '../auth'

const DEPT_KEY = 'opencare.department_id'
const readKey = (k: string) => { try { return localStorage.getItem(k) } catch { return null } }
const writeKey = (k: string, v: string | null) => { try { if (v) localStorage.setItem(k, v); else localStorage.removeItem(k) } catch { /* no storage */ } }

interface Choice { departmentId: string | null; setDepartment: (id: string | null) => void }
export const useChoice = create<Choice>((set) => ({
  departmentId: readKey(DEPT_KEY),
  setDepartment: (id) => { writeKey(DEPT_KEY, id); set({ departmentId: id }) },
}))

export function useOrganization() {
  const loginId = useLoginId()
  return useQuery({
    queryKey: ['organization', loginId],
    queryFn: async () => { const m = await read<ServerMe>({ shape: 'me' }); setClinicTimeZone(m.organization.time_zone); return directory(m) },
    enabled: !!loginId, staleTime: 60_000, retry: false,
  })
}

/** the department I work in now, what I may do there, and the choice */
export function useDepartment() {
  const org = useOrganization()
  const departmentId = useChoice((s) => s.departmentId)
  const mine = org.data?.me.departments ?? []
  const dept = mine.find((d) => d.id === departmentId) ?? null
  const can = (action: string) => mayIn(org.data, action, dept?.id ?? null)
  return { org: org.data, isLoading: org.isLoading, error: org.error, departments: mine, dept, can, setDepartment: useChoice.getState().setDepartment }
}

/** whether a serving department (a lab, a pharmacy) works for this one: [null] is every department (department.works_for) */
export function worksFor(org: Organization | undefined, providerId: string | null, departmentId: string | null | undefined) {
  if (!providerId) return true
  const s = org?.allDepartments.find((d) => d.id === providerId)?.serves ?? [null]
  return s.some((x) => x === null || x === departmentId)
}
