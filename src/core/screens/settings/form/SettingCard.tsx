// One setting in its card (spec/openCare.md §5.1 rule 7): its form (the pack's own editor where it registered one, else the automatic
// form), Save through write_setting, who changed it last and when, and a History fold of the earlier values (the audit read), all in
// the page's flow. It takes effect from the moment it is saved; the card is drawn again from the value saved.
import { createElement, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { History } from 'lucide-react'
import { read, writeSetting } from '../../../db/rpc'
import { userName } from '../../../db/views'
import type { Organization, SettingKey } from '../../../db/types'
import type { SettingData } from '../../../db/shapes.generated'
import { Button, Card, Empty, SaveState, Spinner, dateTime } from '../../../ui'
import { useSave } from '../save'
import { AutoForm } from './AutoForm'
import { clean, errorsFrom, formOf, initialOf, placeErrors, summary, validate, type Errors, type FormNode } from './model'
import { settingEditor } from './registry'

/** a setting of one owner (the organization, or a department); canEdit: the user may change it here */
export function SettingCard({ org, decl, owner, canEdit, why }: { org: Organization; decl: SettingKey; owner: string; canEdit: boolean; why?: string }) {
  const saved = org.settings.find((s) => s.key === decl.key && s.thing_id === owner)
  // drawn again once the save is read back, so the form starts from what is saved now
  return <Card className="overflow-hidden"><Body key={saved?.recorded_at ?? 'unset'} org={org} decl={decl} owner={owner} canEdit={canEdit} why={why} /></Card>
}

function Body({ org, decl, owner, canEdit, why }: { org: Organization; decl: SettingKey; owner: string; canEdit: boolean; why?: string }) {
  const saved = org.settings.find((s) => s.key === decl.key && s.thing_id === owner)
  const nodes = useMemo(() => formOf(decl, org.datatypes), [decl, org.datatypes])
  const start = useMemo(() => initialOf(decl, saved?.data, org.datatypes), [decl, saved, org.datatypes])
  const [draft, setDraft] = useState<Record<string, unknown>>(start)
  const [errors, setErrors] = useState<Errors>({})
  const [history, setHistory] = useState(false)
  const [round, setRound] = useState(0)   // Undo draws the editor again, so a box's unread text goes too
  const save = useSave((data: Record<string, unknown>) => writeSetting({ key: decl.key as keyof SettingData, owner_id: owner, data: data as never }))
  const dirty = JSON.stringify(clean(draft)) !== JSON.stringify(clean(start))
  const Editor = settingEditor(decl.key) ?? AutoForm
  // each error where the form draws one (else over the Save), so a refusal is never silent
  const show = (e: Errors) => setErrors(placeErrors(nodes, e))
  const change = (v: Record<string, unknown>) => { setDraft(v); if (Object.keys(errors).length) show(validate(decl.shape, clean(v), org.datatypes)) }
  // the form's own check first (the same shape as the server's); then the server's refusal, next to the field it names
  const onSave = () => {
    const data = clean(draft) as Record<string, unknown>; const found = validate(decl.shape, data, org.datatypes)
    show(found); if (Object.keys(found).length) return
    save.mutate(data, { onError: (e) => show(errorsFrom(e)) })
  }
  const undo = () => { setDraft(start); setErrors({}); save.reset(); setRound(round + 1) }
  return <form onSubmit={(e) => { e.preventDefault(); if (dirty && canEdit) onSave() }}>
    <div className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-2.5">
      <span className="text-14 font-semibold text-fg">{decl.labels.en ?? decl.key}</span>
      <Button type="button" size="xs" variant="ghost" className="ms-auto" aria-expanded={history} onClick={() => setHistory(!history)}><History />History</Button>
    </div>
    <div className="grid gap-4 p-4">
      {/* the registry's (so drawn by createElement, never defined here) */}
      {createElement(Editor, { key: round, decl, nodes, value: draft, onChange: change, errors, disabled: !canEdit })}
      <div className="flex flex-wrap items-center gap-2 border-t border-line pt-3">
        <span className="text-12 text-faint">{saved ? <>Changed by {userName(org, saved.author_id) ?? 'someone'} · {dateTime(saved.recorded_at)}</> : 'Not set yet: the defaults hold.'}</span>
        {!canEdit && why && <span className="text-12 text-faint">· {why}</span>}
        <span className="ms-auto flex flex-wrap items-center gap-2">
          {errors[''] ? <span role="alert" className="text-12 text-danger">{errors['']}</span>
            : Object.keys(errors).length ? <span className="text-12 text-danger">Check the marked fields</span> : dirty ? <SaveState state="unsaved" /> : null}
          {canEdit && dirty && <Button type="button" size="sm" variant="ghost" onClick={undo}>Undo</Button>}
          {canEdit && <Button type="submit" size="sm" disabled={!dirty || save.isPending}>{save.isPending ? 'Saving…' : 'Save'}</Button>}
        </span>
      </div>
      {history && <Earlier org={org} decl={decl} owner={owner} nodes={nodes} />}
    </div>
  </form>
}

type Change = { id: string; at: string; action: string; user_id: string | null; before: Record<string, unknown> | null; after: Record<string, unknown> | null }
/** the setting's changes, newest first: when, who, and the value it was set to (a retire keeps the value it had) */
function Earlier({ org, decl, owner, nodes }: { org: Organization; decl: SettingKey; owner: string; nodes: FormNode[] }) {
  const q = useQuery({ queryKey: ['settings_changes', 'setting', decl.key, owner],
    queryFn: async () => (await read<{ changes: Change[] }>({ shape: 'audit', what: `setting:${decl.key}`, thing_id: owner, limit: 50 })).changes })
  if (q.isLoading) return <Spinner label="Reading the history" />
  if (q.error) return <p role="alert" className="text-12 text-danger">{q.error.message}</p>
  if (!q.data?.length) return <Empty size="sm">Never changed.</Empty>
  return <ol aria-label="History" className="grid gap-1 rounded-lg bg-sunken p-3 text-12">{q.data.map((c, i) =>
    <li key={c.id} className="grid gap-0.5 sm:grid-cols-[8.5rem_9rem_1fr] sm:gap-3">
      <span className="text-faint tnum">{dateTime(c.at)}</span>
      <span className="truncate text-muted">{userName(org, c.user_id) ?? '—'}</span>
      <span className="min-w-0 text-fg">{c.action === 'retire' ? 'Cleared' : summary(nodes, c.after)}{i === 0 && <span className="ms-2 text-faint">(now)</span>}</span>
    </li>)}</ol>
}
