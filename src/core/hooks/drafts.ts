// Today's drafts: kept in the client per patient until Done writes them as one atomic write_set (spec 05).
import { create } from 'zustand'
import { newId } from './writes'
export interface Draft { id: string; function: string; params: Record<string, unknown>; line: string }
interface Drafts { byPatient: Record<string, Draft[]>; add: (patientId: string, d: Omit<Draft, 'id'>) => void; remove: (patientId: string, id: string) => void; clear: (patientId: string) => void }
export const useDrafts = create<Drafts>((set) => ({
  byPatient: {},
  add: (p, d) => set((s) => ({ byPatient: { ...s.byPatient, [p]: [...(s.byPatient[p] ?? []), { ...d, id: newId() }] } })),
  remove: (p, id) => set((s) => ({ byPatient: { ...s.byPatient, [p]: (s.byPatient[p] ?? []).filter((x) => x.id !== id) } })),
  clear: (p) => set((s) => { const b = { ...s.byPatient }; delete b[p]; return { byPatient: b } }),
}))
const EMPTY: Draft[] = []
export const useDraftsFor = (patientId: string | null) => useDrafts((s) => (patientId ? s.byPatient[patientId] : undefined) ?? EMPTY)
