// /design · Components, the frames: sections (open, folded, compact, needing attention, a list), the page head, toolbars, tabs,
// side-navigation links, the chart's split (in a box narrower than 1100 px, so its tabs show) and the header menu.
import { useState } from 'react'
import { Activity, Check, ChevronDown, FileText, LogOut, Palette, Settings } from 'lucide-react'
import { Button, Menu, MenuItem, MenuLabel, MenuSeparator, NavItem, PageHead, Section, SplitPane, Stat, Tabs, ThemeToggle, Toolbar } from '../../ui'
import { Group, Sample } from './Frame'
import { useColumn } from './live'
import { PATIENT, WEIGHT } from './fixtures'

type Kind = 'all' | 'notes' | 'results' | 'medicines'
const KINDS: { id: Kind; label: string; count: number }[] = [{ id: 'all', label: 'All', count: 14 }, { id: 'notes', label: 'Notes', count: 5 }, { id: 'results', label: 'Results', count: 6 }, { id: 'medicines', label: 'Medicines', count: 3 }]
const noop = () => {}

export function Layout() {
  const { root } = useColumn()
  const [line, setLine] = useState<'active' | 'past'>('active'); const [kind, setKind] = useState<Kind>('all'); const [chosen, setChosen] = useState('')
  return <>
    <Group title="Sections" hint="a titled panel that folds (remembered in this browser), and still says what is inside while folded">
      <div className="grid items-start gap-3 lg:grid-cols-2">
        <Section id="design.sample.open" title="The clinic" count={3} right={<Button size="xs" variant="ghost">Edit</Button>}><p className="text-14 text-muted">A panel, open: its body is padded.</p></Section>
        <Section id="design.sample.folded" start={false} title="Recent changes" summary="the last 30 changes, newest first"><p className="text-14 text-muted">Folded at first.</p></Section>
        <Section variant="compact" title="Medicines" count={2}><p className="text-13 text-fg">Metformin 500 mg · twice a day</p><p className="text-13 text-fg">Amlodipine 5 mg · once a day</p></Section>
        <Section tone="attention" title="Needs attention" count={1}><p className="text-14 text-muted">A warn edge: something here waits on you.</p></Section>
      </div>
      <Section flush title="A list" count={3}><ul className="divide-y divide-line text-14">{['Laboratory', 'Radiology', 'Pharmacy'].map((d) => <li key={d} className="px-4 py-2 text-fg">{d}</li>)}</ul></Section>
    </Group>
    <Group title="Page, toolbars, tabs and navigation">
      <Sample title="PageHead" className="block"><PageHead title="Services" hint="What each department does, and what it asks for." right={<Button size="sm">New service</Button>} className="mb-0" /></Sample>
      <Sample title="Toolbar" note="in the flow, and stuck to the top of its region (the bottom one is fixed to the window, so it is not drawn here)" className="block">
        <Toolbar><Button size="sm" variant="outline">Release 3</Button><Button size="sm" variant="ghost">Clear</Button><span className="ms-auto text-12 text-faint">3 values entered</span></Toolbar>
        <div className="mt-2 overflow-hidden rounded-lg ring-1 ring-inset ring-line"><Toolbar position="top"><span className="text-13 font-medium text-fg">This visit</span><Button size="xs" variant="ghost">Whole record</Button></Toolbar>
          <p className="px-4 py-3 text-13 text-muted">The region under the bar.</p></div>
      </Sample>
      <Sample title="Tabs" note="line · pill with counts; ←/→ Home End move" className="grid gap-3">
        <Tabs aria-label="Problems" value={line} onChange={setLine} tabs={[{ id: 'active', label: 'Active', count: 3 }, { id: 'past', label: 'Past', count: 1 }]} />
        <Tabs aria-label="Kind" variant="pill" value={kind} onChange={setKind} tabs={KINDS} />
      </Sample>
      <Sample title="NavItem" note="the current page is marked" className="grid w-full max-w-60 gap-0.5">
        <NavItem to="/design/components" icon={Palette}>Components</NavItem><NavItem to="/design/charts" icon={Activity} count={3}>Charts</NavItem>
      </Sample>
    </Group>
    <Group title="The chart's split" hint="SplitPane answers to its own width: under 1100 px it shows two tabs, and both panes stay mounted">
      <div className="max-w-[900px] rounded-lg bg-canvas py-3 ring-1 ring-inset ring-line">
        <SplitPane mainTab="This visit · 2 drafts" asideTab="Record · 1 to review"
          main={<Section variant="compact" title="This visit"><p className="text-13 text-fg">Progress note · cough for three days, chest clear.</p><p className="text-13 text-muted">Draft: paracetamol 1 g when needed.</p></Section>}
          aside={<Section variant="compact" title="Summary"><Stat size="sm" label="Weight" value={80.4} unit="kg" previous={{ value: 81.2, at: WEIGHT[2].at }} trend={WEIGHT} /></Section>} />
      </div>
    </Group>
    <Group title="Menu" hint="the header's menus only (department, user); entry aids never open over the record">
      <Sample title="Menu" note="click it; it opens in this column's theme">
        <Menu container={root} trigger={<Button variant="outline" size="sm">{PATIENT.given_name} {PATIENT.family_name}<ChevronDown className="size-3.5 text-faint" /></Button>}>
          <MenuLabel>Theme</MenuLabel><ThemeToggle variant="menu" /><MenuSeparator />
          <MenuItem icon={Palette} hint="the tokens, the kit and these samples" onSelect={() => setChosen('Design system')}>Design system</MenuItem>
          <MenuItem icon={Settings} onSelect={() => setChosen('Settings')}>Settings</MenuItem>
          <MenuItem icon={FileText} onSelect={noop} hint="a hint says what it does">With a hint</MenuItem><MenuSeparator />
          <MenuItem icon={LogOut} tone="danger" onSelect={() => setChosen('Sign out (not really)')}>Sign out</MenuItem>
        </Menu>
        {chosen && <span className="inline-flex items-center gap-1 text-12 text-ok"><Check aria-hidden className="size-3.5" />Chose {chosen}</span>}
      </Sample>
    </Group>
  </>
}
