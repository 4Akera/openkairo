/**
 * Wards — the inpatient census. One page, one job: who is in a bed right
 * now, grouped by ward, with "day n" from admitted_at and the two ward
 * verbs — Admit (a patient into a bed) and Discharge (the ONE ending,
 * ward flavor: journey ends; record closes unless orders are in flight).
 *
 * Admission is a phase of the SAME encounter — Open goes to the ordinary
 * clinical record; there is no separate inpatient chart.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import {
  admissionDayN, occupancyLabel, groupCensus,
  fetchWards, fetchCensus, admitEncounter, dischargeEncounter,
} from '../lib/wards'
import { deptIconComponent, deptColorClasses } from '../lib/deptIcons'
import { useSettingsStore } from '../stores/settingsStore'
import type { Department, Patient, Visit } from '../types'
import {
  Button, Badge, Input,
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
  Label,
} from '../components/ui'
import { BedDouble, DoorOpen, Loader2, Search, UserPlus, FileText } from 'lucide-react'
import { cn, fullName } from '../lib/utils'

/** Long stays deserve a quiet flag — amber from day 8. */
const LONG_STAY_DAYS = 8

export default function WardsPage() {
  const navigate = useNavigate()
  const { nameFormat } = useSettingsStore()

  const [wards, setWards] = useState<Department[] | null>(null)
  const [census, setCensus] = useState<Visit[] | null>(null)
  const [staffNames, setStaffNames] = useState<Map<string, string>>(new Map())
  const [notice, setNotice] = useState<string | null>(null)

  // Discharge is two-tap: first tap arms, second confirms; 4s auto-revert.
  const [armedId, setArmedId] = useState<string | null>(null)
  const armTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [dischargingId, setDischargingId] = useState<string | null>(null)

  const [admitOpen, setAdmitOpen] = useState(false)

  const load = useCallback(async () => {
    const [w, c, staffRes] = await Promise.all([
      fetchWards(),
      fetchCensus(),
      supabase.from('profiles').select('id, full_name'),
    ])
    setWards(w)
    setCensus(c)
    setStaffNames(new Map(
      ((staffRes.data ?? []) as { id: string; full_name: string }[]).map(p => [p.id, p.full_name]),
    ))
  }, [])

  useEffect(() => {
    void load()
    const interval = setInterval(() => void load(), 30_000)
    const onFocus = () => void load()
    window.addEventListener('focus', onFocus)
    return () => {
      clearInterval(interval)
      window.removeEventListener('focus', onFocus)
    }
  }, [load])

  const grouped = useMemo(
    () => (wards && census ? groupCensus(wards, census) : []),
    [wards, census],
  )

  // Day counts need a clock; render-time Date.now() is impure, so tick it.
  const [nowMs, setNowMs] = useState(0)
  useEffect(() => {
    setNowMs(Date.now())
    const t = setInterval(() => setNowMs(Date.now()), 60_000)
    return () => clearInterval(t)
  }, [])

  const armDischarge = (id: string) => {
    if (armTimer.current) clearTimeout(armTimer.current)
    setArmedId(id)
    armTimer.current = setTimeout(() => setArmedId(null), 4000)
  }

  const runDischarge = async (row: Visit) => {
    if (armTimer.current) clearTimeout(armTimer.current)
    setArmedId(null)
    setDischargingId(row.id)
    const patient = Array.isArray(row.patients) ? row.patients[0] : row.patients
    const { error, recordClosed } = await dischargeEncounter(row.id)
    setDischargingId(null)
    if (error) {
      setNotice(`Discharge failed: ${error}`)
      return
    }
    const name = patient ? fullName(patient, nameFormat) : 'Patient'
    setNotice(recordClosed
      ? `${name} discharged — record closed.`
      : `${name} discharged — orders still in flight, so the record stays open in Loose ends.`)
    void load()
  }

  const openRecord = (row: Visit) =>
    navigate(`/patients/${row.patient_id}/encounters/${row.id}`)

  const loading = wards === null || census === null

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-5 space-y-6">

        {/* Header */}
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <BedDouble className="h-5 w-5 text-blue-400" />
            <h1 className="text-lg font-semibold tracking-tight">Wards</h1>
            {census !== null && (
              <Badge variant="secondary" className="tabular-nums">{census.length} admitted</Badge>
            )}
          </div>
          <Button size="sm" onClick={() => { setNotice(null); setAdmitOpen(true) }}>
            <UserPlus className="h-4 w-4 mr-1.5" />
            Admit
          </Button>
        </div>

        {notice && (
          <p className="text-xs text-muted-foreground border border-border/60 bg-accent/30 rounded-lg px-3 py-2">
            {notice}
          </p>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-16 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        ) : wards.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-2 text-muted-foreground">
            <BedDouble className="h-8 w-8 opacity-30" />
            <p className="text-sm">No wards yet — create one in Settings → Departments.</p>
          </div>
        ) : (
          grouped.map(({ ward, rows }) => {
            const WardIcon = deptIconComponent(ward.icon)
            return (
              <section key={ward.id} className="rounded-xl border border-border/60 overflow-hidden">
                {/* Ward header */}
                <div className="flex items-center gap-2.5 px-4 sm:px-5 py-3 bg-accent/30 border-b border-border/60">
                  <span className={cn('flex items-center justify-center h-7 w-7 rounded-lg', deptColorClasses(ward.color))}>
                    <WardIcon className="h-4 w-4" />
                  </span>
                  <h2 className="text-sm font-semibold flex-1 min-w-0 truncate">{ward.name}</h2>
                  <span className="text-xs text-muted-foreground tabular-nums">
                    {occupancyLabel(rows.length, ward.capacity)} beds
                  </span>
                </div>

                {rows.length === 0 ? (
                  <p className="px-4 sm:px-5 py-5 text-sm text-muted-foreground">Empty — no admitted patients.</p>
                ) : (
                  <ul className="divide-y divide-border/40">
                    {rows.map(row => {
                      const patient = Array.isArray(row.patients) ? row.patients[0] : row.patients
                      const dayN = row.admitted_at ? admissionDayN(row.admitted_at, nowMs) : 1
                      const physician = row.assigned_to ? staffNames.get(row.assigned_to) : null
                      const armed = armedId === row.id
                      return (
                        <li key={row.id} className="flex items-center gap-3 px-4 sm:px-5 py-2.5">
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <p className="text-sm font-medium truncate">
                                {patient ? fullName(patient, nameFormat) : 'Unknown patient'}
                              </p>
                              {row.bed && (
                                <Badge variant="outline" className="text-[10px] py-0 px-1.5 font-mono shrink-0">
                                  {row.bed}
                                </Badge>
                              )}
                              <Badge
                                variant="secondary"
                                className={cn(
                                  'text-[10px] py-0 px-1.5 tabular-nums shrink-0',
                                  dayN >= LONG_STAY_DAYS && 'bg-amber-500/15 text-amber-600 dark:text-amber-400',
                                )}
                              >
                                day {dayN}
                              </Badge>
                            </div>
                            <p className="text-xs text-muted-foreground truncate">
                              {patient?.mrn && <span className="font-mono">{patient.mrn}</span>}
                              {(row.title || row.reason) && <> · {row.title ?? row.reason}</>}
                              {physician && <> · {physician}</>}
                            </p>
                          </div>

                          <Button
                            variant="outline"
                            size="sm"
                            className="shrink-0"
                            onClick={() => openRecord(row)}
                          >
                            <FileText className="h-3.5 w-3.5 mr-1.5" />
                            Open
                          </Button>
                          <Button
                            variant={armed ? 'destructive' : 'ghost'}
                            size="sm"
                            className="shrink-0"
                            disabled={dischargingId === row.id}
                            onClick={() => (armed ? void runDischarge(row) : armDischarge(row.id))}
                          >
                            {dischargingId === row.id
                              ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              : <DoorOpen className="h-3.5 w-3.5 mr-1.5" />}
                            {armed ? 'Confirm?' : 'Discharge'}
                          </Button>
                        </li>
                      )
                    })}
                  </ul>
                )}
              </section>
            )
          })
        )}
      </div>

      {admitOpen && wards && (
        <AdmitDialog
          wards={wards}
          onClose={() => setAdmitOpen(false)}
          onAdmitted={(msg, patientId, encounterId) => {
            setAdmitOpen(false)
            setNotice(msg)
            void load()
            navigate(`/patients/${patientId}/encounters/${encounterId}`)
          }}
        />
      )}
    </div>
  )
}

/**
 * Admit = search patient → ward + bed → go. If the patient already has an
 * open, un-admitted encounter (e.g. today's queue visit) the admission
 * continues THAT encounter; otherwise a fresh one is created — either way
 * it is one record carrying clinic and ward phases.
 */
function AdmitDialog({
  wards,
  onClose,
  onAdmitted,
}: {
  wards: Department[]
  onClose: () => void
  onAdmitted: (msg: string, patientId: string, encounterId: string) => void
}) {
  const { nameFormat } = useSettingsStore()
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<Patient[] | null>(null)
  const [patient, setPatient] = useState<Patient | null>(null)
  const [wardId, setWardId] = useState(wards[0]?.id ?? '')
  const [bed, setBed] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const q = query.trim()
    if (!q || patient) { setResults(null); return }
    let cancelled = false
    const t = setTimeout(async () => {
      const { data } = await supabase.rpc('search_patients', {
        p_tokens: q.split(/\s+/).filter(Boolean),
        p_limit: 8,
      })
      if (!cancelled) setResults((data ?? []) as Patient[])
    }, 250)
    return () => { cancelled = true; clearTimeout(t) }
  }, [query, patient])

  const admit = async () => {
    if (!patient || !wardId) return
    setSaving(true)
    setError(null)

    // Continue the patient's open, un-admitted encounter if one exists.
    const { data: openEncs } = await supabase
      .from('encounters')
      .select('id, arrived_at')
      .eq('patient_id', patient.id)
      .eq('status', 'open')
      .is('ward_id', null)
      .is('cancelled_at', null)
      .order('created_at', { ascending: false })
      .limit(1)
    let encounterId = openEncs?.[0]?.id as string | undefined
    let alreadyArrived = Boolean(openEncs?.[0]?.arrived_at)
    let continued = Boolean(encounterId)

    if (!encounterId) {
      const { data: created, error: insErr } = await supabase
        .from('encounters')
        .insert({
          patient_id: patient.id,
          status: 'open',
          visibility: 'staff',
          visible_to_roles: [],
          arrived_at: new Date().toISOString(),
        })
        .select('id')
        .single()
      if (insErr || !created) {
        setError(insErr?.message ?? 'Could not create the encounter')
        setSaving(false)
        return
      }
      encounterId = (created as { id: string }).id
      alreadyArrived = true
      continued = false
    }

    const { error: admitErr } = await admitEncounter(encounterId, wardId, bed, alreadyArrived)
    setSaving(false)
    if (admitErr) {
      setError(admitErr)
      return
    }
    const wardName = wards.find(w => w.id === wardId)?.name ?? 'ward'
    onAdmitted(
      `${fullName(patient, nameFormat)} admitted to ${wardName}${bed.trim() ? `, bed ${bed.trim()}` : ''}` +
        (continued ? ' — continuing their open encounter.' : '.'),
      patient.id,
      encounterId,
    )
  }

  return (
    <Dialog open onOpenChange={open => { if (!open) onClose() }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Admit a patient</DialogTitle>
          <DialogDescription>
            Admission continues the patient&apos;s open encounter — one record, clinic to ward.
          </DialogDescription>
        </DialogHeader>

        {patient ? (
          <div className="flex items-center gap-2 rounded-lg border border-border/60 px-3 py-2">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium truncate">{fullName(patient, nameFormat)}</p>
              <p className="text-xs text-muted-foreground font-mono">{patient.mrn}</p>
            </div>
            <Button variant="ghost" size="sm" onClick={() => { setPatient(null); setQuery('') }}>
              Change
            </Button>
          </div>
        ) : (
          <div className="space-y-1.5">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                autoFocus
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder="Search name, MRN or phone…"
                className="pl-8"
              />
            </div>
            {results && (
              <ul className="max-h-48 overflow-y-auto rounded-lg border border-border/60 divide-y divide-border/40">
                {results.length === 0 && (
                  <li className="px-3 py-2 text-xs text-muted-foreground">No matches.</li>
                )}
                {results.map(p => (
                  <li key={p.id}>
                    <button
                      className="w-full text-left px-3 py-2 hover:bg-accent/40 transition-colors"
                      onClick={() => setPatient(p)}
                    >
                      <p className="text-sm font-medium truncate">{fullName(p, nameFormat)}</p>
                      <p className="text-xs text-muted-foreground font-mono">{p.mrn}</p>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label className="text-xs">Ward</Label>
            <Select value={wardId} onValueChange={setWardId}>
              <SelectTrigger className="h-9">
                <SelectValue placeholder="Ward" />
              </SelectTrigger>
              <SelectContent>
                {wards.map(w => (
                  <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Bed <span className="text-muted-foreground">(free text)</span></Label>
            <Input value={bed} onChange={e => setBed(e.target.value)} placeholder="e.g. M-4" className="h-9" />
          </div>
        </div>

        {error && <p className="text-xs text-red-500">{error}</p>}

        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button disabled={!patient || !wardId || saving} onClick={() => void admit()}>
            {saving && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
            Admit
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
