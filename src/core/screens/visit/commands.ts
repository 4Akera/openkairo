// The composer's commands (spec 05): a line that starts with "/" is a command; anything else is note text.
// Core registers its commands here the same way a pack registers its own (in src/packs/<key>): a pack's command
// writes the pack's own type through its own write function. The "/" menu lists the commands the reader's role
// may write in this department, and a pack's only while the pack is on in this organization.
import type { Ctx, Parsed, Result } from './parse'

export interface Command {
  name: string                      // typed as /name
  aliases?: string[]
  label: string                     // what it writes, in the clinic's words
  example: string                   // a line that shows how it is typed
  action: string                    // the action a role needs to see it, e.g. write:prescription
  pack?: string                     // a pack's command shows only while the pack is on
  /** the text after the command → drafts (null: nothing typed yet) */
  parse: (rest: string, ctx: Ctx) => Result
  /** the command alone: an empty card to fill field by field, or a note beside the record */
  empty?: (ctx: Ctx) => Parsed[] | { drawer: { kind: string; text: string } }
}

const commands = new Map<string, Command>(); const names = new Map<string, string>()
export function registerCommand(c: Command) { commands.set(c.name, c); for (const n of [c.name, ...(c.aliases ?? [])]) names.set(n.toLowerCase(), c.name) }
/** "rx", "RX", "plan:" → the command, if one is registered under that name or alias */
export const commandNamed = (word: string) => { const n = names.get(word.toLowerCase().replace(/:$/, '')); return n ? commands.get(n) : undefined }
/** may this reader use it here: their role holds its action, and its pack is on (no ctx.can: every command, as in tests and previews) */
export const allowed = (c: Command, ctx: Pick<Ctx, 'can' | 'packs'>) => (!ctx.can || ctx.can(c.action)) && (!c.pack || !ctx.packs || ctx.packs.includes(c.pack))
export const commandsFor = (ctx: Pick<Ctx, 'can' | 'packs'>) => [...commands.values()].filter((c) => allowed(c, ctx))
