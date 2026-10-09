// Ward nursing on the base's /v (spec/openCare.md §5.6): where a department uses the pack, the ward's /v writes the base's vitals and
// NEWS2 in one set (the owner's C3, 2026-10-08); /obs is gone. NEWS2 is the base's own score type: the core's vitals card and score card
// draw the two drafts, the score card asks the server for the total as it fills and offers chips for what the vitals leave out, a change
// on the vitals card derives NEWS2 again, Done waits until NEWS2 is complete, and Sign writes both. Under the cards, the notes (line.ts):
// words first, a glyph beside a caution, so colour is never alone.
import { CircleAlert, TriangleAlert } from 'lucide-react'
import { addToCommand } from '@core/screens/visit/commands'
import type { Ctx, Parsed } from '@core/screens/visit/parse'
import { news2From, obsNotes, type ObsNote } from './line'
import { adultRules } from './obsdue'
import { useWardRules } from './response'

/** the kit's glyphs for a caution and a danger, as its callouts draw them */
const GLYPH = { warn: TriangleAlert, danger: CircleAlert }
const TONE: Record<NonNullable<ObsNote['tone']> | 'none', string> = { danger: 'text-danger', warn: 'text-warn', none: 'text-muted' }

/** under the cards: each note on its own line */
export function ObsNotes({ items, ctx }: { items: Parsed[]; ctx: Ctx }) {
  const notes = obsNotes(items, ctx, adultRules(useWardRules(ctx.departmentId), ctx.record?.patient)); if (!notes.length) return null
  return <ul aria-label="NEWS2 notes" className="grid gap-0.5">{notes.map((n) => { const Glyph = n.tone ? GLYPH[n.tone] : null
    return <li key={n.text} className={`flex items-start gap-1 text-12 ${TONE[n.tone ?? 'none']}`}>
      {Glyph && <Glyph aria-hidden className="mt-px size-3.5 shrink-0" />}<span>{n.text}</span></li> })}</ul>
}

addToCommand({ pack: 'bedside', name: 'v', writes: ['score'], words: ['s2', 'scale2'], add: news2From,
  note: (items, ctx) => obsNotes(items, ctx).length ? <ObsNotes items={items} ctx={ctx} /> : null })
