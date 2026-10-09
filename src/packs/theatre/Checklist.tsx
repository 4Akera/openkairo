// The WHO safety checklist for surgery on a case (spec/openCare.md §5.7, Q44; the picture #theatre-checklist): Sign in, Time out and Sign
// out, each the theatre pack's own entry signed by who said it when it is said (a part signed moves the case on: Sign in → the anaesthetic,
// Time out → operating). An item not done says why; nothing waits for it. Sign out counts swabs, needles and instruments (a count that
// does not add up is a notice for the surgeon, never a stop), keeps the implants with their lot, and sends the specimen as a /lab order
// to the Laboratory's histopathology, signed in the same set.
import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useDepartment } from '@core/hooks/organization'
import { refresh } from '@core/hooks/writes'
import { answerEntry, newId, oneSet } from '@core/db/entries'
import { write, type EntryIn } from '@core/db/rpc'
import type { Department } from '@core/db/types'
import { Button, Card, Chip, Input, Kbd, ScreenFrame, Tag, cn, errorText, hm } from '@core/ui'
import { PARTS, STEP_OF_PART, STEP_WORD, WHO_ITEMS, countOff, SIDE_WORD, type Count, type Part, type StepKey } from './model'
import type { Case } from './List'

const faint = 'text-12 text-faint'
type Said = { done: boolean; not: string; who: string }
const COUNTS = ['Swabs', 'Needles', 'Instruments']

export function Checklist({ dept, x, usual, onClose }: { dept: Department; x: Case; usual: number; onClose: () => void }) {
  const { org } = useDepartment(); const qc = useQueryClient()
  const me = org?.me.name ?? ''
  const signedPart = (p: Part) => x.about.checks.get(p)
  const current = PARTS.find(([p]) => !signedPart(p) && !x.parts.has(p))?.[0] ?? null
  const whoFor = (w: string) => w === 'surgeon' ? x.c?.surgeon ?? '' : w === 'anaesthetist' ? x.about.anaesthetist ?? '' : w === 'all' ? 'all three' : me
  const [said, setSaid] = useState<Record<string, Said>>({})
  const [counts, setCounts] = useState<Count[]>(COUNTS.map((what) => ({ what })))
  const [specimen, setSpecimen] = useState(''); const [implant, setImplant] = useState({ what: '', lot: '', left_in: '', used: '' })
  const [by, setBy] = useState<string[]>([me]); const [busy, setBusy] = useState(false); const [err, setErr] = useState<string | null>(null)
  const histo = org?.services.find((s) => /histo/i.test(s.code) || /histopath/i.test(s.name))
  const team = [...new Set([me, x.c?.surgeon, x.about.anaesthetist].filter((n): n is string => !!n))]
  const st = (x.slot?.step ?? null) as StepKey | null

  async function sign(part: Part) {
    setBusy(true); setErr(null)
    try {
      const items = WHO_ITEMS[part].map((i) => { const s = said[`${part}.${i.key}`] ?? { done: true, not: '', who: whoFor(i.who) }
        return { key: i.key, text: i.text, done: s.done, ...(s.who ? { who: s.who } : {}), ...(!s.done && s.not ? { not: s.not } : {}) } })
      const data: Record<string, unknown> = { op: x.r.item, part, items, by }
      const es: EntryIn[] = []
      if (part === 'sign_out') {
        const cs = counts.filter((c) => c.before != null || c.after != null).map((c) => ({ what: c.what, ...(c.before != null ? { before: c.before } : {}), ...(c.added != null ? { added: c.added } : {}), ...(c.after != null ? { after: c.after } : {}) }))
        if (cs.length) data.counts = cs
        if (implant.what.trim()) data.implants = [{ what: implant.what.trim(), ...(implant.lot ? { lot: implant.lot } : {}), ...(implant.left_in ? { left_in: Number(implant.left_in) } : {}), ...(implant.used ? { used: Number(implant.used) } : {}) }]
        if (specimen.trim()) {
          data.specimen = specimen.trim()
          if (histo?.department_id) es.push({ id: newId(), type: 'order', patient_id: x.r.patient.id, department_id: dept.id, data: { service: { id: histo.id, code: histo.code, name: histo.name },
            department_id: histo.department_id, priority: 'routine', status: 'active', question: `${specimen.trim()} · ${x.c?.name ?? x.r.service_name ?? 'operation'}` } } as EntryIn)
        }
      }
      es.unshift({ id: newId(), type: 'theatre.check', patient_id: x.r.patient.id, department_id: dept.id, refers_to: x.r.order.latest_entry, relation: "about", data } as unknown as EntryIn)
      const to = STEP_OF_PART[part]
      if (to && x.slot) es.push(answerEntry(x.r, dept.id, { type: 'theatre.step', data: { status: 'in-progress', step: to,
        theatre: { op: x.r.item, ...(x.slot.room ? { room: x.slot.room } : {}), ...(x.slot.starts ? { starts: new Date(x.slot.starts).toISOString() } : {}), position: x.slot.position ?? 0 } } } as never))
      await write(oneSet(es)); refresh(qc); await qc.invalidateQueries({ queryKey: ['theatre.checks'] }); await qc.invalidateQueries({ queryKey: ['theatre.about'] }); onClose()
    } catch (e) { setErr(errorText(e)) } finally { setBusy(false) }
  }

  const part = ([p, title, when]: typeof PARTS[number]) => {
    const done = signedPart(p); const now = current === p
    const items = done ? ((done.data?.items ?? []) as { key: string; text: string; done: boolean; who?: string; not?: string }[]) : WHO_ITEMS[p].map((i) => {
      const s = said[`${p}.${i.key}`] ?? { done: true, not: '', who: whoFor(i.who) }; return { key: i.key, text: i.text, done: s.done, who: s.who, not: s.not } })
    const set = (k: string, patch: Partial<Said>) => setSaid((m) => ({ ...m, [`${p}.${k}`]: { ...(m[`${p}.${k}`] ?? { done: true, not: '', who: whoFor(WHO_ITEMS[p].find((i) => i.key === k)!.who) }), ...patch } }))
    return <Card key={p} className={cn('grid content-start gap-2 p-3', now && 'ring-1 ring-accent-line')}>
      <p className="flex flex-wrap items-baseline gap-2"><b className="text-14 font-semibold text-fg">{title}</b><span className={faint}>{when}{done ? ` · ${hm(done.occurred_at)}` : now ? ' · now' : ''}</span></p>
      <ul className="grid gap-1.5">{items.map((i) => <li key={i.key} className="grid grid-cols-[1.25rem_minmax(0,1fr)] gap-1.5 text-13">
        {now ? <button type="button" aria-label={i.done ? 'Said' : 'Not done'} onClick={() => set(i.key, { done: !i.done })} className={cn('rounded-sm focus-ring', i.done ? 'text-ok' : 'text-warn')}>{i.done ? '✓' : '✕'}</button>
          : <span aria-hidden className={i.done ? 'text-ok' : 'text-warn'}>{done ? (i.done ? '✓' : '✕') : '·'}</span>}
        <span><span className="text-fg">{i.text}</span>
          {!i.done && (now ? <Input aria-label="Why not" value={i.not ?? ''} onChange={(e) => set(i.key, { not: e.target.value })} placeholder="not done · why" className="mt-1 h-7 text-12" />
            : <span className="block text-12 text-warn">not done · {i.not}</span>)}
          <span className="block text-11 text-faint">{i.who}</span></span></li>)}</ul>
      {now && p === 'sign_out' && <>
        <table className="w-full text-13"><thead><tr className="text-11 uppercase tracking-[0.06em] text-faint">{['Count', 'Before', 'Added', 'After'].map((h) => <th key={h} className="py-1 text-start font-semibold">{h}</th>)}</tr></thead>
          <tbody>{counts.map((c, k) => <tr key={c.what} className="border-t border-line"><td className="py-1 text-fg">{c.what}</td>
            {(['before', 'added', 'after'] as const).map((f) => <td key={f} className="py-1 pe-1"><Input aria-label={`${c.what} ${f}`} inputMode="numeric" value={c[f] ?? ''} className={cn('h-7 w-14 text-13 tnum', f === 'after' && countOff(c) && 'border-warn')}
              onChange={(e) => setCounts((cs) => cs.map((y, j) => j === k ? { ...y, [f]: e.target.value === '' ? undefined : Number(e.target.value) } : y))} /></td>)}</tr>)}</tbody></table>
        {counts.some(countOff) && <p className="text-12 font-medium text-warn">A count does not add up: tell the surgeon. A notice, never a stop.</p>}
        <label className="grid gap-0.5 text-13"><span className={faint}>Specimen</span><span className="flex flex-wrap items-center gap-1.5"><Input value={specimen} onChange={(e) => setSpecimen(e.target.value)} placeholder="gallbladder, in formalin" className="h-7 max-w-xs text-13" />
          {specimen.trim() && (histo ? <Tag tone="accent">/lab {histo.code} → Laboratory</Tag> : <Tag tone="warn">no histopathology service here</Tag>)}</span></label>
        <div className="grid gap-0.5 text-13"><span className={faint}>Implants</span><span className="flex flex-wrap items-center gap-1.5">
          <Input aria-label="Implant" value={implant.what} onChange={(e) => setImplant({ ...implant, what: e.target.value })} placeholder="titanium clips ML" className="h-7 w-40 text-13" />
          <Input aria-label="Lot" value={implant.lot} onChange={(e) => setImplant({ ...implant, lot: e.target.value })} placeholder="lot" className="h-7 w-24 text-13" />
          <Input aria-label="Left in" value={implant.left_in} onChange={(e) => setImplant({ ...implant, left_in: e.target.value })} placeholder="left in" className="h-7 w-16 text-13" />
          <Input aria-label="Used" value={implant.used} onChange={(e) => setImplant({ ...implant, used: e.target.value })} placeholder="used" className="h-7 w-16 text-13" /></span></div></>}
      {done && p === 'sign_out' && <>
        {((done.data?.counts ?? []) as Count[]).length > 0 && <p className="text-13 text-fg">{((done.data!.counts) as Count[]).map((c) => `${c.what} ${c.after ?? '?'}${countOff(c) ? ' ✕' : ' ✓'}`).join(' · ')}</p>}
        {typeof done.data?.specimen === 'string' && <p className="text-13 text-fg">Specimen: {String(done.data.specimen)}</p>}
        {((done.data?.implants ?? []) as { what: string; lot?: string; left_in?: number }[]).map((i) => <p key={i.what} className="text-13 text-fg">Implants: {i.what}{i.left_in != null ? ` · ${i.left_in} left in` : ''}{i.lot ? ` · lot ${i.lot}` : ''}</p>)}</>}
      {done ? <p className="border-t border-line pt-2 text-12 text-muted">Signed {hm(done.occurred_at)} · {((done.data?.by ?? []) as string[]).join(', ')}</p>
        : now ? <div className="grid gap-2 border-t border-line pt-2"><span className="flex flex-wrap items-center gap-1.5 text-12 text-muted">Said by {team.map((n) => <Chip key={n} on={by.includes(n)} onClick={() => setBy((b) => b.includes(n) ? b.filter((y) => y !== n) : [...b, n])}>{n}</Chip>)}</span>
          <span className="flex items-center gap-2"><Button size="sm" disabled={busy || !by.length} onClick={() => void sign(p)}>{title}<Kbd className="ms-1">⌘↵</Kbd></Button><span className={faint}>by those who said it</span></span></div>
        : <p className="border-t border-line pt-2 text-12 text-faint">After {PARTS[PARTS.findIndex(([k]) => k === p) - 1]?.[1] ?? 'arrival'}</p>}
    </Card>
  }
  return <ScreenFrame notice={err && <p className="text-14 text-danger">{err}</p>} action={<Button size="sm" variant="ghost" onClick={onClose}>← The list</Button>}>
    <Card className="flex flex-wrap items-center gap-x-4 gap-y-2 p-3">
      <span className="text-18 font-semibold text-fg">{x.r.patient.given_name} {x.r.patient.family_name}</span><span className="text-13 text-muted tnum">#{x.r.patient.record_number}</span>
      <span className="text-14 text-fg">{x.c?.name ?? x.r.service_name}</span>{SIDE_WORD(x.c?.side) ? <Tag tone="accent">{x.c!.side}</Tag> : <Tag>no side</Tag>}
      <span className="text-13 text-muted">{x.slot?.room ?? 'no room yet'}{x.slot?.starts ? ` · ${hm(x.slot.starts)}` : ''} · usual {usual} min</span>
      {st && <Tag tone="info" className="ms-auto">{STEP_WORD[st]}</Tag>}</Card>
    <div className="grid gap-3 lg:grid-cols-3">{PARTS.map(part)}</div>
    <p className="text-12 text-faint">Each part is the theatre pack's own entry, signed by who said it, when it is said. The specimen is a /lab order to the Laboratory's histopathology, signed with Sign out; the implants and their lot are kept here and the operation note reads them. A part not done says why; nothing waits for it. The items are WHO's 2009 list.</p>
  </ScreenFrame>
}
