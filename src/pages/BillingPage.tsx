import { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { useAuthStore } from '../stores/authStore'
import { useSettingsStore } from '../stores/settingsStore'
import { useBillingStore } from '../stores/billingStore'
import type { Patient, Charge, PatientInsurance } from '../types'
import { fullName, formatDateTime, cn } from '../lib/utils'
import {
  Button, Input, Badge, Label,
  Dialog, DialogContent, DialogHeader, DialogTitle,
  ScrollArea,
} from '../components/ui'
import {
  Search, Loader2, DollarSign, Receipt, CreditCard, Plus, XCircle,
  Check, ArrowLeft, TrendingUp, TrendingDown, Wallet, Ban, CheckCircle2,
  Clock, Pencil, Trash2, ShieldCheck, Printer,
} from 'lucide-react'

// ── Status display maps ──────────────────────────────────────────────────────

export const CHARGE_STATUS_COLORS: Record<string, string> = {
  pending:            'bg-emerald-100 text-emerald-800 border-emerald-300',
  pending_approval:   'bg-blue-100 text-blue-800 border-blue-300',
  pending_insurance:  'bg-purple-100 text-purple-800 border-purple-300',
  invoiced:           'bg-indigo-100 text-indigo-800 border-indigo-300',
  paid:               'bg-green-100 text-green-800 border-green-300',
  waived:             'bg-slate-100 text-slate-600 border-slate-300',
  void:               'bg-red-100 text-red-700 border-red-300',
}

export const CHARGE_STATUS_LABELS: Record<string, string> = {
  pending:            'Pending Payment',
  pending_approval:   'Pending Approval',
  pending_insurance:  'Insurance',
  invoiced:           'Invoiced',
  paid:               'Paid',
  waived:             'Waived',
  void:               'Cancelled',
}

const PAYMENT_METHODS = [
  { value: 'cash',          label: 'Cash' },
  { value: 'card',          label: 'Card' },
  { value: 'mobile_money',  label: 'Mobile Money' },
  { value: 'insurance',     label: 'Insurance' },
  { value: 'bank_transfer', label: 'Bank Transfer' },
  { value: 'deposit',       label: 'Deposit' },
] as const

// ── Main component ───────────────────────────────────────────────────────────

export default function BillingPage() {
  const { user, can } = useAuthStore()
  const { nameFormat, currencySymbol } = useSettingsStore()
  const {
    serviceItems, fetchServiceItems,
    charges, payments, deposits, insurance, balance,
    loadingPatient, fetchPatientBilling,
    addCharge, voidCharge, approveCharge, fileInsuranceClaim,
    addPayment, addDeposit,
    upsertInsurance, deleteInsurance,
  } = useBillingStore()

  // ── Patient search ──────────────────────────────────────────────────────
  const [query, setQuery]               = useState('')
  const [searchResults, setSearchResults] = useState<Patient[]>([])
  const [searching, setSearching]       = useState(false)
  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null)

  // Recent charges list
  const [recentChargeRows, setRecentChargeRows] = useState<{
    patient: Pick<Patient, 'id' | 'first_name' | 'last_name' | 'mrn'>
    lastCharge: { description: string; status: string; amount: number; created_at: string }
  }[]>([])
  const [loadingRecent, setLoadingRecent] = useState(true)

  useEffect(() => {
    setLoadingRecent(true)
    supabase
      .from('charges')
      .select('id, description, status, unit_price, quantity, created_at, patient_id, patients(id, first_name, last_name, mrn)')
      .not('status', 'in', '(void)')
      .order('created_at', { ascending: false })
      .limit(30)
      .then(({ data }) => {
        if (!data) { setLoadingRecent(false); return }
        const seen = new Set<string>()
        const rows: typeof recentChargeRows = []
        for (const row of data as any[]) {
          if (!row.patients || seen.has(row.patient_id)) continue
          seen.add(row.patient_id)
          rows.push({
            patient: row.patients,
            lastCharge: { description: row.description, status: row.status, amount: row.quantity * row.unit_price, created_at: row.created_at },
          })
          if (rows.length >= 8) break
        }
        setRecentChargeRows(rows)
        setLoadingRecent(false)
      })
  }, [])

  // ── Dialogs state ───────────────────────────────────────────────────────
  const [chargeOpen, setChargeOpen]   = useState(false)
  const [paymentOpen, setPaymentOpen] = useState(false)
  const [depositOpen, setDepositOpen] = useState(false)
  const [voidOpen, setVoidOpen]       = useState<Charge | null>(null)
  const [voidReason, setVoidReason]   = useState('')
  const [saving, setSaving]           = useState(false)
  const [approvingId, setApprovingId] = useState<string | null>(null)

  // Insurance claim dialog
  const [claimOpen, setClaimOpen]             = useState(false)
  const [claimChargeIds, setClaimChargeIds]   = useState<string[]>([])
  const [claimType, setClaimType]             = useState<'full' | 'percentage' | 'fixed'>('percentage')
  const [claimPercent, setClaimPercent]       = useState('')
  const [claimFixed, setClaimFixed]           = useState('')
  const [claimPayer, setClaimPayer]           = useState('')
  const [claimSaving, setClaimSaving]         = useState(false)

  // Insurance management
  const [insOpen, setInsOpen]     = useState(false)
  const [insEdit, setInsEdit]     = useState<Partial<PatientInsurance> | null>(null)
  const [insPayer, setInsPayer]   = useState('')
  const [insPolicy, setInsPolicy] = useState('')
  const [insCopay, setInsCopay]   = useState('')
  const [insLimit, setInsLimit]   = useState('')
  const [insFrom, setInsFrom]     = useState('')
  const [insTo, setInsTo]         = useState('')
  const [insActive, setInsActive] = useState(true)

  // Charge selection for payment
  const [selectedChargeIds, setSelectedChargeIds] = useState<Set<string>>(new Set())

  // Payment form
  const [payAmount, setPayAmount] = useState('')
  const [payMethod, setPayMethod] = useState('cash')
  const [payRef, setPayRef]       = useState('')
  const [payPayer, setPayPayer]   = useState('')
  const [payNotes, setPayNotes]   = useState('')

  // Receipt state
  const [receiptOpen, setReceiptOpen] = useState(false)
  const [receiptData, setReceiptData] = useState<{
    patient: Patient
    chargesPaid: Charge[]
    payment: { amount: number; method: string; reference: string; payer_name: string }
  } | null>(null)
  const printRef = useRef<HTMLDivElement>(null)

  // Deposit form
  const [depAmount, setDepAmount] = useState('')
  const [depMethod, setDepMethod] = useState('cash')
  const [depRef, setDepRef]       = useState('')
  const [depNotes, setDepNotes]   = useState('')

  // Charge form
  const [chargeMode, setChargeMode]         = useState<'service' | 'custom'>('service')
  const [selectedServiceId, setSelectedServiceId] = useState('')
  const [chargeDesc, setChargeDesc]         = useState('')
  const [chargeQty, setChargeQty]           = useState(1)
  const [chargePrice, setChargePrice]       = useState('')

  useEffect(() => { fetchServiceItems() }, [fetchServiceItems])

  const handleSearch = useCallback(async () => {
    const q = query.trim()
    if (!q) { setSearchResults([]); return }
    setSearching(true)
    const tokens = q.split(/\s+/).filter(Boolean)
    const { data } = await supabase.rpc('search_patients', { p_tokens: tokens, p_limit: 20 })
    setSearchResults((data ?? []) as Patient[])
    setSearching(false)
  }, [query])

  useEffect(() => {
    const t = setTimeout(handleSearch, 300)
    return () => clearTimeout(t)
  }, [handleSearch])

  const selectPatient = (pt: Patient) => {
    setSelectedPatient(pt)
    setSearchResults([])
    setQuery('')
    setSelectedChargeIds(new Set())
    fetchPatientBilling(pt.id)
  }

  // ── Handlers ───────────────────────────────────────────────────────────

  const handleAddCharge = async () => {
    if (!selectedPatient) return
    setSaving(true)
    const svc = chargeMode === 'service' ? serviceItems.find(s => s.id === selectedServiceId) : null
    await addCharge({
      patient_id:      selectedPatient.id,
      service_item_id: svc?.id ?? null,
      description:     svc ? svc.name : chargeDesc,
      quantity:        chargeQty,
      unit_price:      svc ? svc.default_price : parseFloat(chargePrice) || 0,
      source:          'manual',
    })
    setSaving(false)
    setChargeOpen(false)
    fetchPatientBilling(selectedPatient.id)
  }

  const handleVoid = async () => {
    if (!voidOpen || !selectedPatient) return
    setSaving(true)
    await voidCharge(voidOpen.id, voidReason)
    setSaving(false)
    setVoidOpen(null)
    setVoidReason('')
    fetchPatientBilling(selectedPatient.id)
  }

  const handleApprove = async (chargeId: string) => {
    if (!selectedPatient) return
    setApprovingId(chargeId)
    await approveCharge(chargeId)
    setApprovingId(null)
    fetchPatientBilling(selectedPatient.id)
  }

  const openClaimDialog = (ids: string[]) => {
    setClaimChargeIds(ids)
    // Pre-fill payer from active insurance if available
    setClaimPayer(activeInsurance?.payer_name ?? '')
    // Pre-fill percentage from active insurance copay if available
    // copay_percent is patient's %, so insurer pays (100 - copay_percent)
    const insurerPct = activeInsurance?.copay_percent != null
      ? String(100 - activeInsurance.copay_percent)
      : ''
    setClaimPercent(insurerPct)
    setClaimFixed('')
    setClaimType(activeInsurance?.copay_percent != null ? 'percentage' : 'full')
    setClaimOpen(true)
  }

  const handleSubmitClaim = async () => {
    if (!selectedPatient || claimChargeIds.length === 0) return
    setClaimSaving(true)
    await fileInsuranceClaim(claimChargeIds, {
      coverageType:    claimType,
      coveragePercent: claimType === 'percentage' ? parseFloat(claimPercent) || 0 : undefined,
      coverageAmount:  claimType === 'fixed'      ? parseFloat(claimFixed)   || 0 : undefined,
      payerName:       claimPayer || 'Insurance',
    })
    setClaimSaving(false)
    setClaimOpen(false)
    setClaimChargeIds([])
    setSelectedChargeIds(new Set())
    fetchPatientBilling(selectedPatient.id)
  }

  const toggleChargeSelect = (id: string, eligible: boolean) => {
    if (!eligible) return
    setSelectedChargeIds(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const selectedTotal = charges
    .filter(c => selectedChargeIds.has(c.id))
    .reduce((sum, c) => sum + c.quantity * c.unit_price, 0)

  const handleOpenPayment = () => {
    // Pre-fill amount from selected charges if any
    setPayAmount(selectedChargeIds.size > 0 ? selectedTotal.toFixed(2) : '')
    setPayMethod('cash')
    setPayRef('')
    setPayPayer('')
    setPayNotes('')
    setPaymentOpen(true)
  }

  const handlePayment = async () => {
    if (!selectedPatient) return
    setSaving(true)
    const chargesPaidNow = charges.filter(c => selectedChargeIds.has(c.id))
    await addPayment({
      patient_id:    selectedPatient.id,
      amount:        parseFloat(payAmount) || 0,
      method:        payMethod,
      reference:     payRef || undefined,
      payer_name:    payPayer || undefined,
      notes:         payNotes || undefined,
      chargeIds:     chargesPaidNow.length > 0 ? chargesPaidNow.map(c => c.id) : undefined,
      chargesTotal:  chargesPaidNow.length > 0 ? selectedTotal : undefined,
    })
    setSaving(false)
    setPaymentOpen(false)
    setSelectedChargeIds(new Set())

    // Show receipt if there were charges paid
    if (chargesPaidNow.length > 0) {
      setReceiptData({
        patient: selectedPatient,
        chargesPaid: chargesPaidNow,
        payment: { amount: parseFloat(payAmount) || 0, method: payMethod, reference: payRef, payer_name: payPayer },
      })
      setReceiptOpen(true)
    }

    fetchPatientBilling(selectedPatient.id)
  }

  const handleDeposit = async () => {
    if (!selectedPatient) return
    setSaving(true)
    await addDeposit({
      patient_id: selectedPatient.id,
      amount:     parseFloat(depAmount) || 0,
      method:     depMethod || undefined,
      reference:  depRef || undefined,
      notes:      depNotes || undefined,
    })
    setSaving(false)
    setDepositOpen(false)
    fetchPatientBilling(selectedPatient.id)
  }

  const openInsForm = (ins?: PatientInsurance) => {
    setInsEdit(ins ?? null)
    setInsPayer(ins?.payer_name ?? '')
    setInsPolicy(ins?.policy_number ?? '')
    setInsCopay(ins?.copay_percent != null ? String(ins.copay_percent) : '')
    setInsLimit(ins?.coverage_limit != null ? String(ins.coverage_limit) : '')
    setInsFrom(ins?.valid_from ?? '')
    setInsTo(ins?.valid_to ?? '')
    setInsActive(ins?.is_active ?? true)
    setInsOpen(true)
  }

  const handleSaveInsurance = async () => {
    if (!selectedPatient || !insPayer.trim()) return
    setSaving(true)
    await upsertInsurance({
      id:             insEdit?.id,
      patient_id:     selectedPatient.id,
      payer_name:     insPayer.trim(),
      policy_number:  insPolicy || undefined,
      copay_percent:  insCopay ? parseFloat(insCopay) : undefined,
      coverage_limit: insLimit ? parseFloat(insLimit) : undefined,
      valid_from:     insFrom || undefined,
      valid_to:       insTo   || undefined,
      is_active:      insActive,
    })
    setSaving(false)
    setInsOpen(false)
    fetchPatientBilling(selectedPatient.id)
  }

  const handleDeleteInsurance = async (id: string) => {
    if (!selectedPatient || !confirm('Remove this insurance record?')) return
    await deleteInsurance(id)
    fetchPatientBilling(selectedPatient.id)
  }

  const handlePrint = () => {
    window.print()
  }

  // Active insurance for claim button
  const activeInsurance = insurance.find(i => i.is_active)

  const canCharge = can('billing.charge')
  const canPay    = can('billing.payment')

  // Charges eligible for selection (pending payment or pending_insurance)
  const selectableStatuses = new Set(['pending', 'pending_insurance'])

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Header */}
      <header className="border-b bg-card px-4 sm:px-6 py-3 flex items-center gap-3 shrink-0">
        {selectedPatient ? (
          <>
            <Button variant="ghost" size="icon" className="shrink-0" onClick={() => setSelectedPatient(null)}>
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-sm shrink-0">
              {selectedPatient.first_name[0]}{selectedPatient.last_name[0]}
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold truncate">{fullName(selectedPatient, nameFormat)}</p>
              <p className="text-xs text-muted-foreground font-mono">{selectedPatient.mrn}</p>
            </div>
          </>
        ) : (
          <>
            <Receipt className="h-5 w-5 text-primary shrink-0" />
            <h1 className="text-sm font-semibold">Billing</h1>
          </>
        )}
      </header>

      {!selectedPatient ? (
        /* ── Search view ── */
        <div className="flex-1 overflow-auto p-4 sm:p-6">
          <div className="max-w-lg mx-auto space-y-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder="Search patient by name, MRN, or phone…"
                className="pl-10"
                autoFocus
              />
              {searching && <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />}
            </div>

            {searchResults.length > 0 && (
              <div className="border rounded-lg divide-y overflow-hidden">
                {searchResults.map(pt => (
                  <button
                    key={pt.id}
                    onClick={() => selectPatient(pt)}
                    className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-accent/50 transition-colors"
                  >
                    <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-xs shrink-0">
                      {pt.first_name[0]}{pt.last_name[0]}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium truncate">{fullName(pt, nameFormat)}</p>
                      <p className="text-xs text-muted-foreground font-mono">{pt.mrn}</p>
                    </div>
                  </button>
                ))}
              </div>
            )}

            {query && !searching && searchResults.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-8">No patients found</p>
            )}

            {!query && (
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Recent Charges</p>
                </div>
                {loadingRecent ? (
                  <div className="flex justify-center py-6"><Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /></div>
                ) : recentChargeRows.length === 0 ? (
                  <div className="text-center py-12 text-muted-foreground space-y-2">
                    <DollarSign className="h-8 w-8 mx-auto opacity-20" />
                    <p className="text-sm">No charges yet</p>
                  </div>
                ) : (
                  <div className="border rounded-lg divide-y overflow-hidden">
                    {recentChargeRows.map(({ patient, lastCharge }) => (
                      <button
                        key={patient.id}
                        onClick={() => selectPatient(patient as Patient)}
                        className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-accent/50 transition-colors"
                      >
                        <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-xs shrink-0">
                          {patient.first_name[0]}{patient.last_name[0]}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium truncate">{patient.first_name} {patient.last_name}</p>
                          <p className="text-[11px] text-muted-foreground truncate">{patient.mrn} · {lastCharge.description}</p>
                        </div>
                        <div className="text-right shrink-0 space-y-0.5">
                          <p className="text-sm font-mono font-medium">{lastCharge.amount.toFixed(2)}</p>
                          <Badge variant="outline" className={cn('text-[9px] py-0 px-1.5', CHARGE_STATUS_COLORS[lastCharge.status])}>
                            {CHARGE_STATUS_LABELS[lastCharge.status] ?? lastCharge.status}
                          </Badge>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      ) : (
        /* ── Patient billing detail ── */
        <ScrollArea className="flex-1">
          <div className="p-4 sm:p-6 max-w-3xl mx-auto space-y-6">
            {loadingPatient ? (
              <div className="flex justify-center py-12"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
            ) : (
              <>
                {/* Balance cards */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <BalanceCard label="Total Charges" value={balance?.total_charges ?? 0} icon={TrendingUp} color="text-amber-600" symbol={currencySymbol} />
                  <BalanceCard label="Total Paid"    value={balance?.total_payments ?? 0} icon={TrendingDown} color="text-green-600" symbol={currencySymbol} />
                  <BalanceCard label="Deposits"      value={balance?.deposit_balance ?? 0} icon={Wallet} color="text-blue-600" symbol={currencySymbol} />
                  <BalanceCard
                    label="Balance"
                    value={balance?.balance ?? 0}
                    icon={DollarSign}
                    color={(balance?.balance ?? 0) > 0 ? 'text-red-600' : 'text-green-600'}
                    bold
                    symbol={currencySymbol}
                  />
                </div>

                {/* Insurance section */}
                <div className="border rounded-lg overflow-hidden">
                  <div className="flex items-center justify-between px-3 py-2 bg-muted/30 border-b">
                    <div className="flex items-center gap-2">
                      <ShieldCheck className="h-3.5 w-3.5 text-muted-foreground" />
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Insurance</p>
                    </div>
                    {canPay && (
                      <Button size="sm" variant="ghost" className="h-6 text-xs gap-1" onClick={() => openInsForm()}>
                        <Plus className="h-3 w-3" /> Add
                      </Button>
                    )}
                  </div>
                  {insurance.length === 0 ? (
                    <p className="text-xs text-muted-foreground text-center py-4">No insurance on file</p>
                  ) : (
                    <div className="divide-y">
                      {insurance.map(ins => (
                        <div key={ins.id} className={cn('flex items-center gap-2 px-3 py-2', !ins.is_active && 'opacity-50')}>
                          <CreditCard className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-sm font-medium">{ins.payer_name}</span>
                              {ins.policy_number && <span className="text-xs text-muted-foreground">#{ins.policy_number}</span>}
                              {!ins.is_active && <Badge variant="muted" className="text-[9px] py-0">Inactive</Badge>}
                            </div>
                            <div className="flex items-center gap-3 mt-0.5">
                              {ins.copay_percent != null && (
                                <span className="text-[11px] text-muted-foreground">{ins.copay_percent}% patient copay</span>
                              )}
                              {ins.coverage_limit != null && (
                                <span className="text-[11px] text-muted-foreground">limit: {ins.coverage_limit.toFixed(2)}</span>
                              )}
                              {ins.valid_to && (
                                <span className="text-[11px] text-muted-foreground">exp: {ins.valid_to}</span>
                              )}
                            </div>
                          </div>
                          {canPay && (
                            <div className="flex items-center gap-1 shrink-0">
                              <Button variant="ghost" size="icon-sm" className="h-6 w-6" onClick={() => openInsForm(ins)}>
                                <Pencil className="h-3 w-3" />
                              </Button>
                              <Button variant="ghost" size="icon-sm" className="h-6 w-6 text-destructive hover:text-destructive" onClick={() => handleDeleteInsurance(ins.id)}>
                                <Trash2 className="h-3 w-3" />
                              </Button>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Action buttons */}
                <div className="flex flex-wrap gap-2">
                  {canCharge && (
                    <Button size="sm" onClick={() => {
                      setChargeMode('service')
                      setSelectedServiceId(serviceItems[0]?.id ?? '')
                      setChargeDesc('')
                      setChargeQty(1)
                      setChargePrice('')
                      setChargeOpen(true)
                    }}>
                      <Plus className="h-3.5 w-3.5" /> Add Charge
                    </Button>
                  )}
                  {canPay && (
                    <>
                      <Button
                        size="sm"
                        variant={selectedChargeIds.size > 0 ? 'default' : 'outline'}
                        onClick={handleOpenPayment}
                      >
                        <DollarSign className="h-3.5 w-3.5" />
                        {selectedChargeIds.size > 0
                          ? `Pay Selected (${selectedTotal.toFixed(2)})`
                          : 'Record Payment'}
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => {
                        setDepAmount('')
                        setDepMethod('cash')
                        setDepRef('')
                        setDepNotes('')
                        setDepositOpen(true)
                      }}>
                        <Wallet className="h-3.5 w-3.5" /> Accept Deposit
                      </Button>
                    </>
                  )}
                  {/* Bulk file insurance — only when pending charges selected and insurance exists */}
                  {canCharge && selectedChargeIds.size > 0 && insurance.some(i => i.is_active) &&
                    [...selectedChargeIds].every(id => {
                      const c = charges.find(x => x.id === id)
                      return c?.status === 'pending'
                    }) && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="border-purple-300 text-purple-700 hover:bg-purple-50 dark:border-purple-700 dark:text-purple-400"
                      onClick={() => openClaimDialog([...selectedChargeIds])}
                    >
                      <ShieldCheck className="h-3.5 w-3.5" />
                      File Insurance ({selectedChargeIds.size})
                    </Button>
                  )}
                </div>

                {/* Charges list */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                      Charges ({charges.length})
                    </p>
                    {selectedChargeIds.size > 0 && (
                      <button
                        type="button"
                        className="text-[11px] text-muted-foreground hover:text-foreground"
                        onClick={() => setSelectedChargeIds(new Set())}
                      >
                        Clear selection
                      </button>
                    )}
                  </div>
                  {charges.length === 0 ? (
                    <p className="text-sm text-muted-foreground py-4 text-center border border-dashed rounded-lg">No charges</p>
                  ) : (
                    <div className="border rounded-lg divide-y overflow-hidden">
                      {charges.map(c => {
                        const isSelectable = selectableStatuses.has(c.status)
                        const isSelected   = selectedChargeIds.has(c.id)
                        return (
                          <div
                            key={c.id}
                            className={cn(
                              'flex items-center gap-2 px-3 py-2 text-sm transition-colors',
                              isSelectable && canPay && 'cursor-pointer hover:bg-accent/30',
                              isSelected && 'bg-primary/5',
                            )}
                            onClick={() => canPay && toggleChargeSelect(c.id, isSelectable)}
                          >
                            {/* Checkbox */}
                            {canPay && (
                              <div className={cn(
                                'h-4 w-4 rounded border shrink-0 flex items-center justify-center transition-colors',
                                isSelectable
                                  ? isSelected
                                    ? 'border-primary bg-primary text-white'
                                    : 'border-border bg-background'
                                  : 'border-transparent',
                              )}>
                                {isSelected && <Check className="h-2.5 w-2.5" />}
                              </div>
                            )}

                            <div className="flex-1 min-w-0">
                              <p className={cn('font-medium truncate', c.status === 'void' && 'line-through text-muted-foreground')}>
                                {c.description}
                              </p>
                              <p className="text-[11px] text-muted-foreground">
                                {formatDateTime(c.created_at)}
                                {c.source !== 'manual' && <span className="ml-1 opacity-60">· {c.source.replace('_', ' ')}</span>}
                              </p>
                            </div>

                            <Badge variant="outline" className={cn('text-[10px] shrink-0', CHARGE_STATUS_COLORS[c.status])}>
                              {CHARGE_STATUS_LABELS[c.status] ?? c.status}
                            </Badge>

                            <p className={cn('text-sm font-mono shrink-0 w-16 text-right', c.status === 'void' && 'line-through text-muted-foreground')}>
                              {(c.quantity * c.unit_price).toFixed(2)}
                            </p>

                            {/* Action buttons */}
                            <div className="flex items-center gap-1 shrink-0" onClick={e => e.stopPropagation()}>
                              {/* Approve */}
                              {c.status === 'pending_approval' && canCharge && (
                                <button
                                  type="button"
                                  onClick={() => handleApprove(c.id)}
                                  disabled={approvingId === c.id}
                                  title="Approve charge"
                                  className={cn(
                                    'h-6 w-6 rounded-full flex items-center justify-center shrink-0 transition-all border',
                                    'bg-emerald-100 text-emerald-600 border-emerald-300',
                                    'hover:bg-emerald-500 hover:text-white hover:border-emerald-500 hover:scale-110',
                                    approvingId === c.id && 'opacity-60 cursor-wait',
                                  )}
                                >
                                  {approvingId === c.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <CheckCircle2 className="h-3 w-3" />}
                                </button>
                              )}

                              {/* File Insurance Claim — opens dialog */}
                              {c.status === 'pending' && insurance.some(i => i.is_active) && canCharge && (
                                <button
                                  type="button"
                                  onClick={() => openClaimDialog([c.id])}
                                  title="File insurance claim"
                                  className={cn(
                                    'h-6 w-6 rounded-full flex items-center justify-center shrink-0 transition-all border',
                                    'bg-purple-100 text-purple-600 border-purple-300',
                                    'hover:bg-purple-500 hover:text-white hover:border-purple-500 hover:scale-110',
                                    'dark:bg-purple-950/40 dark:text-purple-400 dark:border-purple-700',
                                  )}
                                >
                                  <ShieldCheck className="h-3 w-3" />
                                </button>
                              )}

                              {/* Cancel */}
                              {c.status !== 'void' && c.status !== 'paid' && (canCharge || c.created_by === user?.id) && (
                                <button
                                  type="button"
                                  onClick={() => { setVoidOpen(c); setVoidReason('') }}
                                  title="Cancel charge"
                                  className={cn(
                                    'h-6 w-6 rounded-full flex items-center justify-center shrink-0 transition-all border',
                                    'bg-red-50 text-red-400 border-red-200',
                                    'hover:bg-red-500 hover:text-white hover:border-red-500 hover:scale-110',
                                  )}
                                >
                                  <Ban className="h-3 w-3" />
                                </button>
                              )}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>

                {/* Payments list */}
                <div className="space-y-2">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Payments ({payments.length})</p>
                  {payments.length === 0 ? (
                    <p className="text-sm text-muted-foreground py-4 text-center border border-dashed rounded-lg">No payments</p>
                  ) : (
                    <div className="border rounded-lg divide-y overflow-hidden">
                      {payments.map(p => (
                        <div key={p.id} className="flex items-center gap-3 px-3 py-2 text-sm">
                          <div className="flex-1 min-w-0">
                            <p className="font-medium capitalize">{p.method.replace('_', ' ')}</p>
                            <p className="text-[11px] text-muted-foreground">
                              {formatDateTime(p.created_at)}
                              {p.reference  && <span className="ml-1">· ref: {p.reference}</span>}
                              {p.payer_name && <span className="ml-1">· {p.payer_name}</span>}
                            </p>
                          </div>
                          <p className="text-sm font-mono text-green-600 shrink-0">+{p.amount.toFixed(2)}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Deposits */}
                {deposits.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Deposits ({deposits.length})</p>
                    <div className="border rounded-lg divide-y overflow-hidden">
                      {deposits.map(d => (
                        <div key={d.id} className="flex items-center gap-3 px-3 py-2 text-sm">
                          <div className="flex-1 min-w-0">
                            <p className="font-medium">Deposit</p>
                            <p className="text-[11px] text-muted-foreground">
                              {formatDateTime(d.created_at)}
                              {d.reference && <span className="ml-1">· ref: {d.reference}</span>}
                            </p>
                          </div>
                          <div className="text-right shrink-0">
                            <p className="text-sm font-mono text-blue-600">{d.amount.toFixed(2)}</p>
                            <p className="text-[10px] text-muted-foreground">rem: {d.remaining.toFixed(2)}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </ScrollArea>
      )}

      {/* ── Insurance Claim Dialog ── */}
      <Dialog open={claimOpen} onOpenChange={o => { if (!o) setClaimOpen(false) }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-purple-600" />
              File Insurance Claim
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {/* Charges being claimed */}
            <div className="rounded-lg border bg-muted/30 p-2 space-y-1">
              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Charges</p>
              {charges.filter(c => claimChargeIds.includes(c.id)).map(c => (
                <div key={c.id} className="flex justify-between text-xs">
                  <span className="truncate mr-2">{c.description}</span>
                  <span className="font-mono shrink-0">{(c.quantity * c.unit_price).toFixed(2)}</span>
                </div>
              ))}
              <div className="flex justify-between text-xs font-semibold border-t pt-1">
                <span>Total</span>
                <span className="font-mono">
                  {charges.filter(c => claimChargeIds.includes(c.id)).reduce((s, c) => s + c.quantity * c.unit_price, 0).toFixed(2)}
                </span>
              </div>
            </div>

            {/* Payer */}
            <div className="space-y-1.5">
              <Label>Insurance Payer</Label>
              {insurance.filter(i => i.is_active).length > 0 ? (
                <select
                  value={claimPayer}
                  onChange={e => {
                    setClaimPayer(e.target.value)
                    const ins = insurance.find(i => i.payer_name === e.target.value)
                    if (ins?.copay_percent != null) {
                      setClaimPercent(String(100 - ins.copay_percent))
                      setClaimType('percentage')
                    }
                  }}
                  className="w-full h-9 text-sm rounded-lg border border-border bg-background px-3 text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                >
                  {insurance.filter(i => i.is_active).map(i => (
                    <option key={i.id} value={i.payer_name}>{i.payer_name}{i.policy_number ? ` — ${i.policy_number}` : ''}</option>
                  ))}
                </select>
              ) : (
                <Input value={claimPayer} onChange={e => setClaimPayer(e.target.value)} placeholder="Payer name" />
              )}
            </div>

            {/* Coverage type */}
            <div className="space-y-2">
              <Label>Coverage Type</Label>
              <div className="grid grid-cols-3 gap-2">
                {([
                  { value: 'full',       label: 'Full',       desc: '100% covered' },
                  { value: 'percentage', label: 'Percentage', desc: 'e.g. 80%' },
                  { value: 'fixed',      label: 'Fixed Amt',  desc: 'exact amount' },
                ] as const).map(opt => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setClaimType(opt.value)}
                    className={cn(
                      'flex flex-col items-center gap-0.5 rounded-lg border p-2 text-center transition-colors',
                      claimType === opt.value
                        ? 'border-purple-400 bg-purple-50 text-purple-700 dark:bg-purple-950/30 dark:text-purple-400'
                        : 'border-border hover:border-purple-300',
                    )}
                  >
                    <span className="text-xs font-medium">{opt.label}</span>
                    <span className="text-[10px] text-muted-foreground">{opt.desc}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Input for percentage */}
            {claimType === 'percentage' && (
              <div className="space-y-1.5">
                <Label>Insurance covers (%)</Label>
                <div className="flex items-center gap-2">
                  <Input
                    type="number" min="1" max="99"
                    value={claimPercent}
                    onChange={e => setClaimPercent(e.target.value)}
                    placeholder="80"
                    className="w-24"
                  />
                  <span className="text-sm text-muted-foreground">% → insurer</span>
                </div>
                {claimPercent && (() => {
                  const pct = parseFloat(claimPercent) || 0
                  const total = charges.filter(c => claimChargeIds.includes(c.id)).reduce((s, c) => s + c.quantity * c.unit_price, 0)
                  const ins = Math.round(total * pct / 100 * 100) / 100
                  const pat = Math.round((total - ins) * 100) / 100
                  return (
                    <div className="text-[11px] text-muted-foreground bg-muted/30 rounded p-2 space-y-0.5">
                      <div className="flex justify-between">
                        <span className="text-purple-700 dark:text-purple-400">Insurance pays ({pct}%)</span>
                        <span className="font-mono">{ins.toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-emerald-700 dark:text-emerald-400">Patient pays ({(100-pct).toFixed(0)}%)</span>
                        <span className="font-mono">{pat.toFixed(2)}</span>
                      </div>
                    </div>
                  )
                })()}
              </div>
            )}

            {/* Input for fixed amount */}
            {claimType === 'fixed' && (
              <div className="space-y-1.5">
                <Label>Insurance pays (amount)</Label>
                <div className="flex items-center gap-2">
                  <Input
                    type="number"
                    value={claimFixed}
                    onChange={e => setClaimFixed(e.target.value)}
                    placeholder="0.00"
                    className="w-32"
                  />
                </div>
                {claimFixed && (() => {
                  const amt = parseFloat(claimFixed) || 0
                  const total = charges.filter(c => claimChargeIds.includes(c.id)).reduce((s, c) => s + c.quantity * c.unit_price, 0)
                  const pat = Math.max(0, Math.round((total - amt) * 100) / 100)
                  return (
                    <div className="text-[11px] text-muted-foreground bg-muted/30 rounded p-2 space-y-0.5">
                      <div className="flex justify-between">
                        <span className="text-purple-700 dark:text-purple-400">Insurance pays</span>
                        <span className="font-mono">{Math.min(amt, total).toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-emerald-700 dark:text-emerald-400">Patient pays</span>
                        <span className="font-mono">{pat.toFixed(2)}</span>
                      </div>
                    </div>
                  )
                })()}
              </div>
            )}

            {claimType === 'full' && (
              <p className="text-[11px] text-muted-foreground bg-purple-50 dark:bg-purple-950/20 rounded p-2 border border-purple-200 dark:border-purple-800">
                The entire charge moves to <strong>Insurance</strong> status. No patient payment required.
              </p>
            )}

            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setClaimOpen(false)}>Cancel</Button>
              <Button
                onClick={handleSubmitClaim}
                disabled={claimSaving || !claimPayer.trim() || (claimType === 'percentage' && !claimPercent) || (claimType === 'fixed' && !claimFixed)}
                className="bg-purple-600 hover:bg-purple-700 text-white"
              >
                {claimSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ShieldCheck className="h-3.5 w-3.5" />}
                File Claim{claimChargeIds.length > 1 ? ` (${claimChargeIds.length})` : ''}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Insurance Dialog ── */}
      <Dialog open={insOpen} onOpenChange={o => { if (!o) setInsOpen(false) }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{insEdit?.id ? 'Edit Insurance' : 'Add Insurance'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Payer / Company *</Label>
              <Input value={insPayer} onChange={e => setInsPayer(e.target.value)} placeholder="NHIF, AAR, Jubilee…" autoFocus />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Policy # <span className="text-muted-foreground font-normal">(optional)</span></Label>
                <Input value={insPolicy} onChange={e => setInsPolicy(e.target.value)} placeholder="12345678" />
              </div>
              <div className="space-y-1.5">
                <Label>Patient copay %</Label>
                <Input type="number" min="0" max="100" value={insCopay} onChange={e => setInsCopay(e.target.value)} placeholder="20" />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Coverage limit <span className="text-muted-foreground font-normal">(optional)</span></Label>
              <Input type="number" value={insLimit} onChange={e => setInsLimit(e.target.value)} placeholder="0.00" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Valid from</Label>
                <Input type="date" value={insFrom} onChange={e => setInsFrom(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Valid to</Label>
                <Input type="date" value={insTo} onChange={e => setInsTo(e.target.value)} />
              </div>
            </div>
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={insActive} onChange={e => setInsActive(e.target.checked)} className="rounded" />
              <span className="text-sm">Active</span>
            </label>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setInsOpen(false)}>Cancel</Button>
              <Button onClick={handleSaveInsurance} disabled={saving || !insPayer.trim()}>
                {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                Save
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Add Charge Dialog ── */}
      <Dialog open={chargeOpen} onOpenChange={setChargeOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Add Charge</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="flex gap-2">
              <Button size="sm" variant={chargeMode === 'service' ? 'default' : 'outline'} onClick={() => setChargeMode('service')}>Service Item</Button>
              <Button size="sm" variant={chargeMode === 'custom'  ? 'default' : 'outline'} onClick={() => setChargeMode('custom')}>Custom</Button>
            </div>
            {chargeMode === 'service' ? (
              <div className="space-y-2">
                <Label>Service</Label>
                <select
                  value={selectedServiceId}
                  onChange={e => setSelectedServiceId(e.target.value)}
                  className="w-full h-9 text-sm rounded-lg border border-border bg-background px-3 text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                >
                  {serviceItems.filter(s => s.active).map(s => (
                    <option key={s.id} value={s.id}>{s.name} — {s.default_price.toFixed(2)} ({s.code})</option>
                  ))}
                </select>
              </div>
            ) : (
              <div className="space-y-2">
                <Label>Description</Label>
                <Input value={chargeDesc} onChange={e => setChargeDesc(e.target.value)} placeholder="Charge description" />
                <Label>Unit Price</Label>
                <Input type="number" value={chargePrice} onChange={e => setChargePrice(e.target.value)} placeholder="0.00" />
              </div>
            )}
            <div className="space-y-1.5">
              <Label>Quantity</Label>
              <Input type="number" min={1} value={chargeQty} onChange={e => setChargeQty(parseInt(e.target.value) || 1)} />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setChargeOpen(false)}>Cancel</Button>
              <Button onClick={handleAddCharge} disabled={saving || (chargeMode === 'service' && !selectedServiceId) || (chargeMode === 'custom' && !chargeDesc)}>
                {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                Add Charge
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Cancel Charge Dialog ── */}
      <Dialog open={!!voidOpen} onOpenChange={o => { if (!o) setVoidOpen(null) }}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Cancel Charge</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">
            {voidOpen?.description} — {((voidOpen?.quantity ?? 0) * (voidOpen?.unit_price ?? 0)).toFixed(2)}
          </p>
          <div className="space-y-2">
            <Label>Reason</Label>
            <Input value={voidReason} onChange={e => setVoidReason(e.target.value)} placeholder="Reason for cancellation" />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setVoidOpen(null)}>Back</Button>
            <Button variant="destructive" onClick={handleVoid} disabled={saving || !voidReason.trim()}>
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <XCircle className="h-3.5 w-3.5" />}
              Cancel Charge
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Record Payment Dialog ── */}
      <Dialog open={paymentOpen} onOpenChange={setPaymentOpen}>
        <DialogContent className="max-w-sm h-[90vh] !flex flex-col overflow-hidden">
          <DialogHeader className="shrink-0"><DialogTitle>Record Payment</DialogTitle></DialogHeader>
          <div className="flex-1 overflow-y-auto min-h-0 space-y-3 pr-1">
            {/* Copay suggestion */}
            {activeInsurance?.copay_percent != null && selectedChargeIds.size > 0 && (
              <div className="rounded-lg border border-purple-200 bg-purple-50 dark:bg-purple-950/20 p-3 text-xs space-y-1">
                <div className="flex items-center gap-1.5">
                  <ShieldCheck className="h-3.5 w-3.5 text-purple-600 shrink-0" />
                  <span className="font-semibold text-purple-800 dark:text-purple-300">{activeInsurance.payer_name} — Copay Estimate</span>
                </div>
                <p className="text-purple-700 dark:text-purple-400">
                  Patient pays {activeInsurance.copay_percent}% = <strong>{(selectedTotal * activeInsurance.copay_percent / 100).toFixed(2)}</strong>
                  {' '}· Insurance covers {(100 - activeInsurance.copay_percent)}% = <strong>{(selectedTotal * (1 - activeInsurance.copay_percent / 100)).toFixed(2)}</strong>
                </p>
              </div>
            )}

            {/* Selected charges summary */}
            {selectedChargeIds.size > 0 && (
              <div className="rounded-lg border bg-muted/30 p-2 space-y-1">
                <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Charges being paid</p>
                {charges.filter(c => selectedChargeIds.has(c.id)).map(c => (
                  <div key={c.id} className="flex justify-between text-xs">
                    <span className="truncate mr-2">{c.description}</span>
                    <span className="font-mono shrink-0">{(c.quantity * c.unit_price).toFixed(2)}</span>
                  </div>
                ))}
                <div className="flex justify-between text-xs font-semibold border-t pt-1">
                  <span>Total</span>
                  <span className="font-mono">{selectedTotal.toFixed(2)}</span>
                </div>
              </div>
            )}

            <div className="space-y-1.5">
              <Label>Amount</Label>
              <Input type="number" value={payAmount} onChange={e => setPayAmount(e.target.value)} placeholder="0.00" autoFocus />
              {selectedChargeIds.size > 0 && (() => {
                const amt = parseFloat(payAmount) || 0
                const rem = Math.round((selectedTotal - amt) * 100) / 100
                if (rem > 0.009) return (
                  <p className="text-[11px] text-amber-600 dark:text-amber-400 flex items-center gap-1 mt-1">
                    <span className="font-semibold">⚠ Partial payment</span>
                    — remaining <strong>{rem.toFixed(2)}</strong> will be added as a new pending charge
                  </p>
                )
                return null
              })()}
            </div>
            <div className="space-y-1.5">
              <Label>Method</Label>
              <div className="flex flex-wrap gap-1.5">
                {PAYMENT_METHODS.map(m => (
                  <button
                    key={m.value}
                    type="button"
                    onClick={() => setPayMethod(m.value)}
                    className={cn(
                      'text-xs px-3 py-1.5 rounded-lg border transition-colors',
                      payMethod === m.value
                        ? 'border-primary bg-primary/5 text-primary font-medium'
                        : 'border-border text-muted-foreground hover:border-primary/30',
                    )}
                  >
                    {m.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Reference <span className="text-muted-foreground font-normal">(optional)</span></Label>
              <Input value={payRef} onChange={e => setPayRef(e.target.value)} placeholder="Receipt #, Mpesa code…" />
            </div>
            {payMethod === 'insurance' && (
              <div className="space-y-1.5">
                <Label>Payer Name</Label>
                <Input value={payPayer} onChange={e => setPayPayer(e.target.value)} placeholder={activeInsurance?.payer_name ?? 'Insurance company'} />
              </div>
            )}
            <div className="space-y-1.5">
              <Label>Notes <span className="text-muted-foreground font-normal">(optional)</span></Label>
              <Input value={payNotes} onChange={e => setPayNotes(e.target.value)} placeholder="Additional notes" />
            </div>
          </div>
          {/* Footer — sticky outside scroll area */}
          <div className="flex justify-end gap-2 pt-3 border-t mt-1 shrink-0">
            <Button variant="outline" onClick={() => setPaymentOpen(false)}>Cancel</Button>
            <Button onClick={handlePayment} disabled={saving || !payAmount || parseFloat(payAmount) <= 0}>
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <DollarSign className="h-3.5 w-3.5" />}
              Record Payment
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Accept Deposit Dialog ── */}
      <Dialog open={depositOpen} onOpenChange={setDepositOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Accept Deposit</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Amount</Label>
              <Input type="number" value={depAmount} onChange={e => setDepAmount(e.target.value)} placeholder="0.00" autoFocus />
            </div>
            <div className="space-y-1.5">
              <Label>Method <span className="text-muted-foreground font-normal">(optional)</span></Label>
              <Input value={depMethod} onChange={e => setDepMethod(e.target.value)} placeholder="cash" />
            </div>
            <div className="space-y-1.5">
              <Label>Reference <span className="text-muted-foreground font-normal">(optional)</span></Label>
              <Input value={depRef} onChange={e => setDepRef(e.target.value)} placeholder="Receipt #" />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setDepositOpen(false)}>Cancel</Button>
              <Button onClick={handleDeposit} disabled={saving || !depAmount || parseFloat(depAmount) <= 0}>
                {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Wallet className="h-3.5 w-3.5" />}
                Accept Deposit
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Receipt Dialog ── */}
      <Dialog open={receiptOpen} onOpenChange={setReceiptOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Receipt className="h-4 w-4" />
              Payment Receipt
            </DialogTitle>
          </DialogHeader>
          {receiptData && (
            <>
              <div ref={printRef} className="space-y-4 print:p-6">
                {/* Header */}
                <div className="text-center space-y-1 print:block">
                  <p className="text-base font-bold">Payment Receipt</p>
                  <p className="text-xs text-muted-foreground">{new Date().toLocaleDateString()} {new Date().toLocaleTimeString()}</p>
                </div>

                {/* Patient */}
                <div className="border rounded-lg p-3 space-y-1">
                  <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Patient</p>
                  <p className="text-sm font-medium">{fullName(receiptData.patient, nameFormat)}</p>
                  <p className="text-xs text-muted-foreground font-mono">{receiptData.patient.mrn}</p>
                </div>

                {/* Charges */}
                <div className="border rounded-lg overflow-hidden">
                  <div className="bg-muted/30 px-3 py-1.5">
                    <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Charges Paid</p>
                  </div>
                  <div className="divide-y">
                    {receiptData.chargesPaid.map(c => (
                      <div key={c.id} className="flex justify-between px-3 py-2 text-sm">
                        <span className="truncate mr-2">{c.description}</span>
                        <span className="font-mono shrink-0">{(c.quantity * c.unit_price).toFixed(2)}</span>
                      </div>
                    ))}
                    <div className="flex justify-between px-3 py-2 text-sm font-bold border-t bg-muted/20">
                      <span>Total</span>
                      <span className="font-mono">{receiptData.chargesPaid.reduce((s, c) => s + c.quantity * c.unit_price, 0).toFixed(2)}</span>
                    </div>
                  </div>
                </div>

                {/* Payment details */}
                <div className="border rounded-lg p-3 space-y-1">
                  <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Payment</p>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Amount paid</span>
                    <span className="font-mono font-semibold text-green-700">{receiptData.payment.amount.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Method</span>
                    <span className="capitalize">{receiptData.payment.method.replace('_', ' ')}</span>
                  </div>
                  {receiptData.payment.reference && (
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Reference</span>
                      <span className="font-mono">{receiptData.payment.reference}</span>
                    </div>
                  )}
                  {receiptData.payment.payer_name && (
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Payer</span>
                      <span>{receiptData.payment.payer_name}</span>
                    </div>
                  )}
                </div>
              </div>

              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setReceiptOpen(false)}>Close</Button>
                <Button onClick={handlePrint}>
                  <Printer className="h-3.5 w-3.5" /> Print
                </Button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}

// ── Balance card ─────────────────────────────────────────────────────────────

function BalanceCard({
  label, value, icon: Icon, color, bold, symbol,
}: {
  label: string
  value: number
  icon: React.ComponentType<{ className?: string }>
  color: string
  bold?: boolean
  symbol?: string
}) {
  return (
    <div className="border rounded-lg p-3 space-y-1">
      <div className="flex items-center gap-1.5">
        <Icon className={cn('h-3.5 w-3.5', color)} />
        <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">{label}</span>
      </div>
      <p className={cn('text-lg font-mono', color, bold && 'font-bold')}>
        {symbol && <span className="text-sm opacity-70 mr-0.5">{symbol}</span>}
        {value.toFixed(2)}
      </p>
    </div>
  )
}
