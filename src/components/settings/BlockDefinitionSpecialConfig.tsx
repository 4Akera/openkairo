import type { BlockDefinition } from '../../types'
import { resolveBillingSettingsUi } from './billing/BillingRulesEditors'
import { AlertTriangle } from 'lucide-react'

/** Charge rules editor from `config.billing.settings_ui` (registry). No fallback editor. */
export function BlockDefinitionSpecialConfig({
  form,
  set,
  allServiceItems,
}: {
  form: Partial<BlockDefinition>
  set: (patch: Partial<BlockDefinition>) => void
  allServiceItems?: { id: string; name: string; code: string; default_price: number }[]
  allDefs?: BlockDefinition[]
  slug?: string
}) {
  const strategy = form.config?.billing?.strategy
  if (strategy !== 'custom_rules') return null

  const rawKey = form.config?.billing?.settings_ui
  const { Editor, effectiveKey, problem } = resolveBillingSettingsUi(rawKey)

  return (
    <section className="space-y-3 rounded-lg border border-dashed border-primary/30 bg-primary/[0.03] p-3">
      <div>
        <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
          Custom charge rules
        </p>
        {Editor && (
          <p className="text-[10px] text-muted-foreground mt-0.5">
            Editor: <span className="font-mono text-foreground/90">{effectiveKey}</span>
          </p>
        )}
      </div>

      {problem === 'missing_key' && (
        <div className="flex gap-2 rounded-md border border-amber-200 bg-amber-50/80 dark:border-amber-900/50 dark:bg-amber-950/30 px-2.5 py-2 text-[11px] text-amber-900 dark:text-amber-200">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
          <p>
            No rules admin UI is selected on this block definition. Open Billing above, choose{' '}
            <span className="font-mono">lab_panels</span> or <span className="font-mono">radiology_studies</span>, and save.
          </p>
        </div>
      )}

      {problem === 'unknown_key' && (
        <div className="flex gap-2 rounded-md border border-destructive/30 bg-destructive/5 px-2.5 py-2 text-[11px] text-destructive">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
          <p>
            Billing settings UI <span className="font-mono">{rawKey?.trim()}</span> is not registered. Set <span className="font-mono">settings_ui</span> to{' '}
            <span className="font-mono">lab_panels</span>, <span className="font-mono">radiology_studies</span>, or add a new editor to the registry.
          </p>
        </div>
      )}

      {Editor && <Editor form={form} set={set} allServiceItems={allServiceItems} />}
    </section>
  )
}
