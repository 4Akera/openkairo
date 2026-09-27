// /design · Record blocks (design-system.md §7, build plan 3.4–3.6): the chart's real blocks on a made-up record — one card per signed
// set, every family, every state (new, corrected, crossed out, critical and not reviewed, private with Open anyway, a draft, Details
// open) — for everyone, with nothing read or written: each action says what it would have done. Tab to a block, ↵ opens its Details
// under it, Esc closes them.
import { useMemo, useState, type ReactNode } from 'react'
import { Check } from 'lucide-react'
import { Heading, Tag } from '../../ui'
import { SetCard } from '../chart/blocks'
import { PrivateNotes } from '../chart/blocks/Privacy'
import { BlockContext, type BlockEnv } from '../chart/blocks/env'
import { Columns } from './Frame'
import { SAMPLE_DRAFTS, SAMPLE_ENV, SAMPLE_HIDDEN, SAMPLE_MORE, SAMPLE_PATIENT, SAMPLE_SETS } from './recordFixtures'

export function Blocks({ side }: { side: boolean }) { return <Columns side={side}><Body /></Columns> }

function Body() {
  return <div className="grid gap-6">
    <Gallery title="A signed set" hint="a clinic visit's Done: one card, its blocks divided by hairlines; the paper forms (the prescription, the orders, the problems, the allergies) are one block each; the family is told by an icon and a word, colour is kept for state">
      <SetCard set={SAMPLE_SETS.visit} />
    </Gallery>
    <Gallery title="Results back" hint="new since the patient was seen (the dot); a critical result not reviewed (the rail, the badge, Reviewed); a corrected result, the replaced value struck, its Details open">
      <SetCard set={SAMPLE_SETS.lab} />
    </Gallery>
    <Gallery title="Private and crossed out" hint="the Summary's notice and a private entry's quiet line, each with Open anyway under it; a note crossed out, with why, who and when">
      <PrivateNotes hidden={SAMPLE_HIDDEN} patientId={SAMPLE_PATIENT} />
      <SetCard set={SAMPLE_SETS.private} /><SetCard set={SAMPLE_SETS.crossed} />
    </Gallery>
    <Gallery title="Drafts" hint="drawn with the exact type and data Done will write (the composer's own draftEntries): dashed, Not signed, edit and remove on hover">
      <SetCard set={SAMPLE_DRAFTS} head={<Head>Not signed yet · Done signs {SAMPLE_DRAFTS.groups.length}</Head>} />
    </Gallery>
    <Gallery title="Two more families" hint="a death, and a type with no block of its own: the Fallback shows its fields with plain labels, never a key">
      <SetCard set={SAMPLE_MORE} />
    </Gallery>
  </div>
}

const Head = ({ children }: { children: ReactNode }) =>
  <div className="flex items-center gap-2 border-b border-line bg-sunken px-4 py-2 text-12 text-faint"><Tag tone="accent">Drafts</Tag>{children}</div>

/** a section of the gallery with its own sample environment: what an action would have done shows under its cards */
function Gallery({ title, hint, children }: { title: string; hint: string; children: ReactNode }) {
  const [said, setSaid] = useState<string | null>(null)
  const env = useMemo<BlockEnv>(() => ({ ...SAMPLE_ENV, onSample: setSaid, onOpen: (id) => setSaid(`open entry ${id}`),
    onEdit: (d) => setSaid(`edit the draft "${d.line}"`), onRemove: (d) => setSaid(`remove the draft "${d.line}"`) }), [])
  return <section className="grid min-w-0 gap-2">
    <Heading>{title}</Heading><p className="-mt-1 text-12 text-faint">{hint}</p>
    <BlockContext.Provider value={env}>{children}</BlockContext.Provider>
    {said && <p role="status" className="flex items-center gap-1.5 text-12 text-ok"><Check aria-hidden className="size-3.5" />Would {said} (a sample: nothing is read or written)</p>}
  </section>
}
