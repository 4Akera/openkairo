// The composer's commands and cards (spec 05, 06): "/" starts a command; anything else is note text.
// Core registers its commands here the same way a pack registers its own (in src/packs/<key>): a pack's command
// writes the pack's own type through its own write function. The "/" menu lists the commands the reader's role
// may write in this department, and a pack's only while the pack is on in this organization.
// A pack never takes a command over for the whole clinic: a name that is taken is refused. It may give its own
// department type its own version of a core command (overrideCommand) and its own card (registerCard) — which still
// write what the core command writes, so the record keeps one medication list, one problem list — and each
// department may decline them (departments.pack_cards).
import type { ComponentType } from 'react'
import type { Ctx, Parsed, Result } from './parse'

export interface Command {
  name: string                      // typed as /name
  aliases?: string[]
  label: string                     // what it writes, in the clinic's words
  example: string                   // a line that shows how it is typed
  action: string                    // the action a role needs to see it, e.g. write:prescription
  pack?: string                     // a pack's command shows only while the pack is on
  writes?: string[]                 // the write functions its drafts call: a department's version must call the same
  /** the text after the command → drafts (null: nothing typed yet) */
  parse: (rest: string, ctx: Ctx) => Result
  /** the command alone: an empty card to fill field by field, or the long note under the line */
  empty?: (ctx: Ctx) => Parsed[] | { drawer: { kind: string; text: string } }
}
/** a pack's version of a command in its own department type: its label, parser and empty card */
export interface CommandOverride { pack: string; departmentType: string; name: string; label?: string; example?: string; parse?: Command['parse']; empty?: Command['empty'] }
type Where = Pick<Ctx, 'departmentType' | 'packCards' | 'packs'>

const commands = new Map<string, Command>(); const names = new Map<string, string>(); const overrides: CommandOverride[] = []
export function registerCommand(c: Command) {
  const taken = [c.name, ...(c.aliases ?? [])].find((n) => names.has(n.toLowerCase()))
  if (taken) { console.error(`openCare: /${taken} is taken — a pack adds its command under a new name, or overrides one for its own department type`); return }
  commands.set(c.name, c); for (const n of [c.name, ...(c.aliases ?? [])]) names.set(n.toLowerCase(), c.name)
}
export function overrideCommand(o: CommandOverride) { overrides.push(o) }
/** the pack's version, in a department of its type that uses pack cards, while the pack is on */
const overrideFor = (name: string, w?: Where) => w?.departmentType && w.packCards !== false
  ? overrides.find((o) => o.name === name && o.departmentType === w.departmentType && (!w.packs || w.packs.includes(o.pack))) : undefined
function resolve(c: Command, w?: Where): Command {
  const o = overrideFor(c.name, w); if (!o) return c
  // it may look and ask differently; it writes what the core command writes
  const same = (r: Result): Result => !r || 'error' in r || !c.writes || r.ok.every((p) => c.writes!.includes(p.function)) ? r : { error: `This department's /${c.name} must write what /${c.name} writes` }
  return { ...c, label: o.label ?? c.label, example: o.example ?? c.example, parse: o.parse ? (rest, x) => same(o.parse!(rest, x)) : c.parse, empty: o.empty ?? c.empty }
}
/** "rx", "RX", "plan:" → the command (this department's version), if one is registered under that name or alias */
export const commandNamed = (word: string, w?: Where) => { const n = names.get(word.toLowerCase().replace(/:$/, '')); const c = n ? commands.get(n) : undefined; return c ? resolve(c, w) : undefined }
/** may this reader use it here: their role holds its action, and its pack is on (no ctx.can: every command, as in tests and previews) */
export const allowed = (c: Command, ctx: Pick<Ctx, 'can' | 'packs'>) => (!ctx.can || ctx.can(c.action)) && (!c.pack || !ctx.packs || ctx.packs.includes(c.pack))
export const commandsFor = (ctx: Pick<Ctx, 'can' | 'packs' | 'departmentType' | 'packCards'>) => [...commands.values()].filter((c) => allowed(c, ctx)).map((c) => resolve(c, ctx))
/** does any pack offer this department type its own commands or cards (Settings shows the switch only then) */
export const offersFor = (departmentType: string) => overrides.some((o) => o.departmentType === departmentType) || cards.some((c) => c.departmentType === departmentType)

// ── cards: the fields under the line. Core draws its own types; a pack registers the card for its own write function,
//    or its department type's card for a core one (never the clinic's) ──
export interface CardEditorProps { q: Record<string, any>; set: (patch: Record<string, unknown>) => void; ctx: Ctx }   // eslint-disable-line @typescript-eslint/no-explicit-any
export interface CardRegistration { function: string; Editor: ComponentType<CardEditorProps>; line?: (params: Record<string, unknown>) => string; pack: string; departmentType?: string }
const CORE = new Set(['vitals', 'medication', 'problem', 'allergy', 'order', 'note', 'list_review'])
const cards: CardRegistration[] = []
export function registerCard(r: CardRegistration) {
  if (CORE.has(r.function) && !r.departmentType) { console.error(`openCare: a pack cannot replace the ${r.function} card for the whole clinic — give it its department type`); return }
  cards.push(r)
}
/** the card for a draft here: its department type's (if the department uses pack cards), else the pack's own; undefined: core draws it */
export const cardFor = (fn: string, w?: Where) =>
  (w?.departmentType && w.packCards !== false ? cards.find((c) => c.function === fn && c.departmentType === w.departmentType && (!w.packs || w.packs.includes(c.pack))) : undefined)
  ?? cards.find((c) => c.function === fn && !c.departmentType && !CORE.has(fn) && (!w?.packs || w.packs.includes(c.pack)))
