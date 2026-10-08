// The laboratory's own walk-in step (spec/openCare.md §5.3; the picture "Lab · a walk-in"): what for is the doctor's /order line — tests
// typed by code, name or a word labs use — and the six asked for most as ticks; the tubes they need show as they are chosen; who asked
// folded and optional. Start hands back the tests, as every bench's step does (core bench/WhatFor.tsx).
import { useState } from 'react'
import { useDepartment } from '@core/hooks/organization'
import { benchOffers, type WhatForProps } from '@core/screens/bench/WhatFor'
import { startWords } from '@core/screens/bench/walkins'
import { Button, Callout, Chip, Input, Kbd, errorText } from '@core/ui'
import { MOST_ASKED, testsIn, tubesFor } from './tubes'
import { Cap } from './Cap'

export function OrderStep({ bench, busy, error, onStart, note, extra, start: startLabel }: WhatForProps) {
  const { org } = useDepartment(); const tests = benchOffers(org, bench.id)
  const [line, setLine] = useState('/order '); const [ticked, setTicked] = useState<string[]>([]); const [asked, setAsked] = useState<string | null>(null)
  const typed = testsIn(line, tests)
  const chosen = [...typed.found, ...tests.filter((t) => ticked.includes(t.id) && !typed.found.includes(t))]
  const most = MOST_ASKED.map((c) => tests.find((t) => t.code === c)).filter((t): t is NonNullable<typeof t> => !!t)
  const tubes = tubesFor(chosen.map((t) => ({ ...t, section_name: t.section_name })))
  const start = () => { if (chosen.length && !busy) onStart(chosen, asked?.trim() || undefined) }
  return <div className="grid gap-2" onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); start() } }}>
    <Input autoFocus value={line} onChange={(e) => setLine(e.target.value)} aria-label="The tests, as the doctor would type them" className="font-mono" />
    {typed.unknown.length > 0 && <p className="text-12 text-warn">Not a test here: {typed.unknown.join(', ')}</p>}
    <div className="flex flex-wrap items-center gap-1.5"><span className="text-12 text-faint">Asked for most:</span>
      {most.map((t) => { const on = chosen.includes(t)
        return <Chip key={t.id} variant="check" on={on} onClick={() => typed.found.includes(t) ? undefined : setTicked((x) => on ? x.filter((y) => y !== t.id) : [...x, t.id])}>{t.name}</Chip> })}</div>
    {tubes.length > 0 && <p className="flex flex-wrap items-center gap-1.5 text-12 text-muted">{tubes.length} {tubes.length === 1 ? 'tube' : 'tubes'} ·
      {tubes.map(({ tube }) => <span key={tube.cap} className="inline-flex items-center gap-1"><Cap cap={tube.cap} />{tube.word.split(' · ')[0].toLowerCase()}</span>)}</p>}
    {extra?.(chosen)}
    {asked === null ? <button type="button" onClick={() => setAsked('')} className="justify-self-start rounded-sm text-13 text-accent hover:underline focus-ring">+ Who asked (optional)</button>
      : <div className="flex flex-wrap items-center gap-2"><span className="text-13 text-muted">Asked by</span>
          <Input value={asked} onChange={(e) => setAsked(e.target.value)} placeholder="The outside doctor" className="w-full sm:w-72" /><span className="text-12 text-faint">optional</span></div>}
    {!!error && <Callout tone="danger" title="Not started">{errorText(error)}</Callout>}
    <div className="flex flex-wrap items-center gap-2"><Button onClick={start} disabled={!chosen.length} loading={busy}>
      {startLabel?.(chosen) ?? (chosen.length > 1 ? `Start · ${chosen.length} tests` : startWords(chosen.map((t) => t.name)))}<Kbd className="ms-1 max-sm:hidden">⌘↵</Kbd></Button>
      {note && <span className="text-12 text-faint">{note}</span>}</div>
  </div>
}
