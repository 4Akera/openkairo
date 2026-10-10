// The birth card on the Labour tab (spec/openCare.md §5.6; the picture src/pictures/labour.tsx, "The birth"; an inline card, nothing
// over the record): born at, delivered by, how, the perineum (not after a caesarean), the third stage (oxytocin as the base's given, its
// words following How; the placenta; the blood loss, with the PPH notice — only a notice), and each baby (BabyCard.tsx); "Another baby
// (twins)" adds a card of its own. "Sign the birth" (⌘↵) writes ONE set: the mother's birth, her oxytocin and her pregnancy's end, each
// baby's new record with her as its mother (the owner's Q10), its stay in the cot, weight, Apgar and doses — all or nothing. It writes
// through the core's one door itself (the composer's Sign writes one patient's drafts, and a birth's set holds the mother's and each baby's entries). The set's id is made when
// the card opens and kept until the draft changes, so "Sign anyway" (the warnings confirmed) and a resend are the same set.
import { useState, type KeyboardEvent } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { oneSet, newId } from '@core/db/entries'
import { write, WriteWarned, words, type Finding, type NewPatient, type Outcome, type SetIn } from '@core/db/rpc'
import type { Identity, Place, PresenceRow } from '@core/db/types'
import { refresh } from '@core/hooks/writes'
import { useDepartment } from '@core/hooks/organization'
import type { Pregnancy } from '@core/screens/chart/model/facts'
import { inUse } from '@core/screens/visit/score'
import { Button, Callout, Card, Chip, Input, Kbd, NotForRole, NumberInput, errorText } from '@core/ui'
import { hm, ymd } from '@core/ui/time'
import { APGAR } from './apgar'
import { BabyCard, Label, Problem, Row, type Answer } from './BabyCard'
import { MODES, PERINEUM, addBaby, apgarKey, apgarWaiting, babyName, clockTime, emptyBirth, entriesOf, isCot, oxytocinOf, pphOf, problemsOf, withMode, type ApgarAnswer,
  type BirthDraft } from './birth'

interface Props { stay: PresenceRow; patient: Identity; pregnancy: Pregnancy | null; ready: boolean; factsError: unknown; cots: readonly Place[]; now: number
  onDone: (o: Outcome, patients: NewPatient[]) => void; onCancel: () => void }

export function BirthCard(p: Props) {
  const { can } = useDepartment()
  if (!can('write:obgyn.birth') || !can('manage:patients')) return <NotForRole size="sm">Signing a birth is not for your role here.</NotForRole>
  return <Birth {...p} />
}

function Birth({ stay, patient, pregnancy, ready, factsError, cots, now, onDone, onCancel }: Props) {
  const { org, dept } = useDepartment(); const qc = useQueryClient()
  const me = org?.me.id ?? ''
  // the card chooses only a cot for a baby (a free place of another kind is offered, never chosen)
  const cotIds = cots.filter(isCot).map((c) => c.id)
  const [st, setSt] = useState(() => ({ d: emptyBirth(new Date(), me, newId, cotIds), setId: newId() }))
  const [answers, setAnswers] = useState<Record<string, Answer>>({})
  const [busy, setBusy] = useState(false); const [warn, setWarn] = useState<Finding[] | null>(null); const [err, setErr] = useState<string | null>(null)
  const [built, setBuilt] = useState<{ setId: string; set: SetIn } | null>(null)
  const d = st.d
  // a changed draft is a new set (the server refuses a set id it has seen with other entries)
  const update = (f: (x: BirthDraft) => BirthDraft) => { setSt((s) => ({ d: f(s.d), setId: newId() })); setWarn(null); setErr(null) }
  const version = inUse(org?.scores).find((t) => t.key === APGAR)?.version ?? null
  const apgar: ApgarAnswer = (inputs) => {
    const r = version ? answers[apgarKey(version, inputs)] : undefined
    return version && r && 'score' in r && r.complete && r.total != null ? { total: r.total, band: r.band?.key ?? '', version } : null
  }
  const problems = problemsOf(d, now); const problem = (field: string) => problems.find((x) => x.field === field)?.text
  const waiting = apgarWaiting(d, apgar); const pph = pphOf(d); const ox = oxytocinOf(d.mode)
  const blocked = busy || !ready || !dept || problems.length > 0 || waiting

  async function sign(confirmed: string[] = []) {
    if (blocked || !dept) return
    let set = built?.setId === st.setId ? built.set : null
    if (!set) {
      const was = pregnancy?.pregnant ? { entry: pregnancy.entry.id, item: pregnancy.item, version: pregnancy.entry.item_version, data: pregnancy.data } : null
      const x = entriesOf(d, { mother: patient.id, motherName: patient.full_name, stay: stay.item, dept: dept.id, pregnancy: was, apgar }, newId, Date.now())
      set = oneSet(x.entries, { set_id: st.setId, patients: x.patients, seen: x.seen }); setBuilt({ setId: st.setId, set })
    }
    setBusy(true); setErr(null); setWarn(null)
    try { const o = await write({ ...set, confirmed }); refresh(qc); onDone(o, set.patients ?? []) }
    catch (e) { if (e instanceof WriteWarned) setWarn(e.outcome.findings); else setErr(errorText(e)) }
    finally { setBusy(false) }
  }
  const onKey = (e: KeyboardEvent) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); void sign() } }
  const doctor = stay.assigned_id && stay.assigned_id !== me ? org?.users.find((u) => u.id === stay.assigned_id) : undefined
  return <Card className="grid gap-3 p-4 ring-1 ring-accent-line" onKeyDown={onKey}>
    <div className="flex items-center gap-2"><Label>The birth</Label><Button size="xs" variant="ghost" className="ms-auto" onClick={onCancel}>Close</Button></div>
    <Row label="Born at"><Input type="time" aria-label="Born at" value={hm(d.bornAt)} onChange={(e) => { const at = clockTime(e.target.value, now); if (at) update((x) => ({ ...x, bornAt: at })) }}
      className="h-8 w-28 tnum" /><span className="text-12 text-faint">{ymd(d.bornAt) === ymd(new Date(now).toISOString()) ? 'today' : 'yesterday'}</span></Row>
    <Problem text={problem('bornAt')} />
    <Row label="Delivered by"><Chip on={d.by === me} onClick={() => update((x) => ({ ...x, by: me }))}>{org?.me.name ?? 'Me'} (me)</Chip>
      {doctor && <Chip on={d.by === doctor.id} onClick={() => update((x) => ({ ...x, by: doctor.id }))}>{doctor.name}</Chip>}</Row>
    <Row label="How">{MODES.map(([m, w]) => <Chip key={m} on={d.mode === m} onClick={() => update((x) => withMode(x, x.mode === m ? undefined : m))}>{w}</Chip>)}</Row>
    <Problem text={problem('mode')} />
    {d.mode !== 'caesarean' && <Row label="Perineum">{PERINEUM.map(([v, w]) => <Chip key={v} on={d.perineum === v} onClick={() => update((x) => ({ ...x, perineum: x.perineum === v ? undefined : v }))}>{w}</Chip>)}
      <Chip variant="check" on={d.episiotomy} onClick={() => update((x) => ({ ...x, episiotomy: !x.episiotomy }))}>Episiotomy</Chip>
      <Chip variant="check" on={d.repaired} onClick={() => update((x) => ({ ...x, repaired: !x.repaired }))}>Repaired</Chip></Row>}
    <Problem text={problem('perineum')} />
    <Row label="Third stage"><Chip variant="check" on={d.oxytocin} onClick={() => update((x) => ({ ...x, oxytocin: !x.oxytocin }))}>Oxytocin {ox.words}</Chip>
      {(['complete', 'incomplete'] as const).map((v) => <Chip key={v} on={d.placenta === v} onClick={() => update((x) => ({ ...x, placenta: x.placenta === v ? undefined : v }))}>Placenta {v}</Chip>)}</Row>
    <Row label="Blood loss"><NumberInput label="Blood loss in mL" integer value={d.bloodLoss} onValue={(n) => update((x) => ({ ...x, bloodLoss: n ?? undefined }))} className="h-8 w-24" />
      <span className="text-muted">mL</span></Row>
    <Problem text={problem('bloodLoss')} />
    {pph?.over && <Callout tone="danger" title="PPH">{pph.words}</Callout>}
    {d.babies.map((b, i) => <BabyCard key={b.id} b={b} title={d.babies.length > 1 ? `Baby ${i + 1}` : 'The baby'} cots={cots} version={version} answers={answers}
      set={(nb) => update((x) => ({ ...x, babies: x.babies.map((y) => y.id === b.id ? nb : y) }))}
      onRemove={i > 0 ? () => update((x) => ({ ...x, babies: x.babies.filter((y) => y.id !== b.id) })) : undefined}
      taken={d.babies.filter((y) => y.id !== b.id).map((y) => y.cot)} onAnswer={(k, a) => setAnswers((was) => ({ ...was, [k]: a }))}
      problem={(f) => problem(`baby${i}.${f}`)} />)}
    <div className="flex flex-wrap items-center gap-2"><Button size="sm" variant="outline" disabled={d.babies.length >= 4} onClick={() => update((x) => addBaby(x, newId, cotIds))}>Another baby (twins)</Button>
      <span className="text-12 text-faint">{d.babies.map((_, i) => babyName(patient.full_name, i + 1, d.babies.length)).join(' · ')}: a record of its own, in the same Done</span></div>
    {warn && <Callout tone="warn" title="Check before signing" actions={<><Button size="sm" loading={busy} onClick={() => void sign(warn.map((f) => f.code))}>Sign anyway</Button>
      <Button size="sm" variant="ghost" onClick={() => setWarn(null)}>Change it</Button></>}>
      <ul className="grid gap-0.5">{warn.map((f, i) => <li key={i}><b className="font-medium">{words(f.code)}</b>{f.detail ? ` — ${f.detail}` : ''}</li>)}</ul></Callout>}
    {err && <Callout tone="danger">{err}</Callout>}
    {!ready && !!factsError && <Callout tone="danger" title="Her pregnancy could not be read">{errorText(factsError)}</Callout>}
    <div className="flex flex-wrap items-center gap-2 border-t border-line pt-3">
      <Button loading={busy} disabled={blocked} onClick={() => void sign()}>Sign the birth<Kbd className="ms-1">⌘↵</Kbd></Button>
      <span className="text-12 text-faint">{waiting ? 'Adding up Apgar…' : !ready && !factsError ? 'Reading her pregnancy (to end it with the birth)…' : !ready ? 'Sign waits until her pregnancy is read (to end it with the birth)' : 'one Done: the birth, the third stage, each baby\'s record, Apgar, doses, cot'}</span></div>
  </Card>
}
