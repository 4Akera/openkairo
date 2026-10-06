// The cards of the base facts under the line (spec/openCare.md §5.1 rule 3; facts.ts): pregnant or not with an LMP or the weeks,
// breastfeeding or not, an alert's kind (DNR, isolation for HBV or HCV, fall risk, or the clinician's words), and an end's reason.
// Inline under the line, as every card.
import { Chip, FormRow, Input, NumberInput, Segmented, cn } from '../../ui'
import { ALERT_KINDS } from '../chart/model/facts'
import { kindWord } from './facts'

type Q = Record<string, any> // eslint-disable-line @typescript-eslint/no-explicit-any
const small = 'h-7 text-13'
const ENDED = ['Delivered', 'Miscarriage', 'Termination', 'Not pregnant after all']

export function FactCard({ fn, q, set }: { fn: string; q: Q; set: (p: Q) => void }) {
  if (q.action === 'end') return fn === 'pregnancy' ? <div className="grid gap-1.5">
    <FormRow inline label="Why">{ENDED.map((r) => <Chip data-chip key={r} on={q.reason === r} onClick={() => set({ reason: q.reason === r ? null : r })}>{r}</Chip>)}</FormRow>
    <FormRow inline label=""><Input aria-label="Why it ended" value={q.reason ?? ''} onChange={(e) => set({ reason: e.target.value || null })} placeholder="Or type why" className={cn(small, 'max-w-sm')} /></FormRow>
  </div> : <p className="text-12 text-faint">Ends it from now; the record keeps it.</p>
  if (fn === 'pregnancy') return <div className="grid gap-1.5">
    <FormRow inline label="Pregnant"><Segmented size="sm" aria-label="Pregnant" value={q.pregnant ? 'yes' : 'no'} onChange={(v) => set(v === 'yes' ? { pregnant: true } : { pregnant: false, lmp: null, weeks: null })}
      options={[['yes', 'Pregnant'], ['no', 'Not pregnant']]} />{q.entry_id && <span className="text-11 text-faint">changes the pregnancy recorded before</span>}</FormRow>
    {q.pregnant && <FormRow inline label="LMP">
      <Input aria-label="Last menstrual period" type="date" value={q.lmp ?? ''} onChange={(e) => set({ lmp: e.target.value || null, weeks: e.target.value ? null : q.weeks })} className={cn(small, 'w-40')} />
      <span className="text-11 text-faint">or</span>
      <NumberInput label="Weeks" integer value={q.weeks} onValue={(n) => set({ weeks: n, lmp: n == null ? q.lmp : null })} placeholder="weeks" className={cn(small, 'w-20')} />
      <span className="text-11 text-faint">if known</span>
    </FormRow>}
  </div>
  if (fn === 'breastfeeding') return <FormRow inline label="Feeding"><Segmented size="sm" aria-label="Breastfeeding" value={q.breastfeeding ? 'yes' : 'no'}
    onChange={(v) => set({ breastfeeding: v === 'yes' })} options={[['yes', 'Breastfeeding'], ['no', 'Not breastfeeding']]} /></FormRow>
  return <div className="grid gap-1.5">
    <FormRow inline label="Kind">{ALERT_KINDS.map(([k, l]) => <Chip data-chip key={k} on={q.kind === k} onClick={() => set({ kind: k, text: k === 'other' ? '' : kindWord(k) })}>{l}</Chip>)}</FormRow>
    {q.kind === 'other' && <FormRow inline label="Says"><Input aria-label="Alert" value={q.text ?? ''} onChange={(e) => set({ text: e.target.value })} placeholder="what every department must know" className={cn(small, 'max-w-sm flex-1')} /></FormRow>}
  </div>
}
