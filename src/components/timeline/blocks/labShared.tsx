// Shared panel definitions, helpers, and UI used by LabOrderBlock and LabResultBlock

import { cn } from '../../../lib/utils'
import type { LabFlag, LabResult } from '../../../types'

// ──────────────────────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────────────────────

export interface TestDef {
  id:        string
  name:      string
  unit:      string
  ref_low:   number | null
  ref_high:  number | null
}

export interface PanelDef {
  id:    string
  label: string
  tests: TestDef[]
}

// ──────────────────────────────────────────────────────────────
// Panel catalogue
// ──────────────────────────────────────────────────────────────

export const PANELS: PanelDef[] = [
  {
    id: 'cbc', label: 'CBC — Complete Blood Count',
    tests: [
      { id: 'wbc',   name: 'WBC',          unit: '×10⁹/L',  ref_low: 4.0,  ref_high: 11.0 },
      { id: 'rbc',   name: 'RBC',          unit: '×10¹²/L', ref_low: 4.5,  ref_high: 5.5  },
      { id: 'hb',    name: 'Haemoglobin',  unit: 'g/dL',    ref_low: 12.0, ref_high: 17.5 },
      { id: 'hct',   name: 'Haematocrit',  unit: '%',       ref_low: 37,   ref_high: 52   },
      { id: 'mcv',   name: 'MCV',          unit: 'fL',      ref_low: 80,   ref_high: 100  },
      { id: 'plt',   name: 'Platelets',    unit: '×10⁹/L',  ref_low: 150,  ref_high: 400  },
      { id: 'neut',  name: 'Neutrophils',  unit: '×10⁹/L',  ref_low: 1.8,  ref_high: 7.5  },
      { id: 'lymph', name: 'Lymphocytes',  unit: '×10⁹/L',  ref_low: 1.0,  ref_high: 4.8  },
      { id: 'mono',  name: 'Monocytes',    unit: '×10⁹/L',  ref_low: 0.2,  ref_high: 1.0  },
      { id: 'eos',   name: 'Eosinophils',  unit: '×10⁹/L',  ref_low: 0.0,  ref_high: 0.5  },
    ],
  },
  {
    id: 'metabolic', label: 'Metabolic / Renal Panel',
    tests: [
      { id: 'na',   name: 'Sodium',      unit: 'mmol/L', ref_low: 136,  ref_high: 145  },
      { id: 'k',    name: 'Potassium',   unit: 'mmol/L', ref_low: 3.5,  ref_high: 5.1  },
      { id: 'cl',   name: 'Chloride',    unit: 'mmol/L', ref_low: 98,   ref_high: 106  },
      { id: 'hco3', name: 'Bicarbonate', unit: 'mmol/L', ref_low: 22,   ref_high: 29   },
      { id: 'urea', name: 'Urea',        unit: 'mmol/L', ref_low: 2.5,  ref_high: 7.8  },
      { id: 'cr',   name: 'Creatinine',  unit: 'μmol/L', ref_low: 60,   ref_high: 110  },
      { id: 'gluc', name: 'Glucose',     unit: 'mmol/L', ref_low: 3.9,  ref_high: 5.8  },
      { id: 'egfr', name: 'eGFR',        unit: 'mL/min', ref_low: 60,   ref_high: null },
      { id: 'mg',   name: 'Magnesium',   unit: 'mmol/L', ref_low: 0.7,  ref_high: 1.0  },
      { id: 'phos', name: 'Phosphate',   unit: 'mmol/L', ref_low: 0.8,  ref_high: 1.5  },
    ],
  },
  {
    id: 'lft', label: 'LFT — Liver Function',
    tests: [
      { id: 'tbil', name: 'Total Bilirubin',  unit: 'μmol/L', ref_low: 0,  ref_high: 21  },
      { id: 'dbil', name: 'Direct Bilirubin', unit: 'μmol/L', ref_low: 0,  ref_high: 5   },
      { id: 'alt',  name: 'ALT',              unit: 'U/L',    ref_low: 0,  ref_high: 56  },
      { id: 'ast',  name: 'AST',              unit: 'U/L',    ref_low: 0,  ref_high: 40  },
      { id: 'alp',  name: 'ALP',              unit: 'U/L',    ref_low: 30, ref_high: 120 },
      { id: 'ggt',  name: 'GGT',              unit: 'U/L',    ref_low: 0,  ref_high: 60  },
      { id: 'tp',   name: 'Total Protein',    unit: 'g/L',    ref_low: 60, ref_high: 80  },
      { id: 'alb',  name: 'Albumin',          unit: 'g/L',    ref_low: 35, ref_high: 50  },
    ],
  },
  {
    id: 'tft', label: 'TFT — Thyroid Function',
    tests: [
      { id: 'tsh', name: 'TSH',     unit: 'mIU/L',  ref_low: 0.4, ref_high: 4.0  },
      { id: 'ft4', name: 'Free T4', unit: 'pmol/L', ref_low: 9.0, ref_high: 23.0 },
      { id: 'ft3', name: 'Free T3', unit: 'pmol/L', ref_low: 3.5, ref_high: 6.5  },
    ],
  },
  {
    id: 'coag', label: 'Coagulation Screen',
    tests: [
      { id: 'pt',   name: 'PT',         unit: 'seconds', ref_low: 11,  ref_high: 13.5 },
      { id: 'aptt', name: 'APTT',       unit: 'seconds', ref_low: 25,  ref_high: 35   },
      { id: 'inr',  name: 'INR',        unit: '',        ref_low: 0.8, ref_high: 1.2  },
      { id: 'fibr', name: 'Fibrinogen', unit: 'g/L',     ref_low: 2.0, ref_high: 4.0  },
      { id: 'ddim', name: 'D-Dimer',    unit: 'μg/mL',   ref_low: null,ref_high: 0.5  },
    ],
  },
  {
    id: 'lipids', label: 'Lipid Panel',
    tests: [
      { id: 'tchol', name: 'Total Cholesterol', unit: 'mmol/L', ref_low: null, ref_high: 5.2  },
      { id: 'ldl',   name: 'LDL',               unit: 'mmol/L', ref_low: null, ref_high: 2.6  },
      { id: 'hdl',   name: 'HDL',               unit: 'mmol/L', ref_low: 1.0,  ref_high: null },
      { id: 'tg',    name: 'Triglycerides',      unit: 'mmol/L', ref_low: null, ref_high: 1.7  },
    ],
  },
  {
    id: 'cardiac', label: 'Cardiac Markers',
    tests: [
      { id: 'tropi', name: 'Troponin I', unit: 'ng/mL', ref_low: null, ref_high: 0.04 },
      { id: 'tropt', name: 'Troponin T', unit: 'ng/mL', ref_low: null, ref_high: 0.01 },
      { id: 'ck',    name: 'CK',         unit: 'U/L',   ref_low: 30,   ref_high: 200  },
      { id: 'ckmb',  name: 'CK-MB',      unit: 'U/L',   ref_low: null, ref_high: 25   },
      { id: 'bnp',   name: 'BNP',        unit: 'pg/mL', ref_low: null, ref_high: 100  },
    ],
  },
  {
    id: 'abg', label: 'ABG — Arterial Blood Gas',
    tests: [
      { id: 'ph',    name: 'pH',          unit: '',        ref_low: 7.35, ref_high: 7.45 },
      { id: 'pao2',  name: 'PaO₂',        unit: 'mmHg',   ref_low: 80,   ref_high: 100  },
      { id: 'paco2', name: 'PaCO₂',       unit: 'mmHg',   ref_low: 35,   ref_high: 45   },
      { id: 'hco3',  name: 'HCO₃⁻',       unit: 'mmol/L', ref_low: 22,   ref_high: 26   },
      { id: 'be',    name: 'Base excess',  unit: 'mmol/L', ref_low: -2,   ref_high: 2    },
      { id: 'lact',  name: 'Lactate',      unit: 'mmol/L', ref_low: 0.5,  ref_high: 2.0  },
      { id: 'sao2',  name: 'SaO₂',         unit: '%',      ref_low: 94,   ref_high: 100  },
    ],
  },
  {
    id: 'urine', label: 'Urinalysis',
    tests: [
      { id: 'uph',   name: 'pH',          unit: '',        ref_low: 4.5,  ref_high: 8.0   },
      { id: 'usg',   name: 'Sp. Gravity', unit: '',        ref_low: 1.005,ref_high: 1.030 },
      { id: 'uprot', name: 'Protein',     unit: 'g/L',     ref_low: null, ref_high: 0.15  },
      { id: 'ugluc', name: 'Glucose',     unit: 'mmol/L',  ref_low: null, ref_high: 0.8   },
      { id: 'ucr',   name: 'Creatinine',  unit: 'mmol/L',  ref_low: null, ref_high: null  },
      { id: 'upcr',  name: 'PCR',         unit: 'mg/mmol', ref_low: null, ref_high: 15    },
    ],
  },
  {
    id: 'infl', label: 'Inflammatory Markers',
    tests: [
      { id: 'crp',  name: 'CRP',           unit: 'mg/L',  ref_low: null, ref_high: 5   },
      { id: 'esr',  name: 'ESR',           unit: 'mm/hr', ref_low: null, ref_high: 20  },
      { id: 'pct',  name: 'Procalcitonin', unit: 'ng/mL', ref_low: null, ref_high: 0.5 },
      { id: 'ferr', name: 'Ferritin',      unit: 'μg/L',  ref_low: 12,   ref_high: 300 },
    ],
  },
]

export const PANEL_MAP = Object.fromEntries(PANELS.map(p => [p.id, p]))

// ──────────────────────────────────────────────────────────────
// Flag helpers
// ──────────────────────────────────────────────────────────────

export function autoFlag(value: string, ref_low: number | null, ref_high: number | null): LabFlag {
  const n = parseFloat(value)
  if (isNaN(n)) return ''
  if (ref_high !== null && n > ref_high * 1.5) return 'HH'
  if (ref_high !== null && n > ref_high)        return 'H'
  if (ref_low  !== null && n < ref_low  * 0.5)  return 'LL'
  if (ref_low  !== null && n < ref_low)          return 'L'
  return ''
}

export function flagColor(flag: LabFlag): string {
  if (flag === 'HH' || flag === 'LL') return 'text-red-600 dark:text-red-400 font-bold'
  if (flag === 'H'  || flag === 'L')  return 'text-amber-600 dark:text-amber-400 font-semibold'
  return ''
}

export function flagRowBg(flag: LabFlag): string {
  if (flag === 'HH' || flag === 'LL') return 'bg-red-50 dark:bg-red-950/30'
  if (flag === 'H'  || flag === 'L')  return 'bg-amber-50 dark:bg-amber-950/20'
  return ''
}

export function FlagBadge({ flag }: { flag: LabFlag }) {
  if (!flag) return null
  const color = flag === 'HH' || flag === 'LL'
    ? 'bg-red-100 text-red-700 border-red-300 dark:bg-red-900/50 dark:text-red-300 dark:border-red-700'
    : 'bg-amber-100 text-amber-700 border-amber-300 dark:bg-amber-900/50 dark:text-amber-300 dark:border-amber-700'
  return <span className={cn('text-[10px] font-bold px-1 rounded border leading-none', color)}>{flag}</span>
}

// ──────────────────────────────────────────────────────────────
// Shared result row (edit)
// ──────────────────────────────────────────────────────────────

export function ResultRow({
  test,
  result,
  onChange,
}: {
  test: TestDef
  result: LabResult
  onChange: (r: LabResult) => void
}) {
  const refStr = test.ref_low !== null && test.ref_high !== null
    ? `${test.ref_low}–${test.ref_high}`
    : test.ref_low  !== null ? `≥ ${test.ref_low}`
    : test.ref_high !== null ? `≤ ${test.ref_high}`
    : ''

  return (
    <tr className={cn('border-b border-border/30 last:border-0', flagRowBg(result.flag))}>
      <td className="py-1 pr-3 text-xs text-muted-foreground whitespace-nowrap">{test.name}</td>
      <td className="py-1 pr-1.5">
        <input
          type="text"
          inputMode="decimal"
          value={result.value}
          onChange={e => {
            const v = e.target.value
            onChange({ ...result, value: v, flag: autoFlag(v, test.ref_low, test.ref_high) })
          }}
          placeholder="—"
          className={cn(
            'w-20 h-6 text-center text-xs rounded border border-input bg-background px-1',
            'focus:outline-none focus:ring-1 focus:ring-ring tabular-nums',
            flagColor(result.flag),
          )}
        />
      </td>
      <td className="py-1 pr-3 text-[11px] text-muted-foreground">{test.unit}</td>
      <td className="py-1 pr-3 text-[11px] text-muted-foreground/70">{refStr}</td>
      <td className="py-1 w-8"><FlagBadge flag={result.flag} /></td>
    </tr>
  )
}

// ──────────────────────────────────────────────────────────────
// Shared result table (view)
// ──────────────────────────────────────────────────────────────

export function ResultTable({
  panelId,
  results,
}: {
  panelId: string
  results: Record<string, LabResult>
}) {
  const panel = PANEL_MAP[panelId]
  if (!panel) return null
  const hasAny = panel.tests.some(t => results[`${panelId}.${t.id}`]?.value?.trim())
  if (!hasAny) return null

  return (
    <div>
      <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground mb-1">{panel.label}</p>
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-border/60">
            <th className="text-left font-semibold text-muted-foreground pb-0.5 pr-3 w-36">Test</th>
            <th className="text-right font-semibold text-muted-foreground pb-0.5 pr-2">Result</th>
            <th className="text-left font-semibold text-muted-foreground pb-0.5 pr-3 w-16">Unit</th>
            <th className="text-left font-semibold text-muted-foreground pb-0.5 w-24">Ref range</th>
            <th className="w-8" />
          </tr>
        </thead>
        <tbody>
          {panel.tests.map(test => {
            const key = `${panelId}.${test.id}`
            const r = results[key]
            if (!r?.value?.trim()) return null
            const refStr = test.ref_low !== null && test.ref_high !== null
              ? `${test.ref_low}–${test.ref_high}`
              : test.ref_low  !== null ? `≥ ${test.ref_low}`
              : test.ref_high !== null ? `≤ ${test.ref_high}`
              : '—'
            return (
              <tr key={key} className={cn('border-b border-border/30 last:border-0', flagRowBg(r.flag))}>
                <td className="py-0.5 pr-3 text-muted-foreground">{test.name}</td>
                <td className={cn('py-0.5 pr-2 text-right tabular-nums', flagColor(r.flag))}>{r.value}</td>
                <td className="py-0.5 pr-3 text-muted-foreground">{test.unit}</td>
                <td className="py-0.5 text-muted-foreground/70">{refStr}</td>
                <td className="py-0.5 pl-1"><FlagBadge flag={r.flag} /></td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
