import { describe, it, expect } from 'vitest'
import {
  getBlockBillingStrategy,
  blockSupportsCustomBillingCapability,
  blockAllowsManualBlockFees,
  usesCustomChargeRules,
  getCustomChargeRules,
  blockDefinitionHasCharging,
  computeActiveRuleIdsForLabResult,
  computeActiveRuleIdsForRadiologyResult,
  partitionLabBillingRules,
  projectedLabBillingTotal,
  projectedRadiologyBillingTotal,
} from '../blockBilling'
import type { BlockChargeRule, BlockDefinition } from '../../types'

function def(billing?: Record<string, unknown>, extra?: Partial<BlockDefinition>): BlockDefinition {
  return {
    config: billing ? { billing } : {},
    service_item_id: null,
    ...extra,
  } as unknown as BlockDefinition
}

function rule(id: string, overrides: Partial<BlockChargeRule> = {}): BlockChargeRule {
  return {
    id,
    service_item_id: `svc-${id}`,
    match_panel_id: null,
    quantity: 1,
    ...overrides,
  } as BlockChargeRule
}

describe('getBlockBillingStrategy', () => {
  it('defaults to single_service', () => {
    expect(getBlockBillingStrategy(undefined)).toBe('single_service')
    expect(getBlockBillingStrategy(def())).toBe('single_service')
    expect(getBlockBillingStrategy(def({ strategy: 'bogus' }))).toBe('single_service')
  })

  it('returns custom_rules only when explicitly set', () => {
    expect(getBlockBillingStrategy(def({ strategy: 'custom_rules' }))).toBe('custom_rules')
  })
})

describe('usesCustomChargeRules', () => {
  const rules = [rule('a')]

  it('requires the custom_rules strategy', () => {
    expect(usesCustomChargeRules(def({ rules }))).toBe(false)
  })

  it('requires at least one rule', () => {
    expect(usesCustomChargeRules(def({ strategy: 'custom_rules', rules: [] }))).toBe(false)
  })

  it('is disabled when supports_custom_rules is explicitly false', () => {
    expect(usesCustomChargeRules(def({ strategy: 'custom_rules', rules, supports_custom_rules: false }))).toBe(false)
  })

  it('is enabled when supports_custom_rules is true', () => {
    expect(usesCustomChargeRules(def({ strategy: 'custom_rules', rules, supports_custom_rules: true }))).toBe(true)
  })

  it('legacy rows without supports_custom_rules still use their rules', () => {
    expect(usesCustomChargeRules(def({ strategy: 'custom_rules', rules }))).toBe(true)
  })
})

describe('getCustomChargeRules', () => {
  it('returns [] when custom rules are not active', () => {
    expect(getCustomChargeRules(def({ rules: [rule('a')] }))).toEqual([])
  })

  it('returns the rules when active', () => {
    const rules = [rule('a'), rule('b')]
    expect(getCustomChargeRules(def({ strategy: 'custom_rules', rules }))).toEqual(rules)
  })
})

describe('blockDefinitionHasCharging', () => {
  it('false for null / uncharged definitions', () => {
    expect(blockDefinitionHasCharging(null)).toBe(false)
    expect(blockDefinitionHasCharging(def())).toBe(false)
  })

  it('true with a single service item', () => {
    expect(blockDefinitionHasCharging(def(undefined, { service_item_id: 'svc-1' } as Partial<BlockDefinition>))).toBe(true)
  })

  it('true with active custom rules', () => {
    expect(blockDefinitionHasCharging(def({ strategy: 'custom_rules', rules: [rule('a')] }))).toBe(true)
  })

  it('true when manual block fees are allowed', () => {
    expect(blockDefinitionHasCharging(def({ allow_manual_block_fees: true }))).toBe(true)
  })
})

describe('capability flags', () => {
  it('blockSupportsCustomBillingCapability requires explicit true', () => {
    expect(blockSupportsCustomBillingCapability(def({ supports_custom_rules: true }))).toBe(true)
    expect(blockSupportsCustomBillingCapability(def({}))).toBe(false)
    expect(blockSupportsCustomBillingCapability(undefined)).toBe(false)
  })

  it('blockAllowsManualBlockFees requires explicit true', () => {
    expect(blockAllowsManualBlockFees(def({ allow_manual_block_fees: true }))).toBe(true)
    expect(blockAllowsManualBlockFees(def({}))).toBe(false)
  })
})

describe('computeActiveRuleIdsForLabResult', () => {
  const rules = [
    rule('cbc',   { match_panel_id: 'panel-cbc' }),
    rule('lipid', { match_panel_id: 'panel-lipid' }),
    rule('draw',  { match_panel_id: null }),
    rule('stat',  { match_panel_id: '  ' }),
  ]

  it('activates rules whose panel is selected', () => {
    expect(computeActiveRuleIdsForLabResult(['panel-cbc'], rules, undefined)).toEqual(['cbc'])
  })

  it('adds extra add-on rules only when they are not panel-linked', () => {
    const ids = computeActiveRuleIdsForLabResult(['panel-cbc'], rules, ['draw', 'lipid'])
    expect(ids.sort()).toEqual(['cbc', 'draw'])
  })

  it('treats whitespace-only match_panel_id as an add-on', () => {
    expect(computeActiveRuleIdsForLabResult([], rules, ['stat'])).toEqual(['stat'])
  })

  it('ignores unknown extra ids', () => {
    expect(computeActiveRuleIdsForLabResult([], rules, ['nope'])).toEqual([])
  })

  it('deduplicates', () => {
    const ids = computeActiveRuleIdsForLabResult(['panel-cbc'], rules, ['draw', 'draw'])
    expect(ids.sort()).toEqual(['cbc', 'draw'])
  })
})

describe('computeActiveRuleIdsForRadiologyResult', () => {
  const rules = [
    rule('cxr', { match_panel_id: 'study-cxr' }),
    rule('contrast', { match_panel_id: null }),
  ]

  it('matches selected studies and optional add-ons', () => {
    expect(computeActiveRuleIdsForRadiologyResult(['study-cxr'], rules, ['contrast']).sort())
      .toEqual(['contrast', 'cxr'])
  })
})

describe('partitionLabBillingRules', () => {
  it('splits panel-linked from add-on rules', () => {
    const linked = rule('a', { match_panel_id: 'p1' })
    const addOn = rule('b', { match_panel_id: null })
    const blank = rule('c', { match_panel_id: '   ' })
    expect(partitionLabBillingRules([linked, addOn, blank])).toEqual({
      panelLinked: [linked],
      addOnOnly: [addOn, blank],
    })
  })
})

describe('projected billing totals', () => {
  const prices = { 'svc-cbc': 10_000, 'svc-draw': 2_500 }
  const rules = [
    rule('cbc',  { match_panel_id: 'panel-cbc', service_item_id: 'svc-cbc', quantity: 2 }),
    rule('draw', { match_panel_id: null, service_item_id: 'svc-draw' }),
    rule('free', { match_panel_id: 'panel-cbc', service_item_id: '' }),
  ]

  it('sums unit price × quantity for active lab rules', () => {
    expect(projectedLabBillingTotal(rules, ['panel-cbc'], ['draw'], prices)).toBe(22_500)
  })

  it('skips rules without a service item and unknown prices default to 0', () => {
    const r = [rule('x', { match_panel_id: 'p', service_item_id: 'svc-unknown' })]
    expect(projectedLabBillingTotal(r, ['p'], undefined, {})).toBe(0)
  })

  it('clamps quantity to a minimum of 1 and floors fractions', () => {
    const r = [
      rule('a', { match_panel_id: 'p', service_item_id: 'svc-cbc', quantity: 0 }),
      rule('b', { match_panel_id: 'p', service_item_id: 'svc-draw', quantity: 2.9 }),
    ]
    expect(projectedLabBillingTotal(r, ['p'], undefined, prices)).toBe(10_000 + 5_000)
  })

  it('radiology total mirrors the lab computation', () => {
    const r = [rule('cxr', { match_panel_id: 'study-cxr', service_item_id: 'svc-cbc' })]
    expect(projectedRadiologyBillingTotal(r, ['study-cxr'], undefined, prices)).toBe(10_000)
  })
})
