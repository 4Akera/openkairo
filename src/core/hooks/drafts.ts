// Today's drafts: kept in the client per patient until Done writes them as one atomic write_set (spec 05).
// A draft with a tag and append (typed note lines) joins the draft already carrying that tag.
import { create } from 'zustand'
import { newId } from './writes'
export interface Draft { id: string; function: string; params: Record<string, unknown>; line: string; kind?: string; tag?: string }
export type NewDraft = Omit<Draft, 'id'> & { id?: string; append?: boolean }
interface Drafts { byPatient: Record<string, Draft[]>; add: (patientId: string, d: NewDraft) => string; replace: (patientId: string, id: string, d: Omit<Draft, 'id'>) => void; remove: (patientId: string, id: string) => void; clear: (patientId: string) => void }
export const useDrafts = create<Drafts>((set, get) => ({
  byPatient: {},
  add: (p, { append, ...d }) => {
    const list = get().byPatient[p] ?? []
    const same = append && d.tag ? list.find((x) => x.tag === d.tag) : undefined
    if (same) {
      const text = [same.params.text, d.params.text].filter(Boolean).join('\n')
      set((s) => ({ byPatient: { ...s.byPatient, [p]: list.map((x) => x.id === same.id ? { ...x, params: { ...x.params, text }, line: text.replace(/\n/g, ' · ') } : x) } }))
      return same.id
    }
    const id = d.id ?? newId()
    set((s) => ({ byPatient: { ...s.byPatient, [p]: [...list, { ...d, id }] } }))
    return id
  },
  replace: (p, id, d) => set((s) => ({ byPatient: { ...s.byPatient, [p]: (s.byPatient[p] ?? []).map((x) => x.id === id ? { ...d, id } : x) } })),
  remove: (p, id) => set((s) => ({ byPatient: { ...s.byPatient, [p]: (s.byPatient[p] ?? []).filter((x) => x.id !== id) } })),
  clear: (p) => set((s) => { const b = { ...s.byPatient }; delete b[p]; return { byPatient: b } }),
}))
const EMPTY: Draft[] = []
export const useDraftsFor = (patientId: string | null) => useDrafts((s) => (patientId ? s.byPatient[patientId] : undefined) ?? EMPTY)
