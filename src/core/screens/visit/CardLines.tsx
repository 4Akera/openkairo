// The packs' lines under a base card and after its draft (lines.ts, core change C1): the pack's name over its rows in the card, its
// short words after the draft's line; a state colour only on the word that carries it. A notice, never a stop.
import { Fragment } from 'react'
import { TONE, cn } from '../../ui'
import type { LineWord, PackCardLine } from './lines'

const Said = ({ words }: { words: LineWord[] }) => <>{words.map((w, i) => <Fragment key={i}>{i > 0 && <span className="text-faint"> · </span>}
  <span className={cn(w.tone && `font-medium ${TONE[w.tone].text}`)}>{w.text}</span></Fragment>)}</>

/** under the card's fields: each pack's name and rows */
export function CardLines({ lines }: { lines: PackCardLine[] }) {
  if (!lines.length) return null
  return <div className="mt-2 grid gap-1.5">{lines.map((l) => <div key={l.pack} data-pack-line={l.pack} className="rounded-md bg-sunken px-2.5 py-1.5 text-12 text-muted">
    {l.rows.map((r, i) => <p key={i} className={cn(i === 0 && 'text-13 text-fg')}>{i === 0 && <span className="me-1.5 text-11 font-semibold uppercase tracking-[0.08em] text-accent">{l.title}</span>}<Said words={r} /></p>)}
  </div>)}</div>
}

/** after a draft's line: the packs' short words */
export function DraftLine({ lines }: { lines: PackCardLine[] }) {
  const said = lines.filter((l) => l.short.length)
  if (!said.length) return null
  return <p className="text-12 text-muted">{said.map((l, i) => <span key={l.pack} data-pack-line={l.pack}>{i > 0 && <span className="text-faint"> · </span>}<Said words={l.short} /></span>)}</p>
}
