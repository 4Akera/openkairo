// /design · Components, the patient and the editing parts: the banner (full and compact), the one patient row every list uses,
// the patient's line, and the settings rows that open their editor under them. All of it Demo Patient; nothing is saved.
import { useState } from 'react'
import { TriangleAlert } from 'lucide-react'
import { Badge, Banner, Button, DeleteButton, EditPanel, Field, Fieldset, FormRow, Input, ListRow, ListSection, NewCard, PatientLine, RetireButton, Row, SaveState, Segmented, Chip, Tag } from '../../ui'
import { Group, Sample } from './Frame'
import { FREQUENCIES, PATIENT, PATIENT_SUB, QUEUE } from './fixtures'

const noop = () => {}

export function Rows() {
  const [folded, setFolded] = useState(false); const [open, setOpen] = useState<string | null>('fever'); const [name, setName] = useState('Fever clinic'); const [freq, setFreq] = useState('bid')
  const [urgent, setUrgent] = useState<'routine' | 'urgent'>('routine'); const [more, setMore] = useState(false)
  const dirty = name !== 'Fever clinic'
  return <>
    <Group title="The patient" hint="the banner: the chart's zones split by thin lines — who · where · safety · this department's words, +n opening a second line (full); the bench and the desk (compact)">
      <div className="-mx-4 overflow-hidden border-y border-line">
        <Banner sticky={false} name={`${PATIENT.given_name} ${PATIENT.family_name}`} sub="58 y · F · #10001" back={{ label: 'Back to the queue', onClick: noop }}
          zones={[{ key: 'where', label: 'Where', node: <span className="text-13 text-accent">In consult · follow-up · 6 min</span> },
            { key: 'safety', label: 'Safety', node: <><Badge tone="danger" icon={TriangleAlert}>Penicillin</Badge><Badge tone="warn" icon={TriangleAlert}>Fall risk</Badge><Badge tone="info">Pregnant · 24 wk</Badge></> },
            { key: 'packs', label: 'This department', node: <><Tag>1 to collect</Tag><Tag>Chronic care due</Tag>
              <button type="button" aria-expanded={more} onClick={() => setMore(!more)} className="rounded-full px-1.5 text-12 font-medium text-accent hover:bg-hover focus-ring">{more ? 'Fewer' : '+1'}</button></> }]}
          second={more && <Tag>Growth due</Tag>}
          actions={<><Button size="sm" variant="outline">Return to waiting</Button><Button size="sm">Done → next</Button></>} />
      </div>
      <Banner size="compact" name={`${PATIENT.given_name} ${PATIENT.family_name}`} sub={PATIENT_SUB} flags={<span className="text-12 text-faint">No known allergies</span>}
        actions={<Button size="sm" variant="outline">Open the record</Button>} />
      <Sample title="PatientLine" note="search and new patient"><PatientLine p={PATIENT} /><PatientLine p={{ ...PATIENT, record_number: 10004, given_name: 'Example', family_name: 'Elder', sex: 'male', age: 81, phone_text: null, died_on: '2026-01-01' }} /></Sample>
    </Group>
    <Group title="The patient row" hint="number · name · age · what is happening · who or where · waiting (30 min warn, 60 min danger); next is accent, the arrows' row has the rail" className="gap-0 p-0">
      <div className="overflow-x-auto"><ul className="min-w-[40rem]">
        <ListSection title="Waiting" count={3}>{QUEUE.slice(0, 3).map((q) => <ListRow key={q.number} number={q.number} name={q.name} age={q.age} status={q.status} who={q.who} minutes={q.minutes} next={q.next} selected={q.selected} enter={q.enter} onOpen={noop} />)}</ListSection>
        <ListSection title="Left" count={1} folded={folded} onToggle={() => setFolded(!folded)}>{QUEUE.slice(3).map((q) => <ListRow key={q.number} number={q.number} name={q.name} age={q.age} status={q.status} minutes={q.minutes} muted
          actions={<Button size="xs" variant="outline">Bring back</Button>} />)}</ListSection>
      </ul></div>
    </Group>
    <Group title="Editing" hint="a row opens its editor right under it; ⌘S saves, esc closes; a dot marks what is not saved" className="gap-0 p-0">
      <ul className="divide-y divide-line">
        <Row open={open === 'fever'} onToggle={() => setOpen(open === 'fever' ? null : 'fever')} editor={() => <EditPanel dirty={dirty} saving={false} error={null} onSave={() => setName('Fever clinic')} onCancel={() => setOpen(null)}
          aside={<DeleteButton what="Fever clinic" onDelete={noop} />}>
          <FormRow label="Name" hint="what the desk and the lists call it" changed={dirty}><Input value={name} onChange={(e) => setName(e.target.value)} className="max-w-sm" /></FormRow>
          <FormRow label="Priority"><Segmented aria-label="Priority" value={urgent} onChange={setUrgent} options={[['routine', 'Routine'], ['urgent', 'Urgent']]} /></FormRow>
        </EditPanel>}><span className="font-medium text-fg">{name}</span><span className="text-12 text-faint">General Practice · 3 services</span></Row>
        <Row open={open === 'ward'} onToggle={() => setOpen(open === 'ward' ? null : 'ward')} editor={() => <EditPanel dirty={false} saving={false} error={new Error('This department still has patients in beds.')} onSave={noop} onCancel={() => setOpen(null)}
          aside={<RetireButton what="Medical Ward" onRetire={noop} />}><p className="text-14 text-muted">An editor with an error from the server.</p></EditPanel>}><span className="font-medium text-fg">Medical Ward</span><span className="text-12 text-faint">8 beds</span></Row>
        <Row open={false} muted onToggle={noop}><span>Old clinic</span><span className="text-12">retired</span></Row>
      </ul>
      <div className="grid gap-4 border-t border-line p-4">
        <NewCard title="New department"><div className="grid gap-3 p-4"><Field label="Name"><Input placeholder="Cardiology" /></Field></div></NewCard>
        <Fieldset title="A group of settings"><FormRow label="Frequency" inline>{FREQUENCIES.map(([k, l]) => <Chip key={k} on={freq === k} onClick={() => setFreq(k)}>{l}</Chip>)}</FormRow>
          <FormRow label="Duration" inline><Input dense className="w-20 tnum" defaultValue="30" /><span className="text-12 text-faint">days</span></FormRow></Fieldset>
        <div className="flex flex-wrap items-center gap-4"><SaveState state="unsaved" /><SaveState state="saved" /></div>
      </div>
    </Group>
  </>
}
