// One member of a family file (picture #family-folder): their name (it opens their chart), age, sex, how they are related, and what each
// is due — the words the packs this department uses would say on their banner (the core's banner words, so this pack never reads
// another's data), then the family checks due by age and sex. Their record is read as the chart reads it.
import { useNavigate } from 'react-router-dom'
import { usePackEntries } from '@core/hooks/chart'
import { useRecord } from '@core/hooks/reads'
import { useDepartment } from '@core/hooks/organization'
import { packWordsOf, wordDefs, wordTypes } from '@core/screens/chart/words'
import type { Department } from '@core/db/types'
import { TONE, cn } from '@core/ui'
import { checksFor, checksOf, dueWords, metOf, relationTo } from './checks'
import type { Member } from './data'

export function MemberRow({ m, dept, viewer, here }: { m: Member; dept: Department; viewer: string | null | undefined; here: boolean }) {
  const { org } = useDepartment(); const navigate = useNavigate()
  const r = useRecord(m.patient_id, dept.id); const packs = usePackEntries(m.patient_id, wordTypes())
  const p = r.data?.patient; const identity = r.data?.identity
  const words = r.data && identity ? packWordsOf(wordDefs(), { rec: r.data.server, ctx: { org, me: org?.me.id ?? '', departmentId: dept.id }, identity, packs: packs.data }, dept.packs.filter((x) => x !== 'familycare')) : null
  const checks = r.data ? checksFor(checksOf(org), { sex: p?.sex, born: p?.born_on }, metOf((r.data.server.tables['base.values']?.rows ?? []))) : []
  const said = [...(words ? [...words.shown, ...words.more] : []).map((w) => ({ word: w.word, tone: w.tone })), ...(dueWords(checks) ? [{ word: `${dueWords(checks)!} by age`, tone: 'warn' as const }] : [])]   // told apart from a condition's checks
  return <li className={cn('grid gap-0.5 py-1.5', here && 'rail ps-2')}>
    <p className="flex flex-wrap items-baseline gap-x-2"><button type="button" onClick={() => navigate(`/patient/${m.patient_id}`)} className="rounded-sm text-start font-medium text-accent hover:underline focus-ring">
      {p ? `${p.given_name} ${p.family_name}` : '…'}</button>
      {p && <span className="text-12 text-faint">{p.age} {p.sex[0]?.toUpperCase()}</span>}
      <span className="text-12 text-faint">{here ? 'here now' : relationTo(viewer, m.relation)}</span></p>
    {r.error ? <p className="text-12 text-faint">not readable here</p> : said.length > 0 ? <p className="text-12">{said.map((w, i) => <span key={i}>{i > 0 && <span className="text-faint"> · </span>}
      <span className={cn(w.tone ? TONE[w.tone].text : 'text-muted')}>{w.word}</span></span>)}</p> : r.data && <p className="text-12 text-ok">nothing due</p>}
  </li>
}
