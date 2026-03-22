import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../../lib/supabase'
import { Separator, ScrollArea } from '../ui'
import type { Patient, Problem } from '../../types'
import { calcAgeVerbose, getPatientDob, getPatientGender, cn } from '../../lib/utils'
import Demographics from './Demographics'
import Allergies from './Allergies'
import ProblemList from './ProblemList'
import MedicationList from './MedicationList'
import HistoricalArchive from './HistoricalArchive'
import ResultsAndReports from './ResultsAndReports'

interface Props {
  patient: Patient
  onPatientUpdate: (p: Patient) => void
  encounterId?: string
}

const IMPORTANCE_BADGE: Record<string, string> = {
  high:   'bg-rose-50   text-rose-700   border-rose-200',
  medium: 'bg-amber-50  text-amber-700  border-amber-200',
  low:    'bg-slate-50  text-slate-600  border-slate-200',
}

export default function PatientRecord({ patient, onPatientUpdate, encounterId }: Props) {
  const [activeProblems, setActiveProblems] = useState<Problem[]>([])

  // Fetch active problems for the summary banner
  const fetchProblems = useCallback(async () => {
    const { data } = await supabase
      .from('patient_problems')
      .select('id, problem, importance, status')
      .eq('patient_id', patient.id)
      .eq('status', 'active')
      .order('created_at', { ascending: false })
    if (data) {
      const sorted = (data as Problem[]).sort((a, b) => {
        const order: Record<string, number> = { high: 0, medium: 1, low: 2 }
        return (order[a.importance ?? 'medium'] ?? 1) - (order[b.importance ?? 'medium'] ?? 1)
      })
      setActiveProblems(sorted)
    }
  }, [patient.id])

  useEffect(() => { fetchProblems() }, [fetchProblems])

  const dob = getPatientDob(patient)
  const ageVerbose = calcAgeVerbose(dob)
  const gender = getPatientGender(patient)
  const showSummary = ageVerbose != null || !!gender || activeProblems.length > 0

  return (
    <div className="h-full flex flex-col border-l bg-card">
      {/* Header */}
      <div className="px-3 py-2 border-b bg-sidebar shrink-0">
        <p className="text-xs font-semibold text-sidebar-foreground/70 uppercase tracking-wide">
          Patient Record
        </p>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-3 space-y-4">
          {/* Clinical Summary Banner */}
          {showSummary && (
            <div className="rounded-md border bg-muted/40 px-3 py-2">
              <div className="flex flex-wrap items-center gap-1.5 text-xs">
                {(ageVerbose || gender) && (
                  <span className="font-medium text-foreground">
                    {ageVerbose ?? ''}
                    {ageVerbose && gender ? ' ' : ''}
                    {gender ?? ''}
                  </span>
                )}
                {(ageVerbose || gender) && activeProblems.length > 0 && (
                  <span className="text-muted-foreground">|</span>
                )}
                {activeProblems.slice(0, 5).map(p => (
                  <span
                    key={p.id}
                    className={cn(
                      'text-[10px] px-1.5 py-0 rounded-full border capitalize',
                      IMPORTANCE_BADGE[p.importance ?? 'medium'],
                    )}
                  >
                    {p.problem}
                  </span>
                ))}
                {activeProblems.length > 5 && (
                  <span className="text-[10px] text-muted-foreground">+{activeProblems.length - 5} more</span>
                )}
              </div>
            </div>
          )}

          {/* Demographics */}
          <Demographics patient={patient} onUpdate={onPatientUpdate} />

          <Separator />

          {/* Allergies */}
          <Allergies patientId={patient.id} />

          <Separator />

          {/* Problem List */}
          <ProblemList patientId={patient.id} onProblemsChanged={fetchProblems} />

          <Separator />

          {/* Medications */}
          <MedicationList patientId={patient.id} />

          <Separator />

          {/* Historical Archive (includes Encounters section) */}
          <HistoricalArchive patientId={patient.id} encounterId={encounterId} />

          <Separator />

          {/* Results & Reports — blocks shared from any encounter */}
          <ResultsAndReports patientId={patient.id} />

          <div className="h-4" />
        </div>
      </ScrollArea>
    </div>
  )
}
