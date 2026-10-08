// Radiology's own walk-in step (spec/openCare.md §5.5, Q7; the picture "Radiology · a walk-in"): what for is the doctor's line — /xr,
// /us, /ct or /mri and the exam, with the side, +c, portable, report, urgent — and the exams asked for most as ticks; what to tell the
// patient shows as they are chosen, in English and Arabic; who asked folded and optional. Start hands back the exams with radiology's
// words on each (core change (a)), as every bench's step does (core bench/WhatFor.tsx).
import { useState } from 'react'
import { useDepartment } from '@core/hooks/organization'
import { benchOffers, type WhatForProps } from '@core/screens/bench/WhatFor'
import { startWords } from '@core/screens/bench/walkins'
import type { Service } from '@core/db/types'
import { Button, Callout, Chip, Input, Kbd, errorText } from '@core/ui'
import { KINDS, examOf, packOrder } from './exams'
import { MOST_ASKED, examsIn } from './walkin'

export function ExamStep({ bench, busy, error, onStart, note }: WhatForProps) {
  const { org } = useDepartment(); const offered = benchOffers(org, bench.id)
  const [line, setLine] = useState('/xr '); const [ticked, setTicked] = useState<string[]>([]); const [asked, setAsked] = useState<string | null>(null)
  const typed = examsIn(line, offered)
  const chosen = [...typed.found, ...offered.filter((s) => ticked.includes(s.id) && !typed.found.includes(s))]
  const most = MOST_ASKED.map((c) => offered.find((s) => s.code === c)).filter((s): s is Service => !!s)
  const preps = chosen.map((s) => ({ s, e: examOf(org, s) })).filter((x) => x.e.prep)
  const noSide = chosen.filter((s) => examOf(org, s).side && !typed.said.words.side)
  const start = () => { if (chosen.length && !busy) onStart(chosen.map((s) => ({ ...s, as: packOrder(typed.said.words), priority: typed.said.priority })), asked?.trim() || undefined) }
  const word = KINDS.map((k) => k === 'X-ray' ? '/xr' : k === 'Ultrasound' ? '/us' : k === 'CT' ? '/ct' : '/mri').join(' ')
  return <div className="grid gap-2" onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); start() } }}>
    <Input autoFocus value={line} onChange={(e) => setLine(e.target.value)} aria-label="The exams, as the doctor would type them" className="font-mono" />
    <p className="text-12 text-faint">{word} and the exam · left right both · +c · portable · report · urgent stat</p>
    {typed.unknown.length > 0 && <p className="text-12 text-warn">Not one exam here: {typed.unknown.join(', ')}</p>}
    <div className="flex flex-wrap items-center gap-1.5"><span className="text-12 text-faint">Asked for most:</span>
      {most.map((s) => { const on = chosen.includes(s)
        return <Chip key={s.id} variant="check" on={on} onClick={() => typed.found.includes(s) ? undefined : setTicked((x) => on ? x.filter((y) => y !== s.id) : [...x, s.id])}>{s.name}</Chip> })}</div>
    {preps.map(({ s, e }) => <p key={s.id} className="flex flex-wrap items-center gap-2 text-12 text-muted">{s.name}: {e.prep!.toLowerCase()}
      {e.prep_ar && <span dir="rtl" lang="ar" className="text-13 text-fg">{e.prep_ar}</span>}</p>)}
    {noSide.length > 0 && <p className="text-12 font-medium text-warn">Which side? Type left, right or both ({noSide.map((s) => s.name).join(', ')}).</p>}
    {asked === null ? <button type="button" onClick={() => setAsked('')} className="justify-self-start rounded-sm text-13 text-accent hover:underline focus-ring">+ Who asked (optional)</button>
      : <div className="flex flex-wrap items-center gap-2"><span className="text-13 text-muted">Asked by</span>
          <Input value={asked} onChange={(e) => setAsked(e.target.value)} placeholder="The outside doctor" className="w-full sm:w-72" /><span className="text-12 text-faint">optional</span></div>}
    {!!error && <Callout tone="danger" title="Not started">{errorText(error)}</Callout>}
    <div className="flex flex-wrap items-center gap-2"><Button onClick={start} disabled={!chosen.length} loading={busy}>
      {startWords(chosen.map((s) => `${s.name}${typed.said.words.side ? ` · ${typed.said.words.side}` : ''}`))}<Kbd className="ms-1 max-sm:hidden">⌘↵</Kbd></Button>
      {note && <span className="text-12 text-faint">{note}</span>}</div>
  </div>
}
