// A pack's own editor for one complex setting (spec/openCare.md §5.1 rule 7: a price list, a growth table): registered by the setting's
// key and drawn in place of the automatic form, inside the same card, with the same save, checks and history. The automatic form is
// the default.
import type { ComponentType } from 'react'
import type { SettingKey } from '../../../db/types'
import type { Errors, FormNode } from './model'

export interface SettingEditorProps {
  decl: SettingKey; nodes: FormNode[]                     // the key and the automatic form's nodes (its words, units and order)
  value: Record<string, unknown>; onChange: (v: Record<string, unknown>) => void
  errors: Errors; disabled: boolean                        // errors by the value's path ('' for the whole); disabled: may not change it here
}
const editors = new Map<string, ComponentType<SettingEditorProps>>()
export function registerSettingEditor(key: string, Editor: ComponentType<SettingEditorProps>) { editors.set(key, Editor) }
export const settingEditor = (key: string) => editors.get(key) ?? null
