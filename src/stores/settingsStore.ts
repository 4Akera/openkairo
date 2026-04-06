import { create } from 'zustand'
import { supabase } from '../lib/supabase'
import type { NameFormat } from '../types'

export type DateFormat = 'dd/mm/yyyy' | 'mm/dd/yyyy' | 'yyyy-mm-dd'
export type TimeFormat = '12h' | '24h'

interface SettingsState {
  nameFormat: NameFormat
  facilityName: string
  dateFormat: DateFormat
  timeFormat: TimeFormat
  billingEnabled: boolean
  currencySymbol: string
  fetchSettings: () => Promise<void>
  updateNameFormat: (format: NameFormat) => Promise<{ error: string | null }>
  updateFacilityName: (name: string) => Promise<{ error: string | null }>
  updateDateFormat: (format: DateFormat) => Promise<{ error: string | null }>
  updateTimeFormat: (format: TimeFormat) => Promise<{ error: string | null }>
  updateBillingEnabled: (enabled: boolean) => Promise<{ error: string | null }>
  updateCurrencySymbol: (symbol: string) => Promise<{ error: string | null }>
}

async function upsertSetting(key: string, value: string): Promise<{ error: string | null }> {
  const { error } = await supabase
    .from('app_settings')
    .upsert({ key, value }, { onConflict: 'key' })
  return { error: error ? error.message : null }
}

export const useSettingsStore = create<SettingsState>((set) => ({
  nameFormat: 'two',
  facilityName: '',
  dateFormat: 'dd/mm/yyyy',
  timeFormat: '24h',
  billingEnabled: false,
  currencySymbol: '$',

  fetchSettings: async () => {
    const { data } = await supabase
      .from('app_settings')
      .select('key, value')

    if (!data) return

    const find = (key: string) => data.find(r => r.key === key)?.value

    const nameFormat = find('name_format')
    if (nameFormat === 'two' || nameFormat === 'three') set({ nameFormat })

    const facilityName = find('facility_name')
    if (facilityName !== undefined) set({ facilityName: facilityName ?? '' })

    const dateFormat = find('date_format')
    if (dateFormat === 'dd/mm/yyyy' || dateFormat === 'mm/dd/yyyy' || dateFormat === 'yyyy-mm-dd') {
      set({ dateFormat })
    }

    const timeFormat = find('time_format')
    if (timeFormat === '12h' || timeFormat === '24h') set({ timeFormat })

    const billing = find('billing_enabled')
    if (billing !== undefined) set({ billingEnabled: billing === 'true' })

    const sym = find('currency')
    if (sym) set({ currencySymbol: sym })
  },

  updateNameFormat: async (format) => {
    const prev = useSettingsStore.getState().nameFormat
    set({ nameFormat: format })
    const result = await upsertSetting('name_format', format)
    if (result.error) set({ nameFormat: prev })
    return result
  },

  updateFacilityName: async (name) => {
    const prev = useSettingsStore.getState().facilityName
    set({ facilityName: name })
    const result = await upsertSetting('facility_name', name)
    if (result.error) set({ facilityName: prev })
    return result
  },

  updateDateFormat: async (format) => {
    const prev = useSettingsStore.getState().dateFormat
    set({ dateFormat: format })
    const result = await upsertSetting('date_format', format)
    if (result.error) set({ dateFormat: prev })
    return result
  },

  updateTimeFormat: async (format) => {
    const prev = useSettingsStore.getState().timeFormat
    set({ timeFormat: format })
    const result = await upsertSetting('time_format', format)
    if (result.error) set({ timeFormat: prev })
    return result
  },

  updateBillingEnabled: async (enabled) => {
    const prev = useSettingsStore.getState().billingEnabled
    set({ billingEnabled: enabled })
    const result = await upsertSetting('billing_enabled', String(enabled))
    if (result.error) set({ billingEnabled: prev })
    return result
  },

  updateCurrencySymbol: async (symbol) => {
    const prev = useSettingsStore.getState().currencySymbol
    set({ currencySymbol: symbol })
    const result = await upsertSetting('currency', symbol)
    if (result.error) set({ currencySymbol: prev })
    return result
  },
}))
