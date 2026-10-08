// Scan (radiology.scan, spec/openCare.md §5.5; the pictures "the Scan list", "scanning", "scanning with contrast"): Radiology's first
// screen, in place of the bench, for the radiographer. One list for every room — stat first, then by waiting — with a kind chip that
// narrows it to one room's work; its views are counted filters: To scan, Scanned today, Couldn't scan. A row is one exam: the side, a
// ward bed (portable: go to them), a walk-in and who asked, contrast, pregnant to ask. Opened, the scan card: who (the name and the
// birth date, said aloud) and which side, big; pregnant asked at the door for a woman of 12–50 before an X-ray or a CT (kept in her
// record); before contrast the facts from the record (eGFR, metformin, allergies; under 30 the radiologist decides), fasting, the
// contrast given and any reaction (kept in the record as given, and as an allergy). Scanned in one key: the order waits for its report,
// or ends here when no report is asked (an X-ray reported only when asked: the doctor reads it). Couldn't scan, with why.
import { useMemo, useState, type ReactNode } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Plus } from 'lucide-react'
import { useDepartment } from '@core/hooks/organization'
import { useRecord, useRequestQueue } from '@core/hooks/reads'
import { useFacts } from '@core/hooks/chart'
import { refresh } from '@core/hooks/writes'
import { answerEntry, newId, oneSet, qty } from '@core/db/entries'
import { write, type EntryIn } from '@core/db/rpc'
import type { RequestQueueRow } from '@core/db/types'
import type { ScreenProps } from '@core/screens/registry'
import { ageOf, ageSex, groupByPatient, matches } from '@core/screens/bench/shared'
import { isWalkIn } from '@core/screens/bench/walkins'
import { WalkIn } from '@core/screens/bench/WalkIn'
import { benchMarkRow } from '@core/screens/marks'
import { packRowOf } from '@core/screens/rows'
import { usePackRows } from '@core/screens/useRows'
import { standingOf } from '@core/screens/visit/facts'
import { Button, Callout, Card, Chip, Empty, Input, Kbd, ListRow, ScreenFrame, Spinner, Tag, errorText, hm, longDate, minutesSince, ymd, type ScreenView } from '@core/ui'
import { IONIZING, KINDS, examOf, filmOnly, type Words } from './exams'
import { factsOf } from './facts'
import { FactsLine } from './order'
import { optionsOf } from './options'
import { useWords } from './requests'

type View = 'todo' | 'done' | 'not'
const REASONS = ['Refused', 'Pregnant', 'Not fasting', 'Left', 'Machine down']
const SIDE = 'rounded-sm bg-accent-soft px-1 text-11 font-semibold uppercase tracking-wide text-accent'
/** not scanned yet: nothing written on it (held too) */
const toScan = (r: RequestQueueRow) => !r.order.step_key && r.order.status !== 'cancelled'

export function Scan({ dept }: ScreenProps) {
  const q = useRequestQueue(dept.id); const qc = useQueryClient(); const { org, can } = useDepartment()
  const [view, setView] = useState<View>('todo'); const [kind, setKind] = useState<string | null>(null); const [find, setFind] = useState('')
  const [open, setOpen] = useState<string | null>(null); const [walkIn, setWalkIn] = useState(false); const [said, setSaid] = useState<string | null>(null)
  const f = find.trim().toLowerCase()
  const open_ = useMemo(() => q.data?.requests ?? [], [q.data]); const recent = useMemo(() => q.data?.recent ?? [], [q.data])
  const words = useWords(dept.id, [...open_, ...recent].map((r) => r.item))
  const wordsOf = (r: RequestQueueRow) => words.data?.get(r.item)
  // radiology's words on the orders as they stand now (not a previous list's while the new one loads): film only waits for them
  const wordsKnown = words.isSuccess && !words.isPlaceholderData
  // a row per exam; each its own pack row (a pack's button on it, Pay, is for that exam)
  const packs = usePackRows('screen', useMemo(() => open_.map((r) => packRowOf(r.item, benchMarkRow(groupByPatient([r])[0]))), [open_]), dept)
  const today = ymd(new Date().toISOString())
  const todo = order(open_.filter(toScan))
  // scanned today: waiting for the report, or done (reported, or film only)
  const scanned = [...open_.filter((r) => !toScan(r) && r.order.last_at && ymd(r.order.last_at) === today), ...recent.filter((r) => r.order.status === 'completed' && r.order.last_at && ymd(r.order.last_at) === today)]
  const couldnt = recent.filter((r) => r.order.status === 'cancelled')
  const lists: Record<View, RequestQueueRow[]> = { todo, done: scanned, not: couldnt }
  const kindOf = (r: RequestQueueRow) => r.section_name ?? 'Other'
  const shown = lists[view].filter((r) => (!kind || kindOf(r) === kind) && matches(r.patient, f))
  const views: ScreenView<View>[] = [{ id: 'todo', label: 'To scan', count: todo.length, needs: 'warn' }, { id: 'done', label: 'Scanned today', count: scanned.length },
    { id: 'not', label: "Couldn't scan", count: couldnt.length }]
  const kinds = [...KINDS, 'Other'].filter((k) => lists[view].some((r) => kindOf(r) === k))

  const row = (r: RequestQueueRow) => {
    const s = org?.services.find((x) => x.id === r.service_id); const e = s ? examOf(org, s) : null; const w = wordsOf(r); const isOpen = open === r.item
    const walk = isWalkIn(r.order, org?.allDepartments ?? []); const pr = packRowOf(r.item, benchMarkRow(groupByPatient([r])[0]))
    const woman = r.patient.sex === 'female' && ageOf(r.patient.born_on) >= 12 && ageOf(r.patient.born_on) <= 50
    // before an X-ray or a CT for a woman of 12–50: what is recorded is always shown; asking at the door is the department's switch
    const pregCheck = view === 'todo' && woman && IONIZING.includes(kindOf(r))
    const askPregnant = pregCheck && optionsOf(org, dept.id).ask_pregnant
    const ward = org?.allDepartments.find((d) => d.id === r.order.from_department_id)?.work === 'stays'
    const waits = !packs.isFree(r.order.item)
    return <ListRow key={r.item} number={r.patient.record_number} name={`${r.patient.given_name} ${r.patient.family_name}`} age={ageSex(r.patient)} selected={isOpen}
      onOpen={view === 'todo' && can('write:step') ? () => setOpen(isOpen ? null : r.item) : undefined}
      status={<>{r.request?.priority && r.request.priority !== 'routine' && <Tag tone="danger">{r.request.priority}</Tag>}
        {w?.portable && <Tag>portable</Tag>}{ward && !w?.portable && <Tag>at the ward</Tag>}{walk && <Tag tone="info">walk-in</Tag>}{view === 'done' && r.order.status === 'completed' && !r.reply && <Tag>film only</Tag>}
        {view === 'not' && <Tag tone="warn">not scanned</Tag>}
        <span className="truncate">{r.service_name ?? r.display_line}</span>{w?.side && <span className={SIDE}>{w.side}</span>}
        {e?.side && !w?.side && view === 'todo' && <Tag tone="warn">side not said</Tag>}
        {view === 'not' && r.step_data?.reason && <span className="truncate text-muted">· {r.step_data.reason}</span>}
        {askPregnant && <Tag tone="warn">ask pregnant</Tag>}{view === 'todo' && e?.contrast && <Tag tone="info">contrast</Tag>}</>}
      who={r.order.asked_by ?? (walk ? undefined : r.from_department_name ?? undefined)}
      minutes={view === 'todo' ? minutesSince(r.occurred_at) : null}
      marks={packs.marks(pr)} extra={view === 'todo' ? packs.buttons(pr) : undefined}
      actions={view === 'todo' && can('write:step') && (isOpen || waits) ? <span className="flex gap-1.5">{waits && packs.anyway(pr, [r.order.item], 'Scan')}
        <Button size="sm" variant={isOpen ? 'ghost' : 'outline'} aria-expanded={isOpen} onClick={() => setOpen(isOpen ? null : r.item)}>{isOpen ? 'Close' : 'Scan'}</Button></span>
        : view === 'done' ? <span className="text-12 text-faint tnum">{r.order.last_at ? hm(r.order.last_at) : ''}</span> : undefined}
      below={<>{packs.below(pr)}{isOpen && <ScanCard r={r} deptId={dept.id} words={w} wordsKnown={wordsKnown} pregCheck={pregCheck} askPregnant={askPregnant}
        waitWord={waits ? packs.waits.get(r.order.item)?.word : undefined}
        onDone={(x) => { setOpen(null); setSaid(x); refresh(qc) }} />}</>} />
  }

  return <ScreenFrame views={views} view={view} onView={(v) => { setView(v); setOpen(null) }}
    filters={kinds.length > 1 && <span className="flex flex-wrap items-center gap-1">
      <Chip shape="pill" on={!kind} onClick={() => setKind(null)}>All <span className="tnum opacity-70">{lists[view].length}</span></Chip>
      {kinds.map((k) => <Chip key={k} shape="pill" on={kind === k} onClick={() => setKind(kind === k ? null : k)}>{k} <span className="tnum opacity-70">{lists[view].filter((r) => kindOf(r) === k).length}</span></Chip>)}</span>}
    search={<Input value={find} onChange={(e) => setFind(e.target.value)} placeholder="Record number or name" className="w-full sm:w-64" />}
    action={can('write:order') && <Button size="sm" variant="outline" aria-expanded={walkIn} onClick={() => { setWalkIn(!walkIn); setSaid(null) }}><Plus />Walk-in</Button>}
    notice={said && <Callout key={said} tone="accent" icon={false} role="status">✓ {said}</Callout>}>
    {walkIn && <WalkIn dept={dept} onClose={() => setWalkIn(false)} onStarted={(x) => { setWalkIn(false); setSaid(x); setView('todo') }} />}
    {q.isLoading ? <Spinner label="Loading" /> : <Card><ul>{shown.length ? shown.map(row)
      : <li><Empty>{f ? 'No match here.' : view === 'todo' ? 'Nobody to scan.' : view === 'done' ? 'Nothing scanned today.' : 'Nobody today.'}</Empty></li>}</ul></Card>}
    {view === 'todo' && <p className="text-12 text-faint">One list for every room: stat first, then by waiting. A ward patient says the ward (portable: go to them).</p>}
  </ScreenFrame>
}
/** stat, then urgent, then the longest wait */
const RANK: Record<string, number> = { stat: 0, urgent: 1 }
const order = (rows: RequestQueueRow[]) => [...rows].sort((a, b) => (RANK[a.request?.priority ?? ''] ?? 2) - (RANK[b.request?.priority ?? ''] ?? 2) || a.occurred_at.localeCompare(b.occurred_at))

/** one thing asked on the scan card: its label, then its chips or boxes */
const Row = ({ label, children }: { label: string; children: ReactNode }) =>
  <div className="flex flex-wrap items-center gap-2 rounded-lg border border-line bg-surface px-3 py-2"><span className="w-28 shrink-0 text-13 font-medium text-fg">{label}</span>{children}</div>
type Preg = 'not' | 'pregnant' | 'unsure'
type Reaction = 'none' | 'mild' | 'moderate' | 'severe'
/** an X-ray's views, the usual ones ticked */
const viewsOf = (code: string | undefined): [string[], string[]] => code === 'xrchest' ? [['PA', 'Lateral', 'AP'], ['PA']]
  : code === 'xrknee' ? [['AP', 'Lateral', 'Skyline'], ['AP', 'Lateral']] : code === 'xrabd' ? [['Erect', 'Supine'], ['Erect']] : [['AP', 'Lateral', 'Oblique'], ['AP', 'Lateral']]
const GADO = /gado|dotarem|magnevist|gadovist|multihance|prohance|clariscan/i
/** the scan card under the row: who and which side, pregnant (recorded, and asked at the door), before contrast, then Scanned or why not */
function ScanCard({ r, deptId, words, wordsKnown, pregCheck, askPregnant, waitWord, onDone }: { r: RequestQueueRow; deptId: string; words?: Words; wordsKnown: boolean
  pregCheck: boolean; askPregnant: boolean; waitWord?: string; onDone: (said: string) => void }) {
  const { org } = useDepartment()
  const s = org?.services.find((x) => x.id === r.service_id); const e = s ? examOf(org, s) : null
  const contrast = !!e?.contrast; const xray = s?.section_name === 'X-ray'
  const rec = useRecord(contrast || pregCheck ? r.patient.id : null, deptId); const factsQ = useFacts(pregCheck || contrast ? r.patient.id : null)
  const standing = standingOf(factsQ.data, org?.types, ymd(new Date().toISOString()))
  const facts = factsOf(rec.data, standing)
  const [allViews, usual] = viewsOf(s?.code)
  const [preg, setPreg] = useState<Preg | null>(null); const [why, setWhy] = useState<string | null>(null); const [views, setViews] = useState<string[]>(usual)
  const [agreed, setAgreed] = useState<'agreed' | 'without' | null>(null); const [agreedBy, setAgreedBy] = useState(''); const [fasting, setFasting] = useState<boolean | null>(null)
  const [agent, setAgent] = useState(s?.section_name === 'MRI' ? 'Gadovist' : 'Omnipaque 350'); const [ml, setMl] = useState(''); const [lot, setLot] = useState('')
  const [reaction, setReaction] = useState<Reaction>('none')
  const [busy, setBusy] = useState(false); const [error, setError] = useState<string | null>(null)
  // the department's radiologists, offered by name where the reader may see who holds what (else the name is typed, or left unsaid)
  const radiologists = (org?.users ?? []).filter((u) => !u.retired_at && u.roles.some((x) => x.role_key === 'radiology.radiologist' && (!x.department_id || x.department_id === deptId)))
  // under 30, or the record not read (the radiologist decides then too)
  const low = contrast && (rec.isError || (facts.egfr != null && facts.egfr.value < 30))
  const fastAsked = contrast && /fasting/i.test(e?.prep ?? '')
  const givesContrast = contrast && agreed !== 'without'
  const mlOk = /^\d+(\.\d+)?$/.test(ml) && Number(ml) > 0
  const name = `${r.patient.given_name} ${r.patient.family_name}`
  const film = e ? filmOnly(e, words) : false
  const recorded = standing.pregnancy?.data as { status?: string; pregnant?: boolean } | undefined
  const recordedPregnant = recorded?.status === 'current' && !!recorded.pregnant
  // film only is known only once radiology's words on this order are (a report asked would otherwise be lost)
  // nothing is decided on what is not read yet: the record (the facts before contrast), the standing pregnancy, the order's words
  const ready = (!askPregnant || preg) && (!low || agreed) && (!fastAsked || fasting !== null) && (!givesContrast || mlOk) && !waitWord
    && (!e || e.report !== 'asked' || wordsKnown) && (!xray || views.length > 0) && !(contrast && rec.isLoading) && !(pregCheck && factsQ.isLoading)
  const land = async (items: EntryIn[], said: string) => {
    setBusy(true); setError(null)
    try { await write(oneSet(items)); onDone(said) } catch (x) { setError(errorText(x)); setBusy(false) }
  }
  const base = { patient_id: r.patient.id, department_id: deptId, visit_id: null }
  /** pregnant or not, said at the door: the base's fact, changing the one standing, dated today. Pregnant again as recorded writes none
   *  (its LMP or weeks stay, dated as they were; the step's note says it was confirmed), unless the record is overdue for a check (then a
   *  fresh one, no dates); not pregnant is always written again, so it reads as said today */
  const was = standing.pregnancy?.data as { status?: string; pregnant?: boolean } | undefined
  const overdue = /check/i.test(standing.pregnancy?.words ?? '')
  const sameAsRecorded = preg === 'pregnant' && !!was && was.status === 'current' && !!was.pregnant && !overdue
  const pregItems = (): EntryIn[] => (preg !== 'not' && preg !== 'pregnant') || sameAsRecorded ? []
    : [{ ...base, id: newId(), type: 'pregnancy', data: { status: 'current', pregnant: preg === 'pregnant', note: 'asked in Radiology' },
      ...(standing.pregnancy ? { refers_to: standing.pregnancy.entry_id, relation: 'changes' as const } : {}) } as EntryIn]
  const pregNote = preg === 'unsure' ? 'pregnancy: not sure' : sameAsRecorded ? 'pregnant: as recorded, said at the door' : ''
  const scanned = () => {
    const gado = GADO.test(agent); const allergen = gado ? 'Gadolinium contrast media' : 'Iodinated contrast media'
    // a reaction to an agent already among the allergies is not listed twice (the list refuses a second): it is kept with the dose given
    const listed = (rec.data?.allergies ?? []).some((a) => a.status === 'active' && (a.substance_name.toLowerCase() === allergen.toLowerCase()
      || (a.data?.concept?.codings ?? []).some((c) => c.code === (gado ? 'gadolinium_contrast_media' : 'iodinated_contrast_media'))))
    const contrastWords = givesContrast ? `${agent.trim() || 'contrast'} ${Number(ml)} mL IV, ${reaction === 'none' ? 'no reaction' : `${reaction} reaction`}` : ''
    const note = [xray && `views: ${views.join(', ')}`, contrastWords, pregNote,
      low && agreed === 'agreed' && `${facts.egfr ? `eGFR ${facts.egfr.value}` : 'the record not read'}: contrast agreed by ${agreedBy.trim() || 'the radiologist'}`,
      contrast && agreed === 'without' && 'scanned without contrast', fasting === false && 'not fasting', org?.me.name && `scanned by ${org.me.name}`].filter(Boolean).join('; ')
    const items: EntryIn[] = [answerEntry(r, deptId, { type: 'step', data: { status: film ? 'completed' : 'in-progress', step: 'scanned', ...(note ? { note } : {}) } }), ...pregItems()]
    if (givesContrast) items.push({ ...base, id: newId(), type: 'given', data: { drug: { text: agent.trim() || 'Contrast' }, dose: qty(Number(ml), 'mL', 'mL'), route: 'IV', status: 'completed',
      ...(lot.trim() ? { lot: lot.trim() } : {}), note: `for ${s?.name ?? 'the scan'}${reaction !== 'none' ? `; ${reaction} reaction` : ''}` } } as EntryIn)
    if (givesContrast && reaction !== 'none' && !listed) items.push({ ...base, id: newId(), type: 'allergy', data: { concept: { text: allergen,
      codings: [{ system: 'local.allergen', code: gado ? 'gadolinium_contrast_media' : 'iodinated_contrast_media', display: allergen }] },
      type: 'allergy', category: ['medication'], criticality: reaction === 'severe' ? 'high' : 'low', clinical_status: 'active', verification: 'confirmed',
      reactions: [{ manifestation: { text: `Reaction to ${agent.trim() || 'contrast'}` }, severity: reaction }], note: `at the ${s?.name ?? 'scan'}` } } as EntryIn)
    void land(items, `${name} · ${s?.name ?? 'scan'}${film ? ': film only — the doctor reads it' : ': to report'}`)
  }
  // why not, with what was said at the door kept all the same
  const notScanned = (reason: string) => land([answerEntry(r, deptId, { type: 'step', data: { status: 'cancelled', reason, ...(pregNote ? { note: pregNote } : {}) } }), ...pregItems()],
    `${name}: not scanned (${reason.toLowerCase()}) — the doctor sees why`)
  return <div className="grid gap-4 border-t border-line bg-sunken p-4 md:grid-cols-[15rem_minmax(0,1fr)]" onClick={(x) => x.stopPropagation()}
    onKeyDown={(k) => { if (k.key === 'Enter' && (k.metaKey || k.ctrlKey) && ready && !busy) { k.preventDefault(); scanned() } }}>
    <div className="grid content-start gap-2">
      <p className="text-11 font-semibold uppercase tracking-[0.06em] text-faint">Before the scan</p>
      <p className="text-18 font-semibold text-fg">{name}</p>
      <p className="text-13 text-muted">#{r.patient.record_number} · {ageSex(r.patient)} · born {longDate(r.patient.born_on)}</p>
      <p className="text-12 text-faint">Ask the name and the birth date; both must match.</p>
      <div className="mt-1 grid place-items-center rounded-lg bg-surface px-2 py-3 text-center ring-2 ring-accent">
        {words?.side && <span className="text-22 font-bold uppercase tracking-wide text-accent">{words.side}</span>}
        <span className="text-14 text-fg">{s?.name ?? r.display_line}</span>
        {wordsKnown && e?.side && !words?.side && <span className="text-12 font-medium text-warn">No side said: ask the doctor who asked</span>}</div>
      {r.question_text && <p className="text-13 text-muted">? {r.question_text}</p>}
      {pregCheck && !askPregnant && <p className="text-13">{factsQ.isLoading ? <Spinner label="Pregnancy" />
        : <Tag tone={recordedPregnant ? 'danger' : 'neutral'}>{standing.pregnancy ? `recorded: ${standing.pregnancy.words.toLowerCase()}` : 'pregnancy not recorded'}</Tag>}</p>}
      {pregCheck && !askPregnant && recordedPregnant && <p className="text-12 text-warn">Pregnant: ask the radiologist, or Couldn't scan.</p>}
    </div>
    <div className="grid content-start gap-2">
      {contrast && <>
        <p className="text-11 font-semibold uppercase tracking-[0.06em] text-faint">Before contrast · from the record</p>
        <div className="rounded-lg border border-line bg-surface px-3 py-2 text-13">{rec.isLoading ? <Spinner label="The record" /> : <FactsLine facts={facts} contrast pregnancy={false} label={false} />}</div>
        {low && <Callout tone="warn" title="eGFR under 30: the radiologist decides on contrast">{facts.metformin ? <>If given: stop metformin for 48 hours, then check creatinine.
          <span dir="rtl" lang="ar" className="block text-13">أوقف الميتفورمين ٤٨ ساعة ثم حلل الكرياتينين</span></> : 'Ask before giving it.'}</Callout>}
        {!low && facts.metformin && facts.egfr == null && <p className="text-12 text-warn">Metformin and no recent eGFR: ask the radiologist.</p>}
      </>}
      {(askPregnant || low || fastAsked || contrast || xray) && <p className="pt-1 text-11 font-semibold uppercase tracking-[0.06em] text-faint">Asked here</p>}
      {askPregnant && factsQ.isLoading && <Spinner label="Pregnancy" />}
      {askPregnant && !factsQ.isLoading && <Row label="Pregnant?"><Chip on={preg === 'not'} onClick={() => setPreg('not')}>Not pregnant</Chip><Chip on={preg === 'pregnant'} onClick={() => setPreg('pregnant')}>Pregnant</Chip>
        <Chip on={preg === 'unsure'} onClick={() => setPreg('unsure')}>Not sure</Chip>
        <span className="ms-auto text-12 text-faint">{standing.pregnancy ? `recorded: ${standing.pregnancy.words.toLowerCase()}` : 'women 12–50 · X-ray and CT'}</span></Row>}
      {askPregnant && (preg === 'pregnant' || preg === 'unsure') && <p className="text-12 text-warn">Pregnant or not sure: ask the radiologist, or Couldn't scan.</p>}
      {xray && <Row label="Views">{allViews.map((v) => <Chip key={v} variant="check" on={views.includes(v)}
        onClick={() => setViews((x) => x.includes(v) ? x.filter((y) => y !== v) : [...x, v])}>{v}</Chip>)}</Row>}
      {contrast && rec.isError && <Callout tone="warn" title="The record could not be read">The radiologist decides on contrast.</Callout>}
      {low && <Row label="Radiologist"><Chip on={agreed === 'agreed'} onClick={() => setAgreed('agreed')}>Contrast agreed</Chip>
        <Chip on={agreed === 'without'} onClick={() => setAgreed('without')}>Without contrast</Chip>
        {agreed === 'agreed' && <>{radiologists.map((u) => <Chip key={u.id} variant="check" on={agreedBy === u.name} onClick={() => setAgreedBy(agreedBy === u.name ? '' : u.name)}>{u.name}</Chip>)}
          <Input value={agreedBy} onChange={(x) => setAgreedBy(x.target.value)} placeholder="by whom" aria-label="The radiologist who agreed" className="w-48" /></>}</Row>}
      {fastAsked && <Row label="Fasting?"><Chip on={fasting === true} onClick={() => setFasting(true)}>Yes</Chip><Chip on={fasting === false} onClick={() => setFasting(false)}>No</Chip>
        {fasting === false && <span className="text-12 text-warn">scanned anyway, marked not fasting</span>}</Row>}
      {givesContrast && <>
        <Row label="Contrast given"><Input value={agent} onChange={(x) => setAgent(x.target.value)} aria-label="Contrast agent" className="w-40" />
          <Input value={ml} onChange={(x) => setMl(x.target.value.replace(/[^0-9.]/g, ''))} inputMode="decimal" aria-label="mL" placeholder="mL" className="w-16 text-end" />
          <span className="text-13 text-muted">mL · IV</span><Input value={lot} onChange={(x) => setLot(x.target.value)} placeholder="lot (optional)" className="w-32" /></Row>
        <Row label="Reaction">{(['none', 'mild', 'moderate', 'severe'] as const).map((x) => <Chip key={x} on={reaction === x} onClick={() => setReaction(x)}>{x[0].toUpperCase() + x.slice(1)}</Chip>)}
          <span className="ms-auto text-12 text-faint">a reaction is added to the allergies</span></Row>
      </>}
      {error && <Callout tone="danger" title="Not saved">{error}</Callout>}
      <div className="flex flex-wrap items-center gap-2 pt-1">
        <Button size="sm" disabled={!ready} title={waitWord} loading={busy} onClick={scanned}>Scanned<Kbd className="ms-1">⌘↵</Kbd></Button>
        <span className="text-12 text-faint">{e?.report === 'asked' && !wordsKnown ? '…' : film ? 'film only: the doctor reads it' : 'goes to Report'} · Couldn't:</span>
        {REASONS.map((x) => <Chip key={x} on={why === x} onClick={() => setWhy(why === x ? null : x)}>{x}</Chip>)}
        {why && <Button size="sm" variant="outline" loading={busy} onClick={() => void notScanned(why)}>Not scanned</Button>}
      </div>
    </div>
  </div>
}
