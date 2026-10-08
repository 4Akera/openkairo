// Ward nursing's /obs (spec/openCare.md §5.6, piece 1): the vitals and NEWS2 in one line, offered where the department uses the pack.
// Its drafts are the base's own types, as /lab's are: the core's vitals card and score card draw them, the score card asks the server
// for the total as it fills and offers chips for what the line left out, Done waits until NEWS2 is complete, and Sign writes both in
// one set. Under the cards, the line's notes (line.ts): words first, a glyph beside a caution, so colour is never alone.
import { CircleAlert, TriangleAlert } from 'lucide-react'
import { registerCommand } from '@core/screens/visit/commands'
import type { Ctx, Parsed } from '@core/screens/visit/parse'
import { obsLine, obsNotes, type ObsNote } from './line'

/** the kit's glyphs for a caution and a danger, as its callouts draw them */
const GLYPH = { warn: TriangleAlert, danger: CircleAlert }
const TONE: Record<NonNullable<ObsNote['tone']> | 'none', string> = { danger: 'text-danger', warn: 'text-warn', none: 'text-muted' }

/** under the cards: each note on its own line */
export function ObsNotes({ items, ctx }: { items: Parsed[]; ctx: Ctx }) {
  const notes = obsNotes(items, ctx); if (!notes.length) return null
  return <ul aria-label="NEWS2 notes" className="grid gap-0.5">{notes.map((n) => { const Glyph = n.tone ? GLYPH[n.tone] : null
    return <li key={n.text} className={`flex items-start gap-1 text-12 ${TONE[n.tone ?? 'none']}`}>
      {Glyph && <Glyph aria-hidden className="mt-px size-3.5 shrink-0" />}<span>{n.text}</span></li> })}</ul>
}

registerCommand({ name: 'obs', pack: 'bedside', groupTitle: 'Ward nursing', title: 'Obs', label: 'Obs with NEWS2 — the vitals and NEWS2 in one line, added up by the server',
  example: '/obs 105/68 104 38.4 94 22 air a · /obs 132/80 96 37.1 91 20 oxygen a s2', action: 'write:vitals', writes: ['vitals', 'score'],
  parse: (rest, ctx) => obsLine(rest, ctx),
  note: (items, ctx) => obsNotes(items, ctx).length ? <ObsNotes items={items} ctx={ctx} /> : null })
