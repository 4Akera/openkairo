// A department's packs and Screens line in Settings → Departments (spec/openCare.md §5.1 rules 1 and 6). Packs used here: the clinic's
// packs that are on, each ticked or not, with what it brings here (its screens; later its section, commands and banner words). The
// Screens line offers the base's screens of the department's work and those of the packs ticked here; a screen that stands in for a
// base one takes its place on the line.
import type { Department, Organization } from '../../db/types'
import { Chip, Fieldset, FormRow, Segmented } from '../../ui'
import { flipScreen, lineForPacks, screenChoices, type Declared } from '../line'

export type PacksDraft = { work: Department['work']; packs: string[]; screens: string[]; opens: string }
type Patch = Partial<Pick<PacksDraft, 'packs' | 'screens' | 'opens'>>

/** what a pack brings to a department of this work: its screens, and the base screen each stands in for */
const brings = (pack: string, work: Department['work'], declared: Declared[]) => {
  const name = (k: string) => declared.find((s) => s.key === k)?.labels.en ?? k
  const mine = declared.filter((s) => s.layer === pack && (s.work === work || s.work === 'any'))
  return mine.length ? mine.map((s) => `the ${name(s.key)} screen${s.replaces.length ? ` in place of ${s.replaces.map(name).join(', ')}` : ''}`).join('; ') : 'nothing for this kind of department yet'
}

export function PacksAndScreens({ org, d, set, changed }: { org: Organization; d: PacksDraft; set: (p: Patch) => void; changed: (k: 'packs' | 'screens' | 'opens') => boolean }) {
  const on = org.packs.filter((p) => p.enabled)
  const screenName = (k: string) => org.screens.find((s) => s.key === k)?.labels.en ?? `${k} (pack off)`
  // ticking brings the pack's screens onto the line; unticking takes them off (its entries stay)
  const tick = (key: string) => { const packs = d.packs.includes(key) ? d.packs.filter((p) => p !== key) : [...d.packs, key]
    const line = lineForPacks({ screens: d.screens, opens: d.opens }, d.work, org.screens, d.packs, packs)
    set({ packs, screens: line.screens, opens: line.opens ?? line.screens[0] }) }
  const choices = screenChoices(d.work, org.screens, d.packs, d.screens)
  const keys = [...choices.map((s) => s.key), ...d.screens.filter((k) => !choices.some((s) => s.key === k))]
  // at least one screen stays, and a ward's bed board always; the one it opens on is always among them
  const flip = (k: string) => { const line = flipScreen({ screens: d.screens, opens: d.opens }, k, org.screens, d.packs); if (line) set({ screens: line.screens, opens: line.opens ?? line.screens[0] }) }
  return <>
    {d.work !== 'outside' && <Fieldset title="Packs used here">
      <FormRow label="Packs" changed={changed('packs')} hint={on.length ? 'Only the packs ticked here show their screens, sections, commands and banner words in this department. Unticking keeps every entry.'
        : 'No pack is on for the clinic (Settings → Packs).'}>
        {on.length > 0 && <ul className="grid gap-1.5">{on.map((p) => <li key={p.key} className="flex flex-wrap items-baseline gap-2">
          <Chip variant="check" shape="pill" on={d.packs.includes(p.key)} onClick={() => tick(p.key)}>{p.name}</Chip>
          <span className="text-12 text-faint">brings {brings(p.key, d.work, org.screens)}</span></li>)}</ul>}
      </FormRow></Fieldset>}
    {keys.length > 0 && <Fieldset title="Screens">
      <FormRow label="Screens" changed={changed('screens')} hint="The tabs of the people who work here, in this order. A pack ticked here may add its own; at least one stays, and a ward keeps its bed board.">
        <div className="flex flex-wrap gap-1.5">{keys.map((k) => <Chip variant="check" shape="pill" key={k} on={d.screens.includes(k)} onClick={() => flip(k)}>{screenName(k)}</Chip>)}</div></FormRow>
      {d.screens.length > 1 && <FormRow label="Opens first" changed={changed('opens')} hint="The tab the department opens on.">
        <Segmented value={d.opens} onChange={(v) => set({ opens: v })} options={d.screens.map((k): [string, string] => [k, screenName(k)])} /></FormRow>}
    </Fieldset>}
  </>
}
