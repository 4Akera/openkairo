// The long note (chart-plan.md §2 #29, the composer's NoteDrawer moved): inline under the line, so the record panel stays in view
// (owner decision D7; a right drawer would now cover it). It opens from the composer's slot — a bare /note, a card's long note, a long
// draft's edit, the drawer command — with its kind and text; ⌘↵ adds it to the drafts (or saves the draft it edits), Esc closes.
import { useEffect, useRef, useState } from 'react'
import { X } from 'lucide-react'
import { useComposer, type LongNote as Note } from '../../../hooks/composer'
import { useDrafts } from '../../../hooks/drafts'
import { Button, Card, IconButton, Kbd, Select, Textarea } from '../../../ui'
import { NOTE_KINDS } from '../../visit/kinds'
import { DRAFT_LOOK } from '../blocks/env'
import { useChart } from '../context'

/** a template's headings left empty are not kept */
const tidy = (t: string) => t.replace(/^(S|O|A|P|History|Examination):[ \t]*$\n?/gm, '').trim()
const ADD = { visit: 'Add to this visit', stay: 'Add to this stay', record: 'Add' }

export function LongNote({ onClose }: { onClose: () => void }) {
  const note = useComposer((s) => s.longNote)
  // a patient's unfinished note never follows to the next one (the chart keys this per patient)
  useEffect(() => () => useComposer.getState().closeLongNote(), [])
  if (!note) return null
  return <Editor key={`${note.draftId ?? ''}|${note.kind}|${note.text}`} value={note} onClose={() => { useComposer.getState().closeLongNote(); onClose() }} />
}

function Editor({ value, onClose }: { value: Note; onClose: () => void }) {
  const c = useChart(); const [kind, setKind] = useState(value.kind); const [text, setText] = useState(value.text); const area = useRef<HTMLTextAreaElement>(null)
  // the caret after the first heading of a template ("S: |"), else at the end
  useEffect(() => { const el = area.current; if (!el) return; el.focus(); const at = el.value.indexOf(': '); const to = at >= 0 && !value.draftId ? at + 2 : el.value.length; el.setSelectionRange(to, to) }, []) // eslint-disable-line react-hooks/exhaustive-deps
  const ok = !!tidy(text)
  const add = () => {
    if (!ok) return
    const d = { function: 'note', kind: 'note', tag: `note:${kind}`, params: { kind, text: tidy(text) }, line: tidy(text) }
    if (value.draftId) useDrafts.getState().replace(c.patientId, value.draftId, d); else useDrafts.getState().add(c.patientId, { ...d, append: true })
    onClose()
  }
  return <Card role="group" aria-label="Long note" className={DRAFT_LOOK}
    onKeyDown={(e) => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); onClose() } else if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); add() } }}>
    <div className="flex items-center gap-2 border-b border-line px-3 py-2">
      <Select dense aria-label="Kind of note" value={kind} onChange={(e) => setKind(e.target.value)} className="w-56">{NOTE_KINDS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</Select>
      <span className="text-12 text-faint">{value.draftId ? 'Editing a draft' : 'A long note, signed with the others'}</span>
      <IconButton title="Close (Esc)" aria-label="Close the note" onClick={onClose} className="ms-auto"><X /></IconButton>
    </div>
    <div className="p-3"><Textarea ref={area} autoGrow minRows={8} maxRows={30} value={text} onChange={(e) => setText(e.target.value)} placeholder="Write the note…"
      className="min-h-40" aria-label="The note" /></div>
    <div className="flex items-center gap-2 border-t border-line px-3 py-2"><span className="text-11 text-faint"><Kbd>⌘↵</Kbd> add · <Kbd>esc</Kbd> close</span>
      <Button size="sm" variant="ghost" className="ms-auto" onClick={onClose}>Cancel</Button>
      <Button size="sm" disabled={!ok} onClick={add}>{value.draftId ? 'Save' : ADD[c.mode]}</Button></div>
  </Card>
}
