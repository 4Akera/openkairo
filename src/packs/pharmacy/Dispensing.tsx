// Dispensing (pharmacy.dispensing, spec/openCare.md §5.1 rule 4, §5.3): the pharmacy's one screen for the work sent to it, in place of
// the bench, in the kit's frame. It lists every request sent here, as the bench did, so nothing sent to the department is on no screen.
// Its views are counted filters: To give (nobody has started), Prepared (only where the pharmacy prepares first: counted out, not
// given yet), Owed (given in part: the rest to come back for), Given today. A row is one patient, with marks for what needs the
// pharmacist (an allergy or a duplicate the prescriber was warned of, a child); a row with nothing to check gives in one click (Give
// all), one with a mark opens the check (Check). Folded out, each order's check (Check.tsx), the counselling note, who it is given
// to, and Give. A request the pack does not answer (a result, a note) goes to the bench's patient page (Answer). Keys as on the
// bench: / or typing goes to the box, ↑↓ move, ↵ folds the row out under itself, Esc folds it, then clears the box. Its settings
// (settings.ts): Prepare first; a prepared row waiting past the pharmacy's limit reads late; the clinic's counselling note.
// What a pack that charges reads (spec §5.4), never named here: each row hands its priced lines (pricing.ts: the product's price per box
// and per strip) — what each order comes to so far: what was given of it already, each dispense counted apart, and what is to give now
// (as written, or as checked in the open fold) — for a pack's row action (Pay, Send to cashier) folded out under the row; Given today's
// rows hand what was given, so a medicine given before it was paid or sent is still handed there; where a pack used here charges, the
// fold shows each medicine's price and the total, and Prices sets them. A pack may hold an order waiting (a soft check): it leaves To
// give for its word's view, where Give is greyed (Not given, a stop, still works) and Give anyway… asks why.
import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useDepartment } from '@core/hooks/organization'
import { useRequestQueue } from '@core/hooks/reads'
import { refresh } from '@core/hooks/writes'
import { answerEntry, oneSet, stepEntry } from '@core/db/entries'
import { read, write, type EntryIn } from '@core/db/rpc'
import type { RecentRow, RequestQueueRow, TableRead } from '@core/db/types'
import { replyFormFor } from '@core/renderers'
import type { ScreenProps } from '@core/screens/registry'
import { ageOf, ageSex, groupByPatient, matches, nextSteps, phaseOf, stepName, testsLine, type PatientGroup } from '@core/screens/bench/shared'
import { Button, Callout, Card, Chip, Empty, Input, ListRow, NotForRole, ScreenFrame, Spinner, Tag, errorText, hm, minutesSince, type RowMark, type ScreenView } from '@core/ui'
import { benchMarkRow } from '@core/screens/marks'
import { byWord, chargesHere, dueTotal, packRowOf, type DueLine } from '@core/screens/rows'
import { usePackRows } from '@core/screens/useRows'
import { orderLines, productsOf, type Given } from './pricing'
import { Prices } from './Prices'
import { counselling, keepStock, lateAfter, lateBy, prepareFirst, preparedSince } from './settings'
import { detailsOf, fullAmount, type Dispense } from './Check'
import { batchFor, pickProduct, type Product } from './shelf'
import { useStock } from './Stock'

type View = 'give' | 'prepared' | 'owed' | 'done' | `wait:${string}`
type State = 'to_prepare' | 'prepared' | 'owed'
/** where a request stands here: the pack's own table says (to prepare, prepared, owed); before it has caught up, its step does */
const stateOf = (r: RequestQueueRow): State => { const s = detailsOf(r).status
  return s === 'owed' || s === 'prepared' || s === 'to_prepare' ? s : phaseOf(r.request?.step) === 'todo' ? 'to_prepare' : 'prepared' }
/** a row's marks: an allergy or a duplicate the prescriber was warned of, a child (doses by weight), prepared but shown to give */
function marksOf(g: PatientGroup, prepared: boolean): RowMark[] {
  const ws = g.rows.flatMap((r) => detailsOf(r).warnings ?? []); const age = ageOf(g.patient.born_on)
  return [...(ws.some((w) => w.code.startsWith('allergy')) ? [{ key: 'allergy', word: 'allergy', tone: 'danger' as const }] : []),
    ...(ws.some((w) => w.code.startsWith('duplicate')) ? [{ key: 'dup', word: 'duplicate', tone: 'warn' as const }] : []),
    ...(age < 12 ? [{ key: 'child', word: `child · ${age} y`, tone: 'info' as const }] : []),
    ...(g.rows.some((r) => detailsOf(r).question && !detailsOf(r).question?.answer) ? [{ key: 'asked', word: 'asked the doctor', tone: 'info' as const }] : []),
    ...(g.rows.some((r) => detailsOf(r).question?.answer) ? [{ key: 'answered', word: 'doctor answered', tone: 'ok' as const }] : []),
    ...(prepared ? [{ key: 'prep', word: 'prepared' }] : [])]
}
const checkable = (g: PatientGroup) => g.rows.some((r) => (detailsOf(r).warnings ?? []).length > 0)

export function Dispensing({ dept }: ScreenProps) {
  const q = useRequestQueue(dept.id); const qc = useQueryClient(); const navigate = useNavigate(); const { org, can } = useDepartment()
  const [chosen, setView] = useState<View>('give'); const [find, setFind] = useState(''); const [open, setOpen] = useState<string | null>(null)
  const [values, setValues] = useState<Record<string, Dispense>>({}); const [to, setTo] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null); const [error, setError] = useState<string | null>(null)
  const [cursor, setCursor] = useState(0); const [arrows, setArrows] = useState(false)    // arrows: the keys moved the cursor (shown as a bar)
  const [pricing, setPricing] = useState(false)
  const box = useRef<HTMLInputElement>(null); const list = useRef<HTMLUListElement>(null)
  const f = find.trim().toLowerCase()
  const prep = prepareFirst(org, dept.id); const keep = keepStock(org, dept.id)
  const stock = useStock(dept.id, null, keep); const products: Product[] = stock.data?.products ?? []
  /** with stock kept: the product a give takes from (the brand given, if on the list) and its first-to-expire batch with enough */
  const fromStock = (r: RequestQueueRow, v: Dispense): Partial<Dispense> => {
    if (!keep || v.product_id) return {}
    const p = pickProduct(products, v.drug || detailsOf(r).drug?.name || ''); if (!p) return {}
    const units = v.quantity === undefined ? fullAmount(detailsOf(r)).value : Number(v.quantity)
    return { product_id: p.id, ...(v.drug ? {} : { drug: p.brand }), ...(batchFor(p, units) ? { batch: batchFor(p, units)!.batch } : {}) }
  }
  // every request sent here, the bench's whole work: the pack's form answers its own, the bench's page the rest
  const rows = useMemo(() => q.data?.requests ?? [], [q.data])
  // the priced lines of each order so far: what was given of it already (each dispense apart), and what is to give now (as written, or
  // as checked in the open fold), each in its product's own units
  const charges = chargesHere(dept); const priced = productsOf(org)
  const linesOf = (rs: RequestQueueRow[], checked: boolean): DueLine[] => rs.flatMap((r) => {
    if (!replyFormFor(r.reply_type)) return []
    const v: Dispense = (checked ? values[r.order.item] : undefined) ?? { given: true, reason: '' }; const drug = v.drug || detailsOf(r).drug?.name
    return orderLines(priced, detailsOf(r).given ?? [], v.given && drug ? { drug, units: v.quantity === undefined ? fullAmount(detailsOf(r)).value : Number(v.quantity),
      product: v.product_id ?? fromStock(r, v).product_id } : null, r.order.item) })
  // Given today's rows: what was given (the pack's own table; read only where a pack used here charges)
  const done = (q.data?.recent ?? []).filter((r) => matches(r.patient, f))
  const recent = (q.data?.recent ?? []).filter((r) => !!replyFormFor(r.reply_type)).map((r) => r.order.item).sort()
  const gave = useQuery({ queryKey: ['pharmacy.given', dept.id, recent], enabled: charges && recent.length > 0 && can('read:pharmacy.queue'), placeholderData: (p) => p,
    queryFn: async () => new Map((await read<TableRead<{ item: string; given?: Given[] }>>({ shape: 'table', table: 'pharmacy.queue', department_id: dept.id,
      where: { item: recent }, entries: false })).rows.map((x) => [x.item, x.given ?? []])) })
  const doneRow = (r: RecentRow) => packRowOf(`done ${r.id}`, benchMarkRow({ patient: r.patient, rows: [r] }),
    replyFormFor(r.reply_type) ? orderLines(priced, gave.data?.get(r.order.item) ?? [], null, r.order.item) : undefined)
  // the list's rows hand their lines as written too, so a soft check may hold an order on the lines it hands (Pay first on the pharmacy's
  // own priced work, spec §5.4); Given today's rows are read with them, so what a pack that charges holds of their orders is known
  const packs = usePackRows('screen', [...groupByPatient(rows).map((g) => packRowOf(g.patient.id, benchMarkRow(g), linesOf(g.rows, false))),
    ...(q.data?.recent ?? []).map(doneRow)], dept)
  const free = (r: RequestQueueRow) => packs.isFree(r.order.item)
  const of = (states: State[]) => groupByPatient(rows.filter((r) => free(r) && states.includes(stateOf(r)))).filter((g) => matches(g.patient, f))
  const held = byWord(rows, packs.waits, packs.ahead).map((w) => ({ id: `wait:${w.word}` as const, word: w.word, groups: groupByPatient(w.rows).filter((g) => matches(g.patient, f)) }))
  const view: View = chosen.startsWith('wait:') && !held.some((h) => h.id === chosen) ? 'give' : chosen   // a word's view goes once nothing waits with it
  const give = of(prep ? ['to_prepare'] : ['to_prepare', 'prepared']); const prepared = prep ? of(['prepared']) : []; const owed = of(['owed'])
  // waiting past this pharmacy's limit: late (Prepared counts in warn while any is)
  const limit = lateAfter(org, dept.id); const note = counselling(org)
  const late = (g: PatientGroup) => lateBy(preparedSince(g.rows), limit)
  const views: ScreenView<View>[] = [{ id: 'give', label: 'To give', count: give.length, needs: 'warn' },
    ...(prep ? [{ id: 'prepared' as const, label: 'Prepared', count: prepared.length, needs: prepared.some((g) => late(g) !== null) ? 'warn' as const : undefined }] : []),
    { id: 'owed', label: 'Owed', count: owed.length }, ...held.map((h) => ({ id: h.id, label: h.word, count: h.groups.length, needs: 'warn' as const })),
    { id: 'done', label: 'Given today', count: done.length }]
  const groups = view === 'give' ? give : view === 'prepared' ? prepared : view === 'owed' ? owed : held.find((h) => h.id === view)?.groups ?? []
  const n = view === 'done' ? done.length : groups.length
  const c = Math.min(cursor, Math.max(0, n - 1))

  // one set for the patient; the row closes and the lists are read again
  const land = async (patient: string, items: EntryIn[]) => {
    if (!items.length) return
    setBusy(patient); setError(null)
    try { await write(oneSet(items)); setOpen(null); setValues({}); setTo(null); refresh(qc); void qc.invalidateQueries({ queryKey: ['pharmacy.stock', dept.id] }) }
    catch (x) { setError(errorText(x)) } finally { setBusy(null) }
  }
  const formOf = (r: RequestQueueRow) => { const pf = replyFormFor(r.reply_type); return pf && can(pf.action) ? pf : undefined }
  /** each order its form gives as it stands (value undefined: as written), or as checked in the fold, given to whom it was; an order a
   *  pack holds waiting only as not given (a stop is never greyed) */
  const answers = (g: PatientGroup, checked: boolean) => g.rows.flatMap((r) => {
    const v: Dispense = checked ? { ...(values[r.order.item] ?? { given: true, reason: '' }), ...(to?.trim() ? { to: to.trim() } : {}) } : { given: true, reason: '' }
    if (!free(r) && v.given) return []
    const w = formOf(r)?.toWrite(r, { ...v, ...fromStock(r, v) })
    return w ? [answerEntry(r, dept.id, w)] : [] })
  const toggle = (pid: string) => { setOpen(open === pid ? null : pid); setError(null); setTo(null) }
  const pick = (v: View) => { setView(v); setOpen(null); setCursor(0); box.current?.focus() }
  // ↵ folds out the row under the cursor; with a search typed, the first match in any list
  const enter = () => {
    const g = groups[c] ?? (f ? [...give, ...prepared, ...owed, ...held.flatMap((h) => h.groups)][0] : undefined); if (!g) return
    if (!groups.includes(g)) setView(give.includes(g) ? 'give' : prepared.includes(g) ? 'prepared' : owed.includes(g) ? 'owed' : held.find((h) => h.groups.includes(g))?.id ?? 'give')
    toggle(g.patient.id)
  }
  const onKey = (e: { key: string; preventDefault: () => void }) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setArrows(true); setCursor(Math.max(0, Math.min(c + 1, n - 1))) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setArrows(true); setCursor(Math.max(c - 1, 0)) }
    else if (e.key === 'Enter') { e.preventDefault(); enter() }
    else if (e.key === 'Escape') { if (open) setOpen(null); else { setFind(''); setCursor(0) } }
  }
  // typing anywhere goes to the box; / jumps there; ↑↓ ↵ Esc work with nothing focused
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement
      if (/INPUT|TEXTAREA|SELECT/.test(t.tagName) || t.isContentEditable || e.metaKey || e.ctrlKey || e.altKey) return
      if (e.key === '/') { e.preventDefault(); box.current?.focus() }
      else if (e.key.length === 1 && e.key !== ' ') box.current?.focus()
      else if (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Escape' || (e.key === 'Enter' && t === document.body)) onKey(e)
    }
    window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k)
  })
  useEffect(() => { list.current?.querySelector('.dispense-cursor')?.scrollIntoView({ block: 'nearest' }) }, [c, view])

  const row = (g: PatientGroup, i: number) => {
    const isOpen = open === g.patient.id; const waiting = g.rows.filter((r) => !free(r)); const check = checkable(g) || view === 'owed' || waiting.length > 0
    const quick = check ? [] : answers(g, false); const waited = view === 'prepared' ? late(g) : null
    const steps = view === 'give' && prep ? nextSteps(g.rows.filter((r) => stateOf(r) === 'to_prepare'), org, can) : []
    const lines = linesOf(g.rows, isOpen); const pr = packRowOf(`${view} ${g.patient.id}`, benchMarkRow(g), lines)
    const word = waiting.length ? packs.waits.get(waiting[0].order.item)?.word : undefined
    const others = g.rows.filter((r) => !replyFormFor(r.reply_type))    // answered with a result or a note, on the bench's page
    const answer = others.length > 0 && <Button size="sm" variant="outline" onClick={() => navigate(`/bench/${g.patient.id}`)}>Answer{others.length > 1 ? ` ${others.length}` : ''}</Button>
    const mine = g.rows.filter((r) => replyFormFor(r.reply_type)); const ready = isOpen ? answers(g, true) : []
    const owedLine = view === 'owed' ? g.rows.map((r) => `${detailsOf(r).drug?.name ?? r.service_name}: ${detailsOf(r).owed ?? ''}`).join(', ') : null
    return [<ListRow key={g.patient.id} number={g.patient.record_number} name={`${g.patient.given_name} ${g.patient.family_name}`} age={ageSex(g.patient)}
      selected={isOpen || (i === c && arrows)} enter={i === c && !arrows && !!f} className={i === c ? 'dispense-cursor' : undefined}
      status={<>{g.priority !== 'routine' && <Tag tone="danger">{g.priority}</Tag>}{waited !== null && <Tag tone="warn" title={`Prepared ${waited} min ago; late after ${limit} min`}>late · {waited} min</Tag>}
        <span className="truncate">{owedLine ? `owes ${owedLine}` : testsLine(g.rows)}</span></>}
      marks={[...marksOf(g, !prep && g.rows.some((r) => stateOf(r) === 'prepared')), ...packs.marks(pr)]} extra={packs.buttons(pr)} below={packs.below(pr)}
      minutes={g.since ? minutesSince(g.since) : null} onOpen={() => toggle(g.patient.id)}
      actions={<>{steps.map((s) => <Button key={`${s.type} ${s.key}`} size="sm" variant="outline" disabled={busy === g.patient.id}
          onClick={() => void land(g.patient.id, s.rows.map((r) => stepEntry(r, dept.id, 'in-progress', undefined, s.key, s.type)))}>{stepName(s.key)}{s.rows.length > 1 ? ` ${s.rows.length}` : ''}</Button>)}
        {answer}
        {check && mine.length > 0 && <Button size="sm" variant="outline" aria-expanded={isOpen} onClick={() => toggle(g.patient.id)}>{view === 'owed' ? 'Give the rest' : 'Check'}</Button>}
        {quick.length > 0 && <Button size="sm" loading={busy === g.patient.id && !isOpen} onClick={() => void land(g.patient.id, quick)}>Give all{quick.length > 1 ? ` ${quick.length}` : ''}</Button>}
        {waiting.length > 0 && <Button size="sm" disabled title={word}>Give all</Button>}
        {waiting.length > 0 && mine.some((r) => formOf(r)) && packs.anyway(pr, waiting.map((r) => r.order.item), 'Give')}</>} />,
      isOpen && <li key={`${g.patient.id} fold`} className="grid gap-3 border-t border-line bg-sunken p-3">
        {mine.map((r) => { const F = formOf(r)?.Editor
          return F ? <F key={r.order.item} request={r} value={values[r.order.item] as never} onChange={(v: unknown) => setValues((x) => ({ ...x, [r.order.item]: v as Dispense }))} />
            : <NotForRole key={r.order.item} size="sm">{r.display_line} — not for your role here.</NotForRole> })}
        {note && mine.length > 0 && <Callout tone="info" title="Counselling">{note}</Callout>}
        {others.length > 0 && <div className="flex flex-wrap items-center gap-2 text-14 text-muted"><span>{others.map((r) => r.service_name ?? r.display_line).join(', ')}: answered on the patient's page</span>{answer}</div>}
        {mine.length > 0 && <div className="flex flex-wrap items-center gap-2 border-t border-line pt-3">
          <span className="text-13 text-muted">Given to</span>
          <Chip on={to === null} onClick={() => setTo(null)}>{g.patient.given_name} · the patient</Chip>
          <Chip on={to !== null} onClick={() => setTo(to ?? '')}>A relative…</Chip>
          {to !== null && <Input dense autoFocus value={to} onChange={(e) => setTo(e.target.value)} placeholder="Name and relation" className="w-56" />}
          <span className="ms-auto flex items-center gap-2">{ready.length < mine.length && <span className="text-12 text-faint">{mine.length - ready.length} not ready: {waiting.length ? `${word ?? 'waiting'}, or ` : ''}a warning without a reason, or nothing to give</span>}
            {charges && lines.length > 0 && <span className="text-13 text-muted">Total <b className="font-semibold text-fg tnum">{dueTotal(lines)}</b></span>}
            <Button size="sm" variant="ghost" onClick={() => setOpen(null)}>Close</Button>
            <Button size="sm" loading={busy === g.patient.id} disabled={!ready.length} onClick={() => void land(g.patient.id, ready)}>Give{ready.length > 1 ? ` ${ready.length}` : ''}</Button></span>
        </div>}
      </li>]
  }
  const search = <Input ref={box} autoFocus value={find} onChange={(e) => { setFind(e.target.value); setCursor(0); setArrows(false) }} onKeyDown={onKey}
    placeholder="Record number or name" aria-label="Find a patient — ↑↓ move · ↵ open · Esc clear" className="w-full sm:w-72" />
  // where a pack used here charges: the prices of the clinic's products, set here by whoever keeps the products (no Keep stock needed)
  const prices = charges && can('write:pharmacy.stock') && <Button size="sm" variant="ghost" aria-expanded={pricing} onClick={() => setPricing(!pricing)}>Prices</Button>
  return <ScreenFrame views={views} view={view} onView={pick} search={search} action={prices}
    notice={error && <Callout tone="danger" title="Not given">{error}</Callout>}>
    {pricing && charges && <Prices org={org} onClose={() => setPricing(false)} />}
    {q.isLoading ? <Spinner label="Loading prescriptions" /> : <Card><ul ref={list}>
      {view !== 'done' ? (groups.length ? groups.flatMap(row) : <li><Empty>{f ? 'No match here.' : view === 'give' ? 'Nothing to give.' : view === 'owed' ? 'Nobody is owed anything.' : 'Nothing prepared.'}</Empty></li>)
        : done.length ? done.map((r, i) => { const pr = doneRow(r)
          return <ListRow key={r.id} number={r.patient.record_number} name={`${r.patient.given_name} ${r.patient.family_name}`} age={ageSex(r.patient)}
            selected={i === c && arrows} className={i === c ? 'dispense-cursor' : undefined} extra={packs.buttons(pr)} below={packs.below(pr)}
            status={<>{r.request?.status === 'cancelled' && <Tag tone="warn">{r.reply_type === 'pharmacy.dispense' ? 'not given' : 'not done'}</Tag>}<span className="truncate">{r.request?.reply_line ?? r.service_name}</span></>}
            actions={<><span className="tnum">{r.reply?.author_name}{r.reply && ` · ${hm(r.reply.recorded_at)}`}</span>
              <Button size="sm" variant="outline" disabled={!r.reply} onClick={() => navigate(`/bench/correct/${r.id}`)}>Correct</Button></>} /> })
        : <li><Empty>{f ? 'No match here.' : 'Nothing given in the last 24 hours.'}</Empty></li>}
    </ul></Card>}
  </ScreenFrame>
}
