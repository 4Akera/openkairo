import { useState, useEffect } from 'react'
import { Loader2, Check, User, Building2, Clock, Star, Calendar, Sun, Moon, ClipboardList, X, Plus } from 'lucide-react'
import { useSettingsStore } from '../../stores/settingsStore'
import type { DateFormat, TimeFormat } from '../../stores/settingsStore'
import { useThemeStore } from '../../stores/themeStore'
import type { NameFormat } from '../../types'
import { Button, Input, Separator, Label } from '../../components/ui'
import { cn } from '../../lib/utils'

// ============================================================
// General Section (admin)
// ============================================================

function SettingStatus({ saving, saved, error }: { saving: boolean; saved: boolean; error: string | null }) {
  if (!saving && !saved && !error) return null
  return (
    <p className={cn('mt-2 text-xs', saved ? 'text-emerald-600' : error ? 'text-destructive' : 'text-muted-foreground')}>
      {saving ? 'Saving…' : saved ? 'Saved' : error}
    </p>
  )
}

function useSettingState() {
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const run = async (fn: () => Promise<{ error: string | null }>) => {
    setSaving(true); setSaved(false); setError(null)
    const res = await fn()
    setSaving(false)
    if (res.error) setError(res.error)
    else { setSaved(true); setTimeout(() => setSaved(false), 2000) }
  }

  return { saving, saved, error, run }
}

export function GeneralSection() {
  const {
    nameFormat, updateNameFormat,
    facilityName, updateFacilityName,
    dateFormat, updateDateFormat,
    timeFormat, updateTimeFormat,
    billingEnabled, updateBillingEnabled,
    currencySymbol, updateCurrencySymbol,
    flowStages, updateFlowStages,
  } = useSettingsStore()
  const { theme, toggle } = useThemeStore()

  const nameState     = useSettingState()
  const facilityState = useSettingState()
  const dateState     = useSettingState()
  const timeState     = useSettingState()
  const billingState  = useSettingState()
  const currencyState = useSettingState()
  const flowState     = useSettingState()

  const [facilityDraft, setFacilityDraft] = useState(facilityName)
  const [currencyDraft, setCurrencyDraft] = useState(currencySymbol)
  const [stageDraft, setStageDraft]       = useState('')

  const setStages = (stages: string[]) => flowState.run(() => updateFlowStages(stages))
  const addStage = () => {
    const s = stageDraft.trim()
    if (!s || flowStages.includes(s)) return
    setStageDraft('')
    setStages([...flowStages, s])
  }

  // Sync drafts when store values load
  useEffect(() => { setFacilityDraft(facilityName) }, [facilityName])
  useEffect(() => { setCurrencyDraft(currencySymbol) }, [currencySymbol])

  const handleFacilitySave = () => {
    facilityState.run(() => updateFacilityName(facilityDraft.trim()))
  }

  return (
    <div className="max-w-xl space-y-8">
      <div>
        <h2 className="text-sm font-semibold mb-1">General Settings</h2>
        <p className="text-xs text-muted-foreground">System-wide configuration applied to all users.</p>
      </div>

      <Separator />

      {/* Billing Toggle */}
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <Star className="h-4 w-4 text-muted-foreground" />
          <Label className="text-sm font-medium">Billing System</Label>
        </div>
        <p className="text-xs text-muted-foreground -mt-1">
          Enable the billing module for charges, payments, deposits, and invoices.
        </p>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => billingState.run(() => updateBillingEnabled(!billingEnabled))}
            className="relative"
          >
            <div className={cn(
              'h-6 w-11 rounded-full transition-colors',
              billingEnabled ? 'bg-primary' : 'bg-muted-foreground/30',
            )}>
              <div className={cn(
                'absolute top-1 h-4 w-4 rounded-full bg-white shadow transition-transform',
                billingEnabled ? 'translate-x-6' : 'translate-x-1',
              )} />
            </div>
          </button>
          <span className="text-sm">{billingEnabled ? 'Enabled' : 'Disabled'}</span>
        </div>
        <SettingStatus {...billingState} />
      </div>

      <Separator />

      {/* Currency */}
      {billingEnabled && (
        <>
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Star className="h-4 w-4 text-muted-foreground" />
              <Label className="text-sm font-medium">Currency</Label>
            </div>
            <p className="text-xs text-muted-foreground -mt-1">
              Enter the currency symbol to display on charges, receipts, and billing displays.
            </p>
            <div className="flex gap-2">
              <Input
                value={currencyDraft}
                onChange={e => { setCurrencyDraft(e.target.value); currencyState.run(() => Promise.resolve({ error: null })) }}
                onBlur={() => currencyState.run(() => updateCurrencySymbol(currencyDraft.trim() || '$'))}
                onKeyDown={e => e.key === 'Enter' && currencyState.run(() => updateCurrencySymbol(currencyDraft.trim() || '$'))}
                placeholder="e.g. $, €, £, KSh"
                className="max-w-[12rem]"
              />
              <Button
                size="sm"
                variant="outline"
                onClick={() => currencyState.run(() => updateCurrencySymbol(currencyDraft.trim() || '$'))}
                disabled={currencyState.saving || currencyDraft.trim() === currencySymbol}
              >
                {currencyState.saving
                  ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  : 'Save'}
              </Button>
            </div>
            <SettingStatus {...currencyState} />
          </div>
          <Separator />
        </>
      )}

      {/* Patient Flow */}
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <ClipboardList className="h-4 w-4 text-muted-foreground" />
          <Label className="text-sm font-medium">Patient Flow Stages</Label>
        </div>
        <p className="text-xs text-muted-foreground -mt-1">
          Queue stages shown on the Front Desk (e.g. Waiting → With doctor). Clear all
          stages to disable stage tracking — the queue then simply orders by arrival time.
        </p>
        <div className="flex flex-wrap items-center gap-1.5">
          {flowStages.map((s, i) => (
            <span
              key={s}
              className="inline-flex items-center gap-1 rounded-full border bg-primary/5 border-primary/30 pl-2.5 pr-1 py-0.5 text-xs font-medium"
            >
              {i > 0 && <span className="text-muted-foreground mr-0.5">→</span>}
              {s}
              <button
                type="button"
                onClick={() => setStages(flowStages.filter(x => x !== s))}
                className="rounded-full p-0.5 text-muted-foreground hover:text-destructive"
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
          {flowStages.length === 0 && (
            <span className="text-xs text-muted-foreground italic">Stage tracking off</span>
          )}
        </div>
        <div className="flex gap-2">
          <Input
            value={stageDraft}
            onChange={e => setStageDraft(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && addStage()}
            placeholder="Add a stage…"
            className="max-w-[14rem] h-8 text-sm"
          />
          <Button size="sm" variant="outline" onClick={addStage} disabled={!stageDraft.trim()}>
            <Plus className="h-3.5 w-3.5" /> Add
          </Button>
          {flowStages.length === 0 && (
            <Button size="sm" variant="outline" onClick={() => setStages(['Waiting', 'With doctor'])}>
              Use basic preset
            </Button>
          )}
        </div>
        <SettingStatus {...flowState} />
      </div>

      <Separator />

      {/* Appearance */}
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <Sun className="h-4 w-4 text-muted-foreground" />
          <Label className="text-sm font-medium">Appearance</Label>
        </div>
        <p className="text-xs text-muted-foreground -mt-1">
          Choose your preferred colour scheme. Saved locally in your browser.
        </p>
        <div className="grid grid-cols-2 gap-3">
          {([
            { value: 'light', label: 'Light', Icon: Sun,  preview: 'bg-white border-slate-200 text-slate-800' },
            { value: 'dark',  label: 'Dark',  Icon: Moon, preview: 'bg-slate-900 border-slate-700 text-slate-100' },
          ] as const).map(opt => (
            <button
              key={opt.value}
              onClick={() => theme !== opt.value && toggle()}
              className={cn(
                'relative flex flex-col gap-2 rounded-lg border-2 p-4 text-left transition-all',
                theme === opt.value ? 'border-primary bg-primary/5' : 'border-border hover:border-muted-foreground/40',
              )}
            >
              {theme === opt.value && (
                <span className="absolute top-3 right-3 flex h-4 w-4 items-center justify-center rounded-full bg-primary text-primary-foreground">
                  <Check className="h-2.5 w-2.5" />
                </span>
              )}
              {/* Mini preview swatch */}
              <div className={cn('w-full h-10 rounded-md border flex items-center justify-center', opt.preview)}>
                <opt.Icon className="h-4 w-4 opacity-60" />
              </div>
              <span className="text-sm font-medium">{opt.label}</span>
            </button>
          ))}
        </div>
      </div>

      <Separator />

      {/* Facility Name */}
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <Building2 className="h-4 w-4 text-muted-foreground" />
          <Label className="text-sm font-medium">Facility Name</Label>
        </div>
        <p className="text-xs text-muted-foreground -mt-1">
          The name of your hospital, clinic, or health centre. Displayed throughout the system.
        </p>
        <div className="flex gap-2">
          <Input
            value={facilityDraft}
            onChange={e => { setFacilityDraft(e.target.value); facilityState.run(() => Promise.resolve({ error: null })) }}
            onBlur={handleFacilitySave}
            onKeyDown={e => e.key === 'Enter' && handleFacilitySave()}
            placeholder="e.g. City General Hospital"
            className="flex-1"
          />
          <Button
            size="sm"
            variant="outline"
            onClick={handleFacilitySave}
            disabled={facilityState.saving || facilityDraft.trim() === facilityName}
          >
            {facilityState.saving
              ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
              : facilityState.saved
                ? <Check className="h-3.5 w-3.5 text-emerald-600" />
                : 'Save'
            }
          </Button>
        </div>
        <SettingStatus {...facilityState} />
      </div>

      <Separator />

      {/* Patient Name Format */}
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <User className="h-4 w-4 text-muted-foreground" />
          <Label className="text-sm font-medium">Patient Name Format</Label>
        </div>
        <p className="text-xs text-muted-foreground -mt-1">
          How patient names are collected and displayed across the system.
        </p>
        <div className="grid grid-cols-2 gap-3">
          {([
            { value: 'two' as NameFormat,   title: 'Two Names',   description: 'First + Last',              example: 'Jane Smith' },
            { value: 'three' as NameFormat, title: 'Three Names', description: 'First + Middle + Last',     example: 'Jane Marie Smith' },
          ] as const).map(opt => (
            <button
              key={opt.value}
              onClick={() => nameState.run(() => updateNameFormat(opt.value))}
              disabled={nameState.saving}
              className={cn(
                'relative flex flex-col gap-1 rounded-lg border-2 p-4 text-left transition-all',
                nameFormat === opt.value ? 'border-primary bg-primary/5' : 'border-border hover:border-muted-foreground/40',
              )}
            >
              {nameFormat === opt.value && (
                <span className="absolute top-3 right-3 flex h-4 w-4 items-center justify-center rounded-full bg-primary text-primary-foreground">
                  <Check className="h-2.5 w-2.5" />
                </span>
              )}
              <span className="text-sm font-medium">{opt.title}</span>
              <span className="text-xs text-muted-foreground">{opt.description}</span>
              <span className="mt-1 text-xs font-mono text-foreground/60">{opt.example}</span>
            </button>
          ))}
        </div>
        <SettingStatus {...nameState} />
      </div>

      <Separator />

      {/* Date Format */}
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <Calendar className="h-4 w-4 text-muted-foreground" />
          <Label className="text-sm font-medium">Date Display Format</Label>
        </div>
        <p className="text-xs text-muted-foreground -mt-1">
          How dates are shown throughout the application.
        </p>
        <div className="grid grid-cols-3 gap-3">
          {([
            { value: 'dd/mm/yyyy' as DateFormat, label: 'DD/MM/YYYY', example: '25/03/2025' },
            { value: 'mm/dd/yyyy' as DateFormat, label: 'MM/DD/YYYY', example: '03/25/2025' },
            { value: 'yyyy-mm-dd' as DateFormat, label: 'YYYY-MM-DD', example: '2025-03-25' },
          ] as const).map(opt => (
            <button
              key={opt.value}
              onClick={() => dateState.run(() => updateDateFormat(opt.value))}
              disabled={dateState.saving}
              className={cn(
                'relative flex flex-col items-center gap-1.5 rounded-lg border-2 p-3 text-center transition-all',
                dateFormat === opt.value ? 'border-primary bg-primary/5' : 'border-border hover:border-muted-foreground/40',
              )}
            >
              {dateFormat === opt.value && (
                <span className="absolute top-2 right-2 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-primary text-primary-foreground">
                  <Check className="h-2 w-2" />
                </span>
              )}
              <span className="text-xs font-semibold">{opt.label}</span>
              <span className="text-[11px] font-mono text-muted-foreground">{opt.example}</span>
            </button>
          ))}
        </div>
        <SettingStatus {...dateState} />
      </div>

      <Separator />

      {/* Time Format */}
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <Clock className="h-4 w-4 text-muted-foreground" />
          <Label className="text-sm font-medium">Time Format</Label>
        </div>
        <p className="text-xs text-muted-foreground -mt-1">
          How times are displayed across the system.
        </p>
        <div className="grid grid-cols-2 gap-3">
          {([
            { value: '24h' as TimeFormat, title: '24-hour',  example: '14:30' },
            { value: '12h' as TimeFormat, title: '12-hour',  example: '2:30 PM' },
          ] as const).map(opt => (
            <button
              key={opt.value}
              onClick={() => timeState.run(() => updateTimeFormat(opt.value))}
              disabled={timeState.saving}
              className={cn(
                'relative flex flex-col gap-1 rounded-lg border-2 p-4 text-left transition-all',
                timeFormat === opt.value ? 'border-primary bg-primary/5' : 'border-border hover:border-muted-foreground/40',
              )}
            >
              {timeFormat === opt.value && (
                <span className="absolute top-3 right-3 flex h-4 w-4 items-center justify-center rounded-full bg-primary text-primary-foreground">
                  <Check className="h-2.5 w-2.5" />
                </span>
              )}
              <span className="text-sm font-medium">{opt.title}</span>
              <span className="mt-1 text-xs font-mono text-foreground/60">{opt.example}</span>
            </button>
          ))}
        </div>
        <SettingStatus {...timeState} />
      </div>
    </div>
  )
}
