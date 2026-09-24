// The visit's one composer (spec 05): the side lists, the drafts and the keyboard send it what to show —
// a line to start from ("rx "), or an item to edit (change a dose, stop with a reason, update a problem).
import { create } from 'zustand'
import type { Parsed } from '../screens/visit/parse'

/** an item opened in the card without a typed line: its label, its fields, and the draft it replaces when edited */
export interface Seed { label: string; items: Parsed[]; draftId?: string }
export type ComposerCommand = { text: string } | { seed: Seed } | { drawer: { kind: string; text: string } }
interface Composer { command: (ComposerCommand & { n: number }) | null; send: (c: ComposerCommand) => void }
export const useComposer = create<Composer>((set, get) => ({
  command: null,
  send: (c) => set({ command: { ...c, n: (get().command?.n ?? 0) + 1 } }),
}))
export const compose = (c: ComposerCommand) => useComposer.getState().send(c)
