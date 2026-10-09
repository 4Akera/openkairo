// The center (chart-plan.md §1.1, §1.5): the notices on top, then the questions waiting for me about this patient's orders (spec §5.3), the composer (for whoever may write a note, vitals or an order here; a
// fresh one per patient), the long note under the line, the drafts drawn as blocks — these stay whatever the center shows — then what
// it shows: this visit's sets, a stay's days, Since yesterday or Since Done; an older visit, the entries outside a visit, the Whole
// record (the default with no encounter), results over time, one entry. Each scope brings its own bar and kind filter.
import { useMemo, type RefObject } from 'react'
import { useDepartment } from '../../../hooks/organization'
import { Composer, type ComposerHandle } from '../../visit/Composer'
import { chartRowOf } from '../../rows'
import { useOrderWaits } from '../../useRows'
import { BlockContext, type BlockEnv } from '../blocks/env'
import { useChart } from '../context'
import { Notices } from '../Notices'
import { Questions } from './Questions'
import { DraftBlocks } from './DraftBlocks'
import { LongNote } from './LongNote'
import { ResultsTable } from './ResultsTable'
import { EntryView, OutsideList, VisitTimeline } from './Timeline'
import { WholeRecord } from './WholeRecord'

export function EncounterPane({ composer }: { composer: RefObject<ComposerHandle | null> }) {
  const c = useChart(); const { org } = useDepartment(); const at = c.at
  // the packs' words on the record's open orders (spec §5.4: "Waiting for payment" on an order's line), read once a chart, live
  const orders = c.r.server.tables['base.orders']?.rows
  const waitOf = useOrderWaits(useMemo(() => chartRowOf(c.patientId, orders), [c.patientId, orders]))
  const env = useMemo<BlockEnv>(() => ({ org, me: c.me, departmentId: c.departmentId, can: c.can, tables: c.r.server.tables, waitOf,
    startOpen: at.scope === 'entry' ? [at.id] : undefined, onOpen: (id) => c.open({ scope: 'entry', id }) }), [org, c, at, waitOf])
  return <BlockContext.Provider value={env}><div className="grid grid-cols-1 content-start gap-3">
    <Notices />
    <Questions />
    {c.writer && <Composer key={c.patientId} ref={composer} r={c.r} patientId={c.patientId} departmentId={c.departmentId} can={c.can} />}
    <LongNote key={`note:${c.patientId}`} onClose={() => composer.current?.focus()} />
    <DraftBlocks />
    <div id="chart-scope" className="mt-1 grid scroll-mt-[calc(var(--chart-top,0px)+3.5rem)] content-start gap-3 @split:scroll-mt-[calc(var(--chart-top,0px)+1rem)]">
      {at.scope === 'encounter' ? (c.encounter ? <VisitTimeline key={c.encounter.id} id={c.encounter.id} current /> : <WholeRecord />)
        : at.scope === 'visit' ? <VisitTimeline key={at.id} id={at.id} current={at.id === c.encounter?.id} />
        : at.scope === 'outside' ? <OutsideList />
        : at.scope === 'record' ? <WholeRecord />
        : at.scope === 'results' ? <ResultsTable />
        : <EntryView key={at.id} id={at.id} />}
    </div>
  </div></BlockContext.Provider>
}
