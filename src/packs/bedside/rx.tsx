// The note under the doctor's /rx on a ward that uses Ward nursing (spec/openCare.md §5.6, piece 3b): the ward's times for what is
// typed and when its first dose will be due, by the round's rule (R5): "On this ward: 06:00 · 14:00 · 22:00 — the first dose as soon as
// it is signed (it stands for the 14:00 dose), then 22:00". There is no choice of the first dose here: inside the addition the medication
// draft has no id yet (the store gives it when the line is added), so a draft of the pack's could not be about it without a core
// change (§5.6 question 1). The addition adds no draft.
import { useEffect, useState } from 'react'
import { TriangleAlert } from 'lucide-react'
import { useDepartment } from '@core/hooks/organization'
import { addToCommand } from '@core/screens/visit/commands'
import type { Parsed } from '@core/screens/visit/parse'
import { firstDoseWords, roundOf } from './schedule'

const isStart = (p: Parsed) => p.function === 'medication' && p.params.action === 'start'

/** one line for each new medicine: its first dose on this ward */
export function FirstDose({ items }: { items: Parsed[] }) {
  const { dept, org } = useDepartment(); const [now, setNow] = useState(() => Date.now())
  // kept current while the line is typed and signed (the server's R5 counts from the signing moment); never Date.now() in a render
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 60_000); return () => clearInterval(t) }, [])
  if (!dept || dept.work !== 'stays' || !org) return null
  const r = roundOf(org, dept.id)
  const lines = items.filter(isStart).map((p) => firstDoseWords(p.params, r, now, org.organization.time_zone)).filter((x): x is NonNullable<typeof x> => !!x)
  if (!lines.length) return null
  return <ul aria-label="First dose on this ward" className="grid gap-0.5">{lines.map((l, i) => <li key={i} className={`flex items-start gap-1 text-12 ${l.tone === 'warn' ? 'text-warn' : 'text-muted'}`}>
    {l.tone === 'warn' && <TriangleAlert aria-hidden className="mt-px size-3.5 shrink-0" />}<span>{l.text}</span></li>)}</ul>
}

addToCommand({ pack: 'bedside', name: 'rx', writes: ['medication'], add: () => [], note: (items) => items.some(isStart) ? <FirstDose items={items} /> : null })
