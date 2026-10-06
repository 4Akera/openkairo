// A pack's settings (spec/openCare.md §5.1 rule 7), each drawn by its automatic form (or the pack's own editor) in a SettingCard:
// Settings → Packs → <pack> lists its clinic-wide ones; a department's card lists, for each pack ticked there, its per-department ones.
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { mayIn } from '../../db/views'
import type { Department, Organization } from '../../db/types'
import { Callout, Card, Empty, PageHead, Section } from '../../ui'
import { SettingCard } from './form/SettingCard'

const keysOf = (org: Organization, pack: string, form: 'pack' | 'department') => org.settingKeys.filter((k) => k.layer === pack && k.form === form)
/** whether a pack has any setting a form draws (its row in Settings → Packs links to its page) */
export const hasSettings = (org: Organization, pack: string) => org.settingKeys.some((k) => k.layer === pack && k.form !== null)

export function PackPage({ org }: { org: Organization }) {
  const { key = '' } = useParams(); const pack = org.packs.find((p) => p.key === key)
  const back = <Link to="/settings/packs" className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-12 text-muted transition-colors hover:bg-hover hover:text-fg focus-ring">
    <ArrowLeft aria-hidden className="size-3.5" />Packs</Link>
  if (!pack) return <><PageHead title="Pack" right={back} /><Card><Empty>No pack {key} is installed on this server.</Empty></Card></>
  const clinic = keysOf(org, key, 'pack'); const perDept = keysOf(org, key, 'department')
  const where = org.departments.filter((d) => d.packs.includes(key))
  const may = mayIn(org, 'manage:settings', null)
  return <div className="grid gap-4">
    <PageHead title={pack.name} right={back}
      hint="Its settings for the whole clinic. Each change holds from the moment it is saved; the earlier values stay in its history." />
    {!pack.enabled && <Callout tone="warn" title="Off for this clinic">Turn it on under Packs to change its settings. What was saved stays.</Callout>}
    {clinic.map((k) => <SettingCard key={k.key} org={org} decl={k} owner={org.organization.id} canEdit={pack.enabled && may}
      why={!pack.enabled ? 'the pack is off' : 'changing it needs Change settings in every department'} />)}
    {clinic.length === 0 && <Card><Empty>{pack.name} has no clinic-wide settings.</Empty></Card>}
    {perDept.length > 0 && <Section id={`pack.${key}.departments`} title="Set per department" count={where.length}
      summary={perDept.map((k) => k.labels.en ?? k.key).join(', ')}>
      <p className="text-14 text-muted">{perDept.map((k) => k.labels.en ?? k.key).join(', ')}: on the card of each department that uses {pack.name}
        {where.length ? <> ({where.map((d, i) => <span key={d.id}>{i > 0 && ', '}<Link className="rounded-sm text-accent hover:underline focus-ring" to="/settings/departments">{d.name}</Link></span>)}).</>
          : '. No department uses it yet: tick it under Departments → Packs used here.'}</p>
    </Section>}
  </div>
}

/** under a department's editor: a card for each pack it uses that has per-department settings */
export function PackCards({ org, dept }: { org: Organization; dept: Department }) {
  const may = mayIn(org, 'manage:settings', dept.id)
  return <>{dept.packs.map((p) => { const ks = keysOf(org, p, 'department'); const pack = org.packs.find((x) => x.key === p); const name = pack?.name ?? p
    if (!ks.length) return null
    const on = !!pack?.enabled
    return <div key={p} className="grid gap-3 border-t border-line bg-sunken px-4 py-4">
      <p className="text-11 font-semibold uppercase tracking-[0.08em] text-faint">{name} · {dept.name}</p>
      {ks.map((k) => <SettingCard key={k.key} org={org} decl={k} owner={dept.id} canEdit={on && may}
        why={!on ? 'the pack is off' : `changing it needs Change settings in ${dept.name}`} />)}
    </div> })}</>
}
