// Before (spec/openCare.md §5.6, D2b): the nurse's card at the start of a session — the weight, BP, pulse and temperature (the base's
// vitals: the stay's first weight is "the weight before"), the access checked (thrill and bruit for a fistula or graft, a clean dressing
// for a catheter), and the fluid to take off with its parts (the weight above dry + 0.3 L given back − 0.4 L left above dry, or the
// nurse's own figure); the hourly rate over 13 mL/kg/h, a gain over 4 % of the dry weight and no prescription are notices, never a
// stop. Sign writes one set: the vitals and the session changed with the prescription copied. Once signed, its summary.
import { useState } from 'react'
import { Check } from 'lucide-react'
import type { Department, PresenceRow } from '@core/db/types'
import { parseVitals } from '@core/screens/visit/vitals'
import { Button, Card, Chip, Input, Kbd, NumberInput, hm } from '@core/ui'
import { CardHead, Notices, SignState } from './parts'
import { ACCESS, accessWords, checkWords, type AccessKind } from './rx'
import { beforeNotices, beforeSet, fluidOf, kg, onSign, partsWords, qv, ufRate, weightWords, type Pre, type RxData, type SessionNow, type Vit } from './session'
import { litres } from './board'
import { useSign } from './useSession'

const LABEL = 'text-12 text-muted'

/** the BP typed ("146/84", or "146/84 82 36.8"): only the pressure, the pulse and the temperature are taken */
function bpTyped(s: string): { sys?: number; dia?: number; pulse?: number; temp?: number; error?: string } {
  if (!s.trim()) return {}
  const r = parseVitals(s.trim().split(/\s+/))
  if (!r) return {}
  if ('error' in r) return { error: r.error }
  const p = r.ok[0]?.params ?? {}; const n = (x: unknown) => typeof x === 'number' ? x : undefined
  return { sys: n(p.systolic), dia: n(p.diastolic), pulse: n(p.pulse), temp: n(p.temperature) }
}

export function BeforeCard({ dept, stay, session, pre, rx, last, onDone }: { dept: Pick<Department, 'id'>; stay: PresenceRow; session: SessionNow; pre: Pre | null
  rx: RxData | null; last: number | null; onDone?: () => void }) {
  const [weight, setWeight] = useState<number | null>(null)
  const [bp, setBp] = useState(pre?.bp ? `${pre.bp.sys}/${pre.bp.dia}` : '')
  const [pulse, setPulse] = useState<number | null>(pre?.hr ?? null); const [temp, setTemp] = useState<number | null>(pre?.temp ?? null)
  const [kind, setKind] = useState<AccessKind | null>(rx?.access?.kind ?? null); const [ok, setOk] = useState(false)
  const [site, setSite] = useState(rx?.access?.site ?? ''); const [note, setNote] = useState('')
  const [typedL, setTypedL] = useState<number | null>(null)
  const s = useSign()
  const typed = bpTyped(bp)
  const dry = qv(rx?.dry_weight) ?? null; const hours = rx?.hours ?? session.data.haemodialysis.hours ?? null
  // "the weight before" is the stay's first weight: once there is one it is shown, not typed again (corrected from the chart)
  const fixed = pre?.weight ?? null; const w = fixed ?? weight
  const fluid = fluidOf(w, dry, typedL != null ? Math.round(typedL * 1000) : null)
  const rate = ufRate(fluid.target, hours, dry)
  const notices = beforeNotices({ rx, rate, gained: w != null && last != null ? Math.round((w - last) * 10) / 10 : null, dry })
  const sys = typed.sys; const dia = typed.dia; const hr = pulse ?? typed.pulse ?? null; const t = temp ?? typed.temp ?? null
  // the stay's first vitals are the ones shown: no second vitals unless something was changed, and then without the weight
  const same = !!pre && pre.bp?.sys === sys && pre.bp?.dia === dia && (pre.hr ?? null) === hr && (pre.temp ?? null) === t
  const vit = { sys, dia, pulse: hr, temp: t }; const anyVit = sys != null || hr != null || t != null
  const ready = w != null && fluid.target != null && !!kind && !typed.error && !s.busy
  const sign = () => {
    if (!ready || w == null || fluid.target == null || !kind) return
    void s.sign(beforeSet({ patientId: stay.patient_id, departmentId: dept.id, stay: stay.item, session, rx, target: fluid.target,
      vitals: fixed == null ? { weight: w, ...vit } : !same && anyVit ? vit : null, access: { kind, site, ok, note } }), onDone)
  }
  const parts = partsWords(fluid)
  return <Card className="grid content-start gap-2 p-3" onKeyDown={onSign(sign)}>
    <CardHead>Before</CardHead>
    <div className="grid grid-cols-2 gap-x-3 gap-y-1.5">
      {fixed != null ? <div className="grid gap-0.5"><span className={LABEL}>Weight</span><p className="text-13 text-fg"><b className="font-semibold tnum">{kg(fixed)} kg</b>
        <span className="text-12 text-faint"> · weighed {hm(pre!.at)}</span></p></div>
        : <label className="grid gap-0.5"><span className={LABEL}>Weight <span className="text-faint">kg</span></span><NumberInput dense label="Weight" value={weight} onValue={setWeight} /></label>}
      <label className="grid gap-0.5"><span className={LABEL}>BP</span><Input dense value={bp} onChange={(e) => setBp(e.target.value)} placeholder="146/84" aria-label="BP" aria-invalid={!!typed.error || undefined} /></label>
      <label className="grid gap-0.5"><span className={LABEL}>Pulse</span><NumberInput dense integer label="Pulse" value={pulse} onValue={setPulse} placeholder={typed.pulse != null ? String(typed.pulse) : undefined} /></label>
      <label className="grid gap-0.5"><span className={LABEL}>Temp <span className="text-faint">°C</span></span><NumberInput dense label="Temperature" value={temp} onValue={setTemp} placeholder={typed.temp != null ? String(typed.temp) : undefined} /></label>
    </div>
    {typed.error && <p className="text-12 text-danger">{typed.error}</p>}
    {(dry != null || last != null) && <p className="text-12 text-muted">{weightWords(w, dry, last)}</p>}
    <div className="flex flex-wrap items-center gap-1.5"><span className={LABEL}>Access</span>
      {ACCESS.map(([k, w]) => <Chip key={k} on={kind === k} onClick={() => setKind(k)}>{w}</Chip>)}
      {kind && <Chip variant="check" on={ok} onClick={() => setOk(!ok)}>{checkWords(kind)} ✓</Chip>}</div>
    <div className="flex gap-1.5"><Input dense value={site} maxLength={60} onChange={(e) => setSite(e.target.value)} placeholder="Site" aria-label="Access site" className="min-w-0 flex-1" />
      <Input dense value={note} maxLength={200} onChange={(e) => setNote(e.target.value)} placeholder="Note" aria-label="Access note" className="min-w-0 flex-1" /></div>
    <div className="grid gap-0.5 rounded-md bg-sunken p-2">
      <div className="flex items-center gap-2"><span className="text-13 font-medium text-fg">To take off</span>
        <NumberInput dense label="To take off, litres" value={typedL} onValue={setTypedL} placeholder={fluid.target != null && !fluid.typed ? litres(fluid.target) : 'L'} className="w-20" />
        <span className="text-13 text-muted">L{rate != null && ` · ${rate} mL/kg/h`}</span></div>
      {parts && !fluid.typed && <p className="text-12 text-faint">{parts}</p>}
      {fluid.typed && <p className="text-12 text-faint">The nurse's figure</p>}
    </div>
    <Notices items={notices} />
    <SignState err={s.err} warn={s.warn} />
    <div className="flex flex-wrap items-center gap-2"><Button size="sm" onClick={sign} disabled={!ready} loading={s.busy}>Sign Before<Kbd className="ms-1 max-sm:hidden">⌘↵</Kbd></Button>
      {!ready && !s.busy && <span className="text-12 text-faint">{w == null ? 'Needs the weight' : !kind ? 'Needs the access' : fluid.target == null ? 'Needs the fluid to take off' : ''}</span>}</div>
  </Card>
}

/** Before once signed: the weight and its words, BP · pulse · temperature, the access, the fluid to take off and its parts */
export function BeforeSummary({ session, pre, vit: v, last }: { session: SessionNow; pre: Pre | null; vit: Vit; last: number | null }) {
  const h = session.data.haemodialysis
  const dry = qv(h.prescription?.dry_weight) ?? null; const target = qv(h.target) ?? null
  const fluid = fluidOf(pre?.weight, dry, target)
  const rate = ufRate(target, h.prescription?.hours ?? h.hours, dry)
  const notices = beforeNotices({ rx: h.prescription ?? null, rate, gained: pre && last != null ? Math.round((pre.weight - last) * 10) / 10 : null, dry })
  const parts = partsWords(fluid)
  const vit = [v.bp ? `BP ${v.bp.sys}/${v.bp.dia}` : null, v.hr != null ? `P ${v.hr}` : null, v.temp != null ? `T ${v.temp}` : null].filter(Boolean).join(' · ')
  return <Card className="grid content-start gap-1.5 p-3">
    <CardHead>Before · {hm(session.at)}</CardHead>
    {pre ? <p className="text-14 text-fg"><b className="font-semibold tnum">{kg(pre.weight)} kg</b> <span className="text-12 text-muted">{weightWords(pre.weight, dry, last)}</span></p>
      : <p className="text-13 text-warn">No weight in this stay</p>}
    {vit && <p className="text-13 text-fg tnum">{vit}</p>}
    {h.access && <p className="flex items-center gap-1 text-13 text-fg">{[accessWords(h.access.kind), h.access.site].filter(Boolean).join(' ')}
      {h.access.ok && <span className="inline-flex items-center gap-0.5 text-muted">· {checkWords(h.access.kind)}<Check aria-label="checked" className="size-3.5 text-ok" /></span>}
      {h.access.note && <span className="text-muted">· {h.access.note}</span>}</p>}
    {target != null && <p className="text-13 text-fg">To take off <b className="font-semibold tnum">{litres(target)} L</b>{rate != null && <span className="text-muted"> · {rate} mL/kg/h</span>}</p>}
    {parts && !fluid.typed && <p className="text-12 text-faint">{parts}</p>}
    <Notices items={notices.filter((n) => !n.text.startsWith('No standing'))} />
  </Card>
}
