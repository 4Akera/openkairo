// The visit's one composer (spec 05): the record panel, the drafts and the keyboard send it what to show —
// a line to start from ("rx "), or an item to edit (change a dose, stop with a reason, update a problem).
// The long note has its own slot (chart-plan.md §2 #29): a bare /note, a card's "long note", editing a long draft and the drawer
// command all set it, and the chart's LongNote reads it — inline under the line, so the record panel stays in view.
import { create } from 'zustand'
import type { Parsed } from '../screens/visit/parse'

/** an item opened in the card without a typed line: its label, its fields, and the draft it replaces when edited */
export interface Seed { label: string; items: Parsed[]; draftId?: string }
/** the long note being written: its kind, its text, and the draft it replaces when editing one */
export interface LongNote { kind: string; text: string; draftId?: string }
export type ComposerCommand = { text: string } | { seed: Seed } | { drawer: LongNote }
interface Composer {
  command: (ComposerCommand & { n: number }) | null; send: (c: ComposerCommand) => void
  longNote: LongNote | null; openLongNote: (n: LongNote) => void; closeLongNote: () => void
}
export const useComposer = create<Composer>((set, get) => ({
  command: null,
  // the drawer command is the long note's: it opens the slot, not the card
  send: (c) => 'drawer' in c ? set({ longNote: { ...c.drawer } }) : set({ command: { ...c, n: (get().command?.n ?? 0) + 1 } }),
  longNote: null,
  openLongNote: (n) => set({ longNote: { ...n } }),
  closeLongNote: () => set({ longNote: null }),
}))
export const compose = (c: ComposerCommand) => useComposer.getState().send(c)
