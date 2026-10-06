// One bed's tile on the board (tiles.ts, spec/openCare.md §5.1 rule 4), the same in every ward, ICU, labour ward, dialysis unit and
// ER: the bed, who is in it (name, sex and age, the stay's day, the responsible clinician), the one pack line, then the buttons at
// the foot, the base's first (drawn off, in their place, for whoever may not admit). The board and /design draw it.
import type { ReactNode } from 'react'
import { Badge, Button, Card, TONE, cn } from '../../ui'
import type { TileAction, TileSegment } from './tiles'

/** who is in the bed: the base's part of the tile; it opens the stay */
export interface Occupant { name: string; sexAge: string; day: number; clinician: string | null; reason: string | null; urgent: boolean; onOpen: () => void }

export function BedTile({ name, closed, who, line, actions, onAction, disabled, children }: { name: string; closed: boolean; who?: Occupant | null; line: TileSegment[]
  actions: TileAction[] | null; onAction: (a: TileAction) => void; disabled?: (a: TileAction) => boolean; children?: ReactNode }) {
  return <Card className={cn('flex flex-col gap-2 p-3', closed && 'opacity-60')}>
    <div className="flex items-center gap-2"><span className="text-14 font-semibold">{name}</span>{closed && <Badge>closed</Badge>}</div>
    {who && <Who o={who} />}
    {line.length > 0 && <PackLine line={line} />}
    {actions && actions.length > 0 && <div className="mt-auto flex flex-wrap gap-1.5 pt-1">{actions.map((a) =>
      <Button key={a.key} size="sm" variant={a.key === 'admit' ? 'outline' : 'ghost'} disabled={(a.base && a.off) || disabled?.(a)} title={a.base && a.off ? 'Not for your role' : undefined}
        onClick={() => onAction(a)}>{a.label}</Button>)}</div>}
    {children}
  </Card>
}

function Who({ o }: { o: Occupant }) {
  return <button type="button" onClick={o.onOpen} className="grid text-start hover:underline focus-ring">
    <span className="text-13 font-medium">{o.name}<span className="ms-1.5 text-12 font-normal text-faint">{o.sexAge}</span></span>
    <span className="text-12 text-faint">{[`Day ${o.day}`, o.clinician, o.reason, o.urgent && 'urgent'].filter(Boolean).join(' · ')}</span></button>
}

/** the packs' one line: each pack's words in turn; a state colour only on the word that carries the state, never the whole line */
export function PackLine({ line }: { line: TileSegment[] }) {
  const words = line.flatMap((s) => s.words.map((w, i) => ({ key: `${s.pack}:${i}`, ...w })))
  return <p className="truncate text-12 text-muted" title={words.map((w) => w.text).join(' · ')}>{words.map((w, i) =>
    <span key={w.key}>{i > 0 && <span className="text-faint"> · </span>}<span className={cn(w.tone && `font-medium ${TONE[w.tone].text}`)}>{w.text}</span></span>)}</p>
}
