// The unit's drugs today (spec/openCare.md §5.6, D2c): the patient's current IV or SC medicines (Epoetin alfa 4000 IU IV), each with the
// doctor's timing words and when it was last given; nothing is due by a rule. The nurse ticks what is given now and Sign writes the
// base's given for each, linked to its medicine.
import { useState } from 'react'
import { useDepartment } from '@core/hooks/organization'
import type { Department, PresenceRow } from '@core/db/types'
import { Button, Card, Chip, Kbd, Spinner } from '@core/ui'
import { CardHead, SignState } from './parts'
import { givenEntry, lastWords, unitDrugs } from './drugs'
import { onSign } from './session'
import { useDrugs, useSign } from './useSession'

export function DrugsCard({ dept, stay, now }: { dept: Pick<Department, 'id'>; stay: PresenceRow; now: number }) {
  const { can } = useDepartment()
  const q = useDrugs(dept, stay.patient_id)
  const [ticked, setTicked] = useState<string[]>([])
  const s = useSign()
  const drugs = unitDrugs(q.data?.tables['base.lists'], q.data?.entries ?? [])
  const may = can('write:given')
  const chosen = drugs.filter((d) => ticked.includes(d.item))
  const ready = may && chosen.length > 0 && !s.busy
  const sign = () => { if (ready) void s.sign(chosen.map((d) => givenEntry(d, stay, dept.id)), () => setTicked([])) }
  return <Card className="grid content-start gap-2 p-3" onKeyDown={onSign(sign)}>
    <CardHead>The unit's drugs today</CardHead>
    {q.isLoading ? <Spinner label="Reading the medicines" />
      : q.error ? <p className="text-13 text-danger">The medicines could not be read</p>
      : !drugs.length ? <p className="text-13 text-faint">No IV or SC medicine on the list.</p>
      : <ul className="grid gap-1.5">{drugs.map((d) => <li key={d.item} className="grid gap-0.5">
        {may ? <span><Chip variant="check" on={ticked.includes(d.item)} onClick={() => setTicked((t) => t.includes(d.item) ? t.filter((x) => x !== d.item) : [...t, d.item])}>{d.words}</Chip></span>
          : <span className="text-13 font-medium text-fg">{d.words}</span>}
        <span className="text-12 text-muted">{[d.timing, lastWords(d.last, now)].filter(Boolean).join(' · ')}</span></li>)}</ul>}
    <SignState err={s.err} warn={s.warn} />
    {may && drugs.length > 0 && <div><Button size="sm" onClick={sign} disabled={!ready} loading={s.busy}>Sign {chosen.length > 1 ? `${chosen.length} given` : 'given'}<Kbd className="ms-1 max-sm:hidden">⌘↵</Kbd></Button></div>}
  </Card>
}
