import { supabase } from './supabase'
import type { BlockChargeRule, BlockDefinition, Charge, LabResultContent, RadiologyResultContent } from '../types'

export function getBlockBillingStrategy(def: BlockDefinition | null | undefined): 'single_service' | 'custom_rules' {
  const s = def?.config?.billing?.strategy
  if (s === 'custom_rules') return 'custom_rules'
  return 'single_service'
}

/** Block definition explicitly allows the custom rules workflow in Settings. */
export function blockSupportsCustomBillingCapability(def: BlockDefinition | null | undefined): boolean {
  return def?.config?.billing?.supports_custom_rules === true
}

/** Timeline “Additional fees” panel (manual / catalogue lines) — only when enabled on the definition. */
export function blockAllowsManualBlockFees(def: BlockDefinition | null | undefined): boolean {
  return def?.config?.billing?.allow_manual_block_fees === true
}

export function usesCustomChargeRules(def: BlockDefinition | null | undefined): boolean {
  if (getBlockBillingStrategy(def) !== 'custom_rules') return false
  if ((def?.config?.billing?.rules?.length ?? 0) === 0) return false
  if (def?.config?.billing?.supports_custom_rules === false) return false
  if (def?.config?.billing?.supports_custom_rules === true) return true
  // Legacy rows (e.g. lab_result) with custom_rules before supports_custom_rules existed
  return true
}

export function getCustomChargeRules(def: BlockDefinition | null | undefined): BlockChargeRule[] {
  if (!usesCustomChargeRules(def)) return []
  return def!.config!.billing!.rules!
}

/** Block library “$ charged” badge: single service on add, active custom rules, and/or manual block fees. */
export function blockDefinitionHasCharging(def: BlockDefinition | null | undefined): boolean {
  if (!def) return false
  if (def.service_item_id) return true
  if (usesCustomChargeRules(def)) return true
  if (blockAllowsManualBlockFees(def)) return true
  return false
}

/** Rules tied to selected panels plus optional add-ons (rules without match_panel_id). */
export function computeActiveRuleIdsForLabResult(
  panels: string[],
  rules: BlockChargeRule[],
  extraRuleIds: string[] | undefined,
): string[] {
  const ids = new Set<string>()
  for (const r of rules) {
    const pid = r.match_panel_id?.trim()
    if (pid && panels.includes(pid)) ids.add(r.id)
  }
  for (const id of extraRuleIds ?? []) {
    const r = rules.find(x => x.id === id)
    if (r && !r.match_panel_id?.trim()) ids.add(id)
  }
  return [...ids]
}

export function partitionLabBillingRules(rules: BlockChargeRule[]) {
  const panelLinked = rules.filter(r => !!r.match_panel_id?.trim())
  const addOnOnly = rules.filter(r => !r.match_panel_id?.trim())
  return { panelLinked, addOnOnly }
}

/** Rules with `match_panel_id` set to a radiology catalog study id (`RADIOLOGY_STUDIES[].id`) vs add-ons. */
export function partitionRadiologyBillingRules(rules: BlockChargeRule[]) {
  const studyLinked = rules.filter(r => !!r.match_panel_id?.trim())
  const addOnOnly = rules.filter(r => !r.match_panel_id?.trim())
  return { studyLinked, addOnOnly }
}

/** Rules tied to selected catalog studies plus optional add-ons (rules without match_panel_id). */
export function computeActiveRuleIdsForRadiologyResult(
  studies: string[],
  rules: BlockChargeRule[],
  extraRuleIds: string[] | undefined,
): string[] {
  const ids = new Set<string>()
  for (const r of rules) {
    const sid = r.match_panel_id?.trim()
    if (sid && studies.includes(sid)) ids.add(r.id)
  }
  for (const id of extraRuleIds ?? []) {
    const r = rules.find(x => x.id === id)
    if (r && !r.match_panel_id?.trim()) ids.add(id)
  }
  return [...ids]
}

export function projectedRadiologyBillingTotal(
  rules: BlockChargeRule[],
  studies: string[],
  extraRuleIds: string[] | undefined,
  unitPriceByServiceId: Record<string, number>,
): number {
  const ids = computeActiveRuleIdsForRadiologyResult(studies, rules, extraRuleIds)
  let sum = 0
  for (const id of ids) {
    const r = rules.find(x => x.id === id)
    if (!r?.service_item_id) continue
    const unit = unitPriceByServiceId[r.service_item_id] ?? 0
    const qty = Math.max(1, Math.floor(r.quantity ?? 1))
    sum += unit * qty
  }
  return sum
}

/** Sum of unit_price × quantity for rules that would sync on save (panels + selected add-ons). */
export function projectedLabBillingTotal(
  rules: BlockChargeRule[],
  panels: string[],
  extraRuleIds: string[] | undefined,
  unitPriceByServiceId: Record<string, number>,
): number {
  const ids = computeActiveRuleIdsForLabResult(panels, rules, extraRuleIds)
  let sum = 0
  for (const id of ids) {
    const r = rules.find(x => x.id === id)
    if (!r?.service_item_id) continue
    const unit = unitPriceByServiceId[r.service_item_id] ?? 0
    const qty = Math.max(1, Math.floor(r.quantity ?? 1))
    sum += unit * qty
  }
  return sum
}

/** block_auto lines at or past billing approval — lab sync does not void or duplicate these */
const LAB_SYNC_FINALIZED_STATUSES: Charge['status'][] = [
  'pending',
  'pending_insurance',
  'invoiced',
  'paid',
]

function finalizedAutoChargeForService(
  rows: { service_item_id: string | null; status: string }[] | null | undefined,
  serviceItemId: string,
): boolean {
  return (rows ?? []).some(
    r =>
      r.service_item_id === serviceItemId &&
      LAB_SYNC_FINALIZED_STATUSES.includes(r.status as Charge['status']),
  )
}

/**
 * Syncs block_auto lab lines with the active rule set.
 * - Voids only not-yet-approved rows (`pending_approval`) so auto/approved lines are not wiped on save.
 * - Skips inserting when a finalized row already exists for that service (no duplicate on re-save).
 */
export async function syncLabResultBlockCharges(opts: {
  blockId: string
  patientId: string
  encounterId: string | null
  userId: string
  definition: BlockDefinition
  content: LabResultContent
}): Promise<Charge[]> {
  const rules = getCustomChargeRules(opts.definition)
  if (rules.length === 0) return []
  if (!opts.definition.charge_mode) return []

  const activeIds = computeActiveRuleIdsForLabResult(
    opts.content.panels,
    rules,
    opts.content.billing_extra_rule_ids,
  )

  await supabase
    .from('charges')
    .update({ status: 'void', voided_reason: 'Replaced by lab billing sync' })
    .eq('block_id', opts.blockId)
    .eq('source', 'block_auto')
    .eq('status', 'pending_approval')

  const { data: remainingAutoData } = await supabase
    .from('charges')
    .select('service_item_id, status')
    .eq('block_id', opts.blockId)
    .eq('source', 'block_auto')
    .not('status', 'in', '(void,waived)')

  const remainingAutoRows = [...(remainingAutoData ?? [])]

  if (activeIds.length === 0) return []

  const chargeStatus = opts.definition.charge_mode === 'confirm' ? 'pending_approval' : 'pending'
  const inserted: Charge[] = []
  const insertedServiceIds = new Set<string>()

  for (const ruleId of activeIds) {
    const rule = rules.find(r => r.id === ruleId)
    if (!rule) continue
    const { data: svc } = await supabase
      .from('service_items')
      .select('*')
      .eq('id', rule.service_item_id)
      .single()
    if (!svc) continue

    if (finalizedAutoChargeForService(remainingAutoRows, svc.id)) continue
    if (insertedServiceIds.has(svc.id)) continue

    const qty = Math.max(1, Math.floor(rule.quantity ?? 1))
    const { data: row } = await supabase
      .from('charges')
      .insert({
        patient_id: opts.patientId,
        encounter_id: opts.encounterId,
        block_id: opts.blockId,
        service_item_id: svc.id,
        description: rule.label?.trim() || svc.name,
        quantity: qty,
        unit_price: svc.default_price,
        status: chargeStatus,
        source: 'block_auto',
        created_by: opts.userId,
      })
      .select()
      .single()

    if (row) {
      inserted.push(row as Charge)
      insertedServiceIds.add(svc.id)
      remainingAutoRows.push({ service_item_id: svc.id, status: chargeStatus })
    }
  }

  return inserted
}

/**
 * Syncs block_auto radiology lines with the active rule set (catalog study ids in `match_panel_id`).
 * Same behaviour as lab sync: voids pending_approval auto rows, respects finalized lines per service.
 */
export async function syncRadiologyResultBlockCharges(opts: {
  blockId: string
  patientId: string
  encounterId: string | null
  userId: string
  definition: BlockDefinition
  content: RadiologyResultContent
}): Promise<Charge[]> {
  const rules = getCustomChargeRules(opts.definition)
  if (rules.length === 0) return []
  if (!opts.definition.charge_mode) return []

  const activeIds = computeActiveRuleIdsForRadiologyResult(
    opts.content.studies,
    rules,
    opts.content.billing_extra_rule_ids,
  )

  await supabase
    .from('charges')
    .update({ status: 'void', voided_reason: 'Replaced by radiology billing sync' })
    .eq('block_id', opts.blockId)
    .eq('source', 'block_auto')
    .eq('status', 'pending_approval')

  const { data: remainingAutoData } = await supabase
    .from('charges')
    .select('service_item_id, status')
    .eq('block_id', opts.blockId)
    .eq('source', 'block_auto')
    .not('status', 'in', '(void,waived)')

  const remainingAutoRows = [...(remainingAutoData ?? [])]

  if (activeIds.length === 0) return []

  const chargeStatus = opts.definition.charge_mode === 'confirm' ? 'pending_approval' : 'pending'
  const inserted: Charge[] = []
  const insertedServiceIds = new Set<string>()

  for (const ruleId of activeIds) {
    const rule = rules.find(r => r.id === ruleId)
    if (!rule) continue
    const { data: svc } = await supabase
      .from('service_items')
      .select('*')
      .eq('id', rule.service_item_id)
      .single()
    if (!svc) continue

    if (finalizedAutoChargeForService(remainingAutoRows, svc.id)) continue
    if (insertedServiceIds.has(svc.id)) continue

    const qty = Math.max(1, Math.floor(rule.quantity ?? 1))
    const { data: row } = await supabase
      .from('charges')
      .insert({
        patient_id: opts.patientId,
        encounter_id: opts.encounterId,
        block_id: opts.blockId,
        service_item_id: svc.id,
        description: rule.label?.trim() || svc.name,
        quantity: qty,
        unit_price: svc.default_price,
        status: chargeStatus,
        source: 'block_auto',
        created_by: opts.userId,
      })
      .select()
      .single()

    if (row) {
      inserted.push(row as Charge)
      insertedServiceIds.add(svc.id)
      remainingAutoRows.push({ service_item_id: svc.id, status: chargeStatus })
    }
  }

  return inserted
}

export async function fetchActiveChargesForBlock(blockId: string): Promise<Charge[]> {
  const { data } = await supabase
    .from('charges')
    .select('id, block_id, description, quantity, unit_price, status, source, created_by')
    .eq('block_id', blockId)
    .not('status', 'in', '(void,waived)')
    .order('created_at', { ascending: true })
  return (data ?? []) as Charge[]
}
