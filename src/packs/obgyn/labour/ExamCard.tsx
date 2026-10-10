// The labour examination's card under the line (/ve, /ctx; spec/openCare.md §5.6): each finding the line said, editable — the cervix,
// the head in fifths above the brim, the position, the liquor, moulding, caput, the contractions in 10 minutes and how long, G and P.
// Clicking the chosen chip clears it; a cleared field leaves the exam (never null: the writer would refuse it). The line follows. The
// cervix is kept in half centimetres, as /ve takes it; what cannot be (P not under G, a number out of range, a length with no
// contraction) is said under the fields, in /ve's words.
import type { ReactNode } from 'react'
import type { CardEditorProps } from '@core/screens/visit/commands'
import { Chip, FormRow, NumberInput, cn } from '@core/ui'
import { CAPUT, LIQUOR, MOULDING, POSITIONS, type ExamData } from './codes'
import { examProblem } from './exam'

const small = 'h-7 text-13'
const HEAD = [5, 4, 3, 2, 1, 0]
const Unit = ({ children }: { children: ReactNode }) => <span className="text-12 text-faint">{children}</span>
function Chips<T extends string | number>({ of, on, set }: { of: readonly (readonly [T, string])[]; on: T | undefined; set: (v: T | undefined) => void }) {
  return <>{of.map(([k, label]) => <Chip key={String(k)} data-chip on={on === k} onClick={() => set(on === k ? undefined : k)}>{label}</Chip>)}</>
}
const num = (n: number | null) => n ?? undefined
const half = (n: number | null) => n == null ? undefined : Math.round(n * 2) / 2

export function ExamCard({ q, set }: CardEditorProps) {
  const d = q as ExamData; const c = d.contractions; const problem = examProblem(d)
  return <div className="grid gap-1.5">
    <FormRow inline label="Cervix"><NumberInput label="Cervix" value={d.cervix} onValue={(n) => set({ cervix: half(n) })} className={cn(small, 'w-16')} /><Unit>cm, 0–10</Unit></FormRow>
    <FormRow inline label="Head"><Chips of={HEAD.map((n) => [n, `${n}/5`] as const)} on={d.descent} set={(descent) => set({ descent })} /></FormRow>
    <FormRow inline label="Position"><Chips of={POSITIONS} on={d.position} set={(position) => set({ position })} /></FormRow>
    <FormRow inline label="Liquor"><Chips of={LIQUOR.map(([k, label]) => [k, label] as const)} on={d.liquor} set={(liquor) => set({ liquor })} /></FormRow>
    <FormRow inline label="Moulding"><Chips of={MOULDING.map((m) => [m, m] as const)} on={d.moulding} set={(moulding) => set({ moulding })} /></FormRow>
    <FormRow inline label="Caput"><Chips of={CAPUT} on={d.caput} set={(caput) => set({ caput })} /></FormRow>
    <FormRow inline label="Contractions">
      <NumberInput label="Contractions in 10 min" integer value={c?.per_10} onValue={(n) => set({ contractions: n == null ? undefined : { per_10: n, ...(n > 0 && c?.seconds != null ? { seconds: c.seconds } : {}) } })} className={cn(small, 'w-14')} />
      <Unit>in 10 min</Unit>
      {c && c.per_10 > 0 && <><NumberInput label="Contraction length, seconds" integer value={c.seconds} onValue={(n) => set({ contractions: { per_10: c.per_10, ...(n != null ? { seconds: n } : {}) } })} className={cn(small, 'ms-2 w-14')} /><Unit>s</Unit></>}
    </FormRow>
    <FormRow inline label="G and P">
      <Unit>G</Unit><NumberInput label="Gravida" integer value={d.gravida} onValue={(n) => set({ gravida: num(n) })} className={cn(small, 'w-12')} />
      <Unit>P</Unit><NumberInput label="Para" integer value={d.para} onValue={(n) => set({ para: num(n) })} className={cn(small, 'w-12')} />
    </FormRow>
    {problem && <p role="alert" className="px-1 text-12 text-warn">{problem}</p>}
  </div>
}
