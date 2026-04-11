import { create } from 'zustand'
import { supabase } from '../lib/supabase'
import type {
  ServiceItem,
  InsuranceProvider,
  Charge,
  Payment,
  PatientDeposit,
  Invoice,
  PatientInsurance,
  PatientBalance,
} from '../types'

interface BillingState {
  // Service item catalog
  serviceItems: ServiceItem[]
  loadingItems: boolean
  fetchServiceItems: () => Promise<void>

  insuranceProviders: InsuranceProvider[]
  loadingInsuranceProviders: boolean
  fetchInsuranceProviders: () => Promise<void>

  // Per-patient billing state
  charges: Charge[]
  payments: Payment[]
  deposits: PatientDeposit[]
  invoices: Invoice[]
  insurance: PatientInsurance[]
  balance: PatientBalance | null
  loadingPatient: boolean
  fetchPatientBilling: (patientId: string) => Promise<void>

  // Encounter-scoped charges
  encounterCharges: Charge[]
  fetchEncounterCharges: (encounterId: string) => Promise<void>

  // Mutations
  addCharge: (charge: {
    patient_id: string
    encounter_id?: string | null
    block_id?: string | null
    service_item_id?: string | null
    description: string
    quantity?: number
    unit_price: number
    status?: string
    source?: string
  }) => Promise<Charge | null>

  voidCharge: (chargeId: string, reason: string) => Promise<boolean>
  approveCharge: (chargeId: string) => Promise<boolean>
  fileInsuranceClaim: (
    chargeIds: string[],
    params: {
      coverageType: 'full' | 'percentage' | 'fixed'
      coveragePercent?: number   // insurer's % (e.g. 80 means insurer pays 80%)
      coverageAmount?: number    // insurer's fixed amount
      payerName: string
    }
  ) => Promise<boolean>

  addPayment: (payment: {
    patient_id: string
    invoice_id?: string | null
    amount: number
    method: string
    reference?: string
    payer_name?: string
    notes?: string
    chargeIds?: string[]
    chargesTotal?: number  // total of selected charges; if > amount → create remaining charge
  }) => Promise<boolean>

  addDeposit: (deposit: {
    patient_id: string
    amount: number
    method?: string
    reference?: string
    notes?: string
  }) => Promise<boolean>

  // Insurance CRUD
  upsertInsurance: (ins: Partial<import('../types').PatientInsurance> & { patient_id: string; payer_name: string }) => Promise<boolean>
  deleteInsurance: (id: string) => Promise<boolean>

  // Service item CRUD
  upsertServiceItem: (item: Partial<ServiceItem> & { code: string; name: string; default_price: number }) => Promise<boolean>
  deleteServiceItem: (id: string) => Promise<boolean>

  upsertInsuranceProvider: (
    row: Partial<InsuranceProvider> & { name: string },
  ) => Promise<boolean>
  deleteInsuranceProvider: (id: string) => Promise<boolean>
}

export const useBillingStore = create<BillingState>((set, get) => ({
  serviceItems: [],
  loadingItems: false,
  insuranceProviders: [],
  loadingInsuranceProviders: false,
  charges: [],
  payments: [],
  deposits: [],
  invoices: [],
  insurance: [],
  balance: null,
  loadingPatient: false,
  encounterCharges: [],

  fetchServiceItems: async () => {
    set({ loadingItems: true })
    const { data } = await supabase
      .from('service_items')
      .select('*')
      .order('sort_order')
    set({ serviceItems: (data ?? []) as ServiceItem[], loadingItems: false })
  },

  fetchInsuranceProviders: async () => {
    set({ loadingInsuranceProviders: true })
    const { data } = await supabase
      .from('insurance_providers')
      .select('*')
      .order('sort_order')
      .order('name')
    set({
      insuranceProviders: (data ?? []) as InsuranceProvider[],
      loadingInsuranceProviders: false,
    })
  },

  fetchPatientBilling: async (patientId) => {
    set({ loadingPatient: true })
    const [chargesRes, paymentsRes, depositsRes, invoicesRes, insuranceRes, balanceRes] = await Promise.all([
      supabase.from('charges').select('*').eq('patient_id', patientId).order('created_at', { ascending: false }),
      supabase.from('payments').select('*').eq('patient_id', patientId).order('created_at', { ascending: false }),
      supabase.from('patient_deposits').select('*').eq('patient_id', patientId).order('created_at', { ascending: false }),
      supabase.from('invoices').select('*').eq('patient_id', patientId).order('created_at', { ascending: false }),
      supabase.from('patient_insurance').select('*').eq('patient_id', patientId).order('created_at', { ascending: false }),
      supabase.from('patient_balance').select('*').eq('patient_id', patientId).maybeSingle(),
    ])
    set({
      charges: (chargesRes.data ?? []) as Charge[],
      payments: (paymentsRes.data ?? []) as Payment[],
      deposits: (depositsRes.data ?? []) as PatientDeposit[],
      invoices: (invoicesRes.data ?? []) as Invoice[],
      insurance: (insuranceRes.data ?? []) as PatientInsurance[],
      balance: (balanceRes.data as PatientBalance) ?? null,
      loadingPatient: false,
    })
  },

  fetchEncounterCharges: async (encounterId) => {
    const { data } = await supabase
      .from('charges')
      .select('*')
      .eq('encounter_id', encounterId)
      .order('created_at', { ascending: true })
    set({ encounterCharges: (data ?? []) as Charge[] })
  },

  addCharge: async (charge) => {
    const user = (await supabase.auth.getUser()).data.user
    if (!user) return null
    const { data, error } = await supabase
      .from('charges')
      .insert({
        patient_id: charge.patient_id,
        encounter_id: charge.encounter_id ?? null,
        block_id: charge.block_id ?? null,
        service_item_id: charge.service_item_id ?? null,
        description: charge.description,
        quantity: charge.quantity ?? 1,
        unit_price: charge.unit_price,
        status: charge.status ?? 'pending',
        source: charge.source ?? 'manual',
        created_by: user.id,
      })
      .select()
      .single()
    if (error || !data) return null
    const newCharge = data as Charge
    set((s) => ({ charges: [newCharge, ...s.charges], encounterCharges: [...s.encounterCharges, newCharge] }))
    return newCharge
  },

  voidCharge: async (chargeId, reason) => {
    const { error } = await supabase
      .from('charges')
      .update({ status: 'void', voided_reason: reason })
      .eq('id', chargeId)
    if (error) return false
    const updateStatus = (list: Charge[]) =>
      list.map((c) => c.id === chargeId ? { ...c, status: 'void' as const, voided_reason: reason } : c)
    set((s) => ({
      charges: updateStatus(s.charges),
      encounterCharges: updateStatus(s.encounterCharges),
    }))
    return true
  },

  approveCharge: async (chargeId) => {
    const { error } = await supabase
      .from('charges')
      .update({ status: 'pending' })
      .eq('id', chargeId)
      .eq('status', 'pending_approval')
    if (error) return false
    const updateStatus = (list: Charge[]) =>
      list.map((c) => c.id === chargeId ? { ...c, status: 'pending' as const } : c)
    set((s) => ({
      charges: updateStatus(s.charges),
      encounterCharges: updateStatus(s.encounterCharges),
    }))
    return true
  },

  fileInsuranceClaim: async (chargeIds, params) => {
    const user = (await supabase.auth.getUser()).data.user
    if (!user) return false

    const { data: chargesData } = await supabase
      .from('charges')
      .select('*')
      .in('id', chargeIds)
    if (!chargesData || chargesData.length === 0) return false

    for (const charge of chargesData as Charge[]) {
      const totalAmount = charge.quantity * charge.unit_price

      let insurerOwes  = 0
      let patientOwes  = totalAmount

      if (params.coverageType === 'full') {
        insurerOwes = totalAmount
        patientOwes = 0
      } else if (params.coverageType === 'percentage' && params.coveragePercent != null) {
        insurerOwes = Math.round(totalAmount * (params.coveragePercent / 100) * 100) / 100
        patientOwes = Math.round((totalAmount - insurerOwes) * 100) / 100
      } else if (params.coverageType === 'fixed' && params.coverageAmount != null) {
        insurerOwes = Math.min(params.coverageAmount, totalAmount)
        patientOwes = Math.round((totalAmount - insurerOwes) * 100) / 100
      }

      if (patientOwes > 0 && insurerOwes > 0) {
        // Partial: update original → patient portion, insert insurance charge
        await Promise.all([
          supabase.from('charges')
            .update({ unit_price: patientOwes, quantity: 1 })
            .eq('id', charge.id),
          supabase.from('charges').insert({
            patient_id:      charge.patient_id,
            encounter_id:    charge.encounter_id,
            block_id:        charge.block_id,
            service_item_id: charge.service_item_id,
            description:     `${charge.description} (Insurance — ${params.payerName})`,
            quantity:        1,
            unit_price:      insurerOwes,
            status:          'pending_insurance',
            source:          charge.source,
            created_by:      user.id,
          }),
        ])
      } else if (insurerOwes > 0 && patientOwes === 0) {
        // Full coverage: move whole charge to pending_insurance
        await supabase.from('charges')
          .update({ status: 'pending_insurance' })
          .eq('id', charge.id)
      }
    }

    return true
  },

  addPayment: async (payment) => {
    const user = (await supabase.auth.getUser()).data.user
    if (!user) return false

    if (payment.method === 'deposit') {
      const { error } = await supabase.rpc('record_payment_from_deposit', {
        p_patient_id: payment.patient_id,
        p_amount: payment.amount,
        p_invoice_id: payment.invoice_id ?? null,
        p_reference: payment.reference ?? null,
        p_payer_name: payment.payer_name ?? null,
        p_notes: payment.notes ?? null,
      })
      if (error) return false
    } else {
      const { error } = await supabase
        .from('payments')
        .insert({
          patient_id:  payment.patient_id,
          invoice_id:  payment.invoice_id ?? null,
          amount:      payment.amount,
          method:      payment.method,
          reference:   payment.reference ?? null,
          payer_name:  payment.payer_name ?? null,
          notes:       payment.notes ?? null,
          received_by: user.id,
        })
      if (error) return false
    }

    // Mark selected charges as paid
    if (payment.chargeIds && payment.chargeIds.length > 0) {
      await supabase
        .from('charges')
        .update({ status: 'paid' })
        .in('id', payment.chargeIds)
      set((s) => ({
        charges: s.charges.map(c =>
          payment.chargeIds!.includes(c.id) ? { ...c, status: 'paid' as const } : c
        ),
        encounterCharges: s.encounterCharges.map(c =>
          payment.chargeIds!.includes(c.id) ? { ...c, status: 'paid' as const } : c
        ),
      }))

      // If partial payment, create a remaining balance charge
      const chargesTotal = payment.chargesTotal ?? 0
      const remaining    = Math.round((chargesTotal - payment.amount) * 100) / 100
      if (remaining > 0.009) {
        const firstCharge = get().charges.find(c => payment.chargeIds!.includes(c.id))
        if (firstCharge) {
          await supabase.from('charges').insert({
            patient_id:   payment.patient_id,
            encounter_id: firstCharge.encounter_id,
            description:  'Remaining balance',
            quantity:     1,
            unit_price:   remaining,
            status:       'pending',
            source:       'manual',
            created_by:   (await supabase.auth.getUser()).data.user?.id ?? null,
          })
        }
      }
    }

    return true
  },

  addDeposit: async (deposit) => {
    const user = (await supabase.auth.getUser()).data.user
    if (!user) return false
    const { error } = await supabase
      .from('patient_deposits')
      .insert({
        patient_id: deposit.patient_id,
        amount: deposit.amount,
        remaining: deposit.amount,
        method: deposit.method ?? null,
        reference: deposit.reference ?? null,
        notes: deposit.notes ?? null,
        received_by: user.id,
      })
    return !error
  },

  upsertServiceItem: async (item) => {
    const user = (await supabase.auth.getUser()).data.user
    if (!user) return false
    if (item.id) {
      const { error } = await supabase
        .from('service_items')
        .update({
          code: item.code,
          name: item.name,
          category: item.category ?? null,
          default_price: item.default_price,
          active: item.active ?? true,
          sort_order: item.sort_order ?? 0,
        })
        .eq('id', item.id)
      if (error) return false
    } else {
      const { error } = await supabase
        .from('service_items')
        .insert({
          code: item.code,
          name: item.name,
          category: item.category ?? null,
          default_price: item.default_price,
          active: item.active ?? true,
          sort_order: item.sort_order ?? 0,
          created_by: user.id,
        })
      if (error) return false
    }
    await get().fetchServiceItems()
    return true
  },

  deleteServiceItem: async (id) => {
    const { error } = await supabase.from('service_items').delete().eq('id', id)
    if (error) return false
    set((s) => ({ serviceItems: s.serviceItems.filter((i) => i.id !== id) }))
    return true
  },

  upsertInsuranceProvider: async (row) => {
    if (row.id) {
      const { error } = await supabase
        .from('insurance_providers')
        .update({
          name: row.name.trim(),
          default_copay_percent: row.default_copay_percent ?? null,
          default_coverage_limit: row.default_coverage_limit ?? null,
          active: row.active ?? true,
          sort_order: row.sort_order ?? 0,
        })
        .eq('id', row.id)
      if (error) return false
    } else {
      const { error } = await supabase.from('insurance_providers').insert({
        name: row.name.trim(),
        default_copay_percent: row.default_copay_percent ?? null,
        default_coverage_limit: row.default_coverage_limit ?? null,
        active: row.active ?? true,
        sort_order: row.sort_order ?? 0,
      })
      if (error) return false
    }
    await get().fetchInsuranceProviders()
    return true
  },

  deleteInsuranceProvider: async (id) => {
    const { error } = await supabase.from('insurance_providers').delete().eq('id', id)
    if (error) return false
    set((s) => ({
      insuranceProviders: s.insuranceProviders.filter((p) => p.id !== id),
    }))
    return true
  },

  upsertInsurance: async (ins) => {
    if (ins.id) {
      const { error } = await supabase
        .from('patient_insurance')
        .update({
          payer_name:     ins.payer_name,
          policy_number:  ins.policy_number ?? null,
          copay_percent:  ins.copay_percent ?? null,
          coverage_limit: ins.coverage_limit ?? null,
          is_active:      ins.is_active ?? true,
          valid_from:     ins.valid_from ?? null,
          valid_to:       ins.valid_to ?? null,
        })
        .eq('id', ins.id)
      if (error) return false
    } else {
      const { error } = await supabase
        .from('patient_insurance')
        .insert({
          patient_id:     ins.patient_id,
          payer_name:     ins.payer_name,
          policy_number:  ins.policy_number ?? null,
          copay_percent:  ins.copay_percent ?? null,
          coverage_limit: ins.coverage_limit ?? null,
          is_active:      ins.is_active ?? true,
          valid_from:     ins.valid_from ?? null,
          valid_to:       ins.valid_to ?? null,
        })
      if (error) return false
    }
    return true
  },

  deleteInsurance: async (id) => {
    const { error } = await supabase.from('patient_insurance').delete().eq('id', id)
    return !error
  },
}))
