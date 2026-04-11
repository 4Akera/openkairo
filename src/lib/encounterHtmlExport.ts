import { supabase } from './supabase'
import {
  fullName,
  formatDateTime,
  formatDateWithPrecision,
  calcAge,
  getPatientDob,
  getPatientGender,
} from './utils'
import type {
  Allergy,
  Block,
  BlockDefinition,
  DatePrecision,
  Encounter,
  Medication,
  NameFormat,
  Patient,
  PatientFieldDefinition,
  Problem,
} from '@/types'
import { PATIENT_REAL_COLUMNS } from '@/types'
import { renderBlockContentHtml } from './blockExportHtml'

// ============================================================
// Patient chart data fetching
// ============================================================

export interface PatientChartExportData {
  fieldDefs: PatientFieldDefinition[]
  allergies: Allergy[]
  problems: Problem[]
  medications: Medication[]
}

export async function fetchPatientChartForExport(patientId: string): Promise<PatientChartExportData> {
  const [defsRes, allergiesRes, problemsRes, medsRes] = await Promise.all([
    supabase.from('patient_field_definitions').select('*').eq('active', true).order('sort_order', { ascending: true }),
    supabase.from('patient_allergies').select('*').eq('patient_id', patientId).order('created_at', { ascending: false }),
    supabase.from('patient_problems').select('*').eq('patient_id', patientId).order('created_at', { ascending: false }),
    supabase.from('patient_medications').select('*').eq('patient_id', patientId).order('created_at', { ascending: false }),
  ])
  return {
    fieldDefs:   (defsRes.data    ?? []) as PatientFieldDefinition[],
    allergies:   (allergiesRes.data ?? []) as Allergy[],
    problems:    (problemsRes.data  ?? []) as Problem[],
    medications: (medsRes.data      ?? []) as Medication[],
  }
}

// ============================================================
// Helpers
// ============================================================

function esc(s: unknown): string {
  if (s == null) return ''
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function humanizeKey(key: string): string {
  return key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
}

function getDemographicsDisplay(patient: Patient, def: PatientFieldDefinition): string {
  const raw = PATIENT_REAL_COLUMNS.has(def.slug)
    ? (() => {
        const col = (patient as unknown as Record<string, unknown>)[def.slug]
        if (col != null && String(col).trim()) return String(col)
        const cf = patient.custom_fields?.[def.slug]
        return cf != null ? String(cf) : ''
      })()
    : String(patient.custom_fields?.[def.slug] ?? '')
  if (!raw) return ''
  if (def.field_type === 'select') return def.options.find(o => o.value === raw)?.label ?? raw
  return raw
}

function getDatePrecision(patient: Patient, slug: string): DatePrecision {
  const precKey = `${slug}_precision`
  const col = (patient as unknown as Record<string, unknown>)[precKey]
  if (col && typeof col === 'string') return col as DatePrecision
  const cf = patient.custom_fields?.[precKey]
  if (cf && typeof cf === 'string') return cf as DatePrecision
  return 'full'
}

function resolveDefinition(
  block: Block,
  definitions: BlockDefinition[],
  definitionMap: Record<string, BlockDefinition>,
): BlockDefinition | null {
  if (block.definition_id) {
    return definitions.find(d => d.id === block.definition_id) ?? definitionMap[block.type] ?? null
  }
  return definitionMap[block.type] ?? null
}

// ============================================================
// Block type accent colours (left-border stripe)
// ============================================================

const BLOCK_ACCENT: Record<string, string> = {
  vitals:              '#0ea5e9',
  note:                '#6366f1',
  hx_physical:         '#8b5cf6',
  plan:                '#10b981',
  meds:                '#f59e0b',
  nurse_note:          '#06b6d4',
  tour:                '#3b82f6',
  consultation:        '#f97316',
  dc_note:             '#64748b',
  score:               '#a855f7',
  lab_order:           '#14b8a6',
  lab_result:          '#0d9488',
  radiology_request:   '#6366f1',
  radiology_result:    '#4f46e5',
  procedure_note:      '#ec4899',
  anaesthetic_note:    '#be185d',
  pain_assessment:     '#ef4444',
  wound_care:          '#f97316',
  pharmacy_fulfillment:'#16a34a',
  media:               '#94a3b8',
}

function blockAccent(block: Block, def: BlockDefinition | null): string {
  // Try registry key → slug → fallback to muted
  const key = def?.registry_slug?.trim() || def?.slug || block.type
  return BLOCK_ACCENT[key] ?? def?.color ?? '#94a3b8'
}

// ============================================================
// Patient chart HTML section
// ============================================================

const DT = 'text-align:left;padding:0.4rem 0.65rem;border-bottom:1px solid #e2e8f0;vertical-align:top;font-size:0.85rem;'
const TH = `${DT}font-family:system-ui,sans-serif;font-weight:600;font-size:0.75rem;text-transform:uppercase;letter-spacing:0.04em;color:#64748b;background:#f8fafc;`

function chartTable(head: string, rows: string): string {
  return `<table style="width:100%;border-collapse:collapse;margin:0.5rem 0;">${head ? `<thead>${head}</thead>` : ''}<tbody>${rows}</tbody></table>`
}

function chartSectionHtml(patient: Patient, chart: PatientChartExportData, nameFormat: NameFormat): string {
  const dob    = getPatientDob(patient)
  const age    = calcAge(dob)
  const gender = getPatientGender(patient)

  // Demographics
  const demoRows = chart.fieldDefs.filter(def => def.slug !== 'photo_url').map(def => {
    let display = getDemographicsDisplay(patient, def)
    if (def.field_type === 'date' && display) display = formatDateWithPrecision(display, getDatePrecision(patient, def.slug))
    if (!display) return ''
    return `<tr><th style="${TH}">${esc(def.label)}</th><td style="${DT}">${esc(display)}</td></tr>`
  }).filter(Boolean).join('')
  const demoBlock = demoRows
    ? chartTable('', demoRows)
    : '<p style="color:#94a3b8;font-style:italic;font-size:0.85rem;">No demographics on file.</p>'

  // Allergies
  const sevColor: Record<string, string> = {
    mild:     'color:#065f46;background:#d1fae5;border:1px solid #6ee7b7;',
    moderate: 'color:#92400e;background:#fef3c7;border:1px solid #fcd34d;',
    severe:   'color:#7f1d1d;background:#fee2e2;border:1px solid #fca5a5;',
  }
  const allergyRows = chart.allergies.map(a => `<tr>
    <td style="${DT}font-weight:600;">${esc(a.allergen)}</td>
    <td style="${DT}">${esc(a.reaction ?? '—')}</td>
    <td style="${DT}">${a.severity ? `<span style="display:inline-block;padding:0.1rem 0.45rem;border-radius:20px;font-size:0.7rem;font-weight:700;${sevColor[a.severity] ?? ''}">${esc(a.severity)}</span>` : '—'}</td>
    <td style="${DT}color:#64748b;">${esc(a.notes ?? '—')}</td>
  </tr>`).join('')
  const allergiesBlock = chart.allergies.length === 0
    ? '<p style="color:#94a3b8;font-style:italic;font-size:0.85rem;">No known allergies recorded.</p>'
    : chartTable(
        `<tr><th style="${TH}">Allergen</th><th style="${TH}">Reaction</th><th style="${TH}">Severity</th><th style="${TH}">Notes</th></tr>`,
        allergyRows,
      )

  // Problems
  const importanceStyle: Record<string, string> = {
    high:   'color:#7f1d1d;background:#fee2e2;border:1px solid #fca5a5;',
    medium: 'color:#92400e;background:#fef3c7;border:1px solid #fcd34d;',
    low:    'color:#475569;background:#f1f5f9;border:1px solid #cbd5e1;',
  }
  const probRowHtml = (list: Problem[]) => list.map(p => `<tr>
    <td style="${DT}font-weight:600;">${esc(p.problem)}</td>
    <td style="${DT}">${p.importance ? `<span style="display:inline-block;padding:0.1rem 0.45rem;border-radius:20px;font-size:0.7rem;font-weight:700;${importanceStyle[p.importance] ?? ''}">${esc(p.importance)}</span>` : '—'}</td>
    <td style="${DT}color:#64748b;">${formatDateWithPrecision(p.onset_date, p.onset_date_precision)}</td>
    <td style="${DT}color:#64748b;white-space:pre-wrap;">${esc(p.notes ?? '—')}</td>
  </tr>`).join('')
  const activeP = chart.problems.filter(p => p.status === 'active')
  const resolvedP = chart.problems.filter(p => p.status === 'resolved')
  const problemsBlock = !activeP.length && !resolvedP.length
    ? '<p style="color:#94a3b8;font-style:italic;font-size:0.85rem;">No problem list entries.</p>'
    : `
      ${activeP.length ? `<p style="font-size:0.72rem;font-weight:700;text-transform:uppercase;letter-spacing:0.05em;color:#065f46;margin:0.7rem 0 0.3rem;">Active</p>${chartTable(
        `<tr><th style="${TH}">Problem</th><th style="${TH}">Importance</th><th style="${TH}">Onset</th><th style="${TH}">Notes</th></tr>`,
        probRowHtml(activeP),
      )}` : ''}
      ${resolvedP.length ? `<p style="font-size:0.72rem;font-weight:700;text-transform:uppercase;letter-spacing:0.05em;color:#64748b;margin:0.7rem 0 0.3rem;">Resolved</p>${chartTable(
        `<tr><th style="${TH}">Problem</th><th style="${TH}">Importance</th><th style="${TH}">Onset</th><th style="${TH}">Notes</th></tr>`,
        probRowHtml(resolvedP),
      )}` : ''}`

  // Medications
  const medRowHtml = (list: Medication[]) => list.map(m => `<tr>
    <td style="${DT}font-weight:600;">${esc(m.medication_name)}</td>
    <td style="${DT}">${esc(m.dosage ?? '—')}</td>
    <td style="${DT}">${esc(m.frequency ?? '—')}</td>
    <td style="${DT}">${esc(m.route ?? '—')}</td>
    <td style="${DT}color:#64748b;">${formatDateWithPrecision(m.start_date, m.start_date_precision)}</td>
    <td style="${DT}color:#64748b;">${esc(m.prescriber ?? '—')}</td>
    <td style="${DT}color:#64748b;">${esc(m.notes ?? '—')}</td>
  </tr>`).join('')
  const activeMeds = chart.medications.filter(m => m.status === 'active')
  const discMeds   = chart.medications.filter(m => m.status === 'discontinued')
  const medHead = `<tr><th style="${TH}">Medication</th><th style="${TH}">Dose</th><th style="${TH}">Frequency</th><th style="${TH}">Route</th><th style="${TH}">Start</th><th style="${TH}">Prescriber</th><th style="${TH}">Notes</th></tr>`
  const medsBlock = !activeMeds.length && !discMeds.length
    ? '<p style="color:#94a3b8;font-style:italic;font-size:0.85rem;">No medications recorded.</p>'
    : `
      ${activeMeds.length ? chartTable(medHead, medRowHtml(activeMeds)) : ''}
      ${discMeds.length ? `<p style="font-size:0.72rem;font-weight:700;text-transform:uppercase;letter-spacing:0.05em;color:#94a3b8;margin:0.7rem 0 0.3rem;">Discontinued</p>${chartTable(medHead, medRowHtml(discMeds))}` : ''}`

  const secStyle = 'font-family:system-ui,sans-serif;font-size:0.78rem;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;color:#64748b;margin:1.25rem 0 0.5rem;padding-bottom:0.3rem;border-bottom:1px dashed #e2e8f0;'

  return `
    <section style="background:#fff;border:1px solid #e2e8f0;border-radius:12px;padding:1.5rem 1.75rem;margin-bottom:1.5rem;box-shadow:0 1px 4px rgba(15,23,42,0.06);">
      <h2 style="font-family:system-ui,sans-serif;font-size:1rem;font-weight:700;color:#1e3a5f;margin:0 0 0.35rem;display:flex;align-items:center;gap:0.5rem;">
        <span style="width:3px;height:1rem;border-radius:2px;background:#6366f1;display:inline-block;"></span>
        Patient Chart
      </h2>
      <p style="font-size:0.88rem;color:#64748b;margin:0 0 1.25rem;">${esc(fullName(patient, nameFormat))} · MRN ${esc(patient.mrn)}${age ? ` · ${esc(age)}` : ''}${gender ? ` · ${esc(gender)}` : ''}</p>
      <p style="${secStyle}">Demographics</p>${demoBlock}
      <p style="${secStyle}">Allergies</p>${allergiesBlock}
      <p style="${secStyle}">Problem list</p>${problemsBlock}
      <p style="${secStyle}">Medications</p>${medsBlock}
    </section>
  `
}

// ============================================================
// Document styles
// ============================================================

const DOC_STYLES = `
  :root { color-scheme: light; }
  * { box-sizing: border-box; }
  body {
    margin: 0; padding: 2.5rem 1.5rem 5rem;
    font-family: 'Georgia', 'Times New Roman', serif;
    font-size: 15px; line-height: 1.6; color: #0f172a;
    background: #eef2f7;
  }
  .wrap { max-width: 860px; margin: 0 auto; }

  /* ── Masthead ── */
  .masthead {
    background: linear-gradient(135deg, #1e3a8a 0%, #0f172a 100%);
    color: #f0f9ff; padding: 2rem 2.25rem;
    border-radius: 14px; margin-bottom: 1.75rem;
    box-shadow: 0 6px 32px rgba(15,23,42,0.18);
  }
  .masthead h1 {
    margin: 0 0 0.6rem;
    font-family: system-ui, -apple-system, sans-serif;
    font-size: 1.4rem; font-weight: 700; letter-spacing: -0.02em;
    line-height: 1.25;
  }
  .masthead .meta { font-size: 0.87rem; opacity: 0.82; line-height: 1.65; }
  .masthead .meta strong { opacity: 1; }
  .masthead .status-badge {
    display: inline-block; margin-top: 1rem;
    padding: 0.25rem 0.75rem; border-radius: 20px;
    font-size: 0.72rem; font-family: system-ui, sans-serif;
    font-weight: 700; text-transform: uppercase; letter-spacing: 0.07em;
  }
  .masthead .status-open   { background: #d1fae5; color: #065f46; }
  .masthead .status-closed { background: #f1f5f9; color: #475569; }

  /* ── Timeline card ── */
  .timeline-card {
    background: #fff; border: 1px solid #e2e8f0;
    border-radius: 12px; padding: 1.5rem 1.75rem;
    margin-bottom: 1.5rem; box-shadow: 0 1px 4px rgba(15,23,42,0.06);
  }
  .timeline-card-title {
    font-family: system-ui, sans-serif; font-size: 1rem;
    font-weight: 700; color: #1e3a5f; margin: 0 0 1.25rem;
    padding-bottom: 0.5rem; border-bottom: 2px solid #e2e8f0;
    display: flex; align-items: center; gap: 0.5rem;
  }

  /* ── Individual block ── */
  .block-wrap {
    border-left: 3px solid #e2e8f0;
    padding-left: 1rem; margin-bottom: 1.5rem;
    padding-bottom: 1.5rem;
  }
  .block-wrap + .block-wrap { border-top: 1px solid #f1f5f9; padding-top: 1.25rem; }
  .block-head {
    display: flex; flex-wrap: wrap; align-items: center;
    gap: 0.4rem 0.75rem; margin-bottom: 0.75rem;
    font-family: system-ui, sans-serif;
  }
  .block-type-icon {
    display: inline-flex; align-items: center; justify-content: center;
    width: 1.6rem; height: 1.6rem; border-radius: 6px;
    font-size: 0.75rem; font-weight: 700;
    flex-shrink: 0;
  }
  .block-name { font-weight: 700; font-size: 0.95rem; color: #1e3a5f; }
  .block-meta { font-size: 0.78rem; color: #94a3b8; }
  .block-pin  { font-size: 0.68rem; font-weight: 700; color: #b45309; background: #fffbeb; padding: 0.12rem 0.4rem; border-radius: 4px; border: 1px solid #fde68a; }

  /* ── Footer ── */
  footer.export-foot {
    margin-top: 2.5rem; padding-top: 1rem;
    border-top: 1px solid #cbd5e1;
    font-size: 0.78rem; color: #94a3b8;
    font-family: system-ui, sans-serif; text-align: center;
    line-height: 1.6;
  }

  @media print {
    body { background: #fff; padding: 0; }
    .masthead { box-shadow: none; }
    .timeline-card, section { box-shadow: none; }
  }
`

// ============================================================
// Main builder
// ============================================================

export interface BuildEncounterHtmlOptions {
  patient:       Patient
  encounter:     Encounter
  blocks:        Block[]
  definitions:   BlockDefinition[]
  definitionMap: Record<string, BlockDefinition>
  nameFormat:    NameFormat
  includeChart:  boolean
  chart?:        PatientChartExportData | null
  exportedAt:    Date
  exportedBy?:   string | null
}

export function buildEncounterHtmlDocument(opts: BuildEncounterHtmlOptions): string {
  const { patient, encounter, blocks, definitions, definitionMap, nameFormat, includeChart, chart, exportedAt, exportedBy } = opts

  // Match Timeline.tsx sort: all blocks ordered by created_at ascending
  const sorted = [...blocks].sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
  )

  const encTitle   = encounter.title?.trim() || `Encounter ${encounter.id.slice(0, 8).toUpperCase()}`
  const statusCls  = encounter.status === 'open' ? 'status-open' : 'status-closed'
  const statusText = encounter.status === 'open' ? 'Open' : 'Closed'

  const blockHtml = sorted.map(block => {
    const def    = resolveDefinition(block, definitions, definitionMap)
    const title  = def?.name ?? humanizeKey(block.type)
    const accent = blockAccent(block, def)
    const meta   = [formatDateTime(block.created_at), block.author_name ?? null].filter(Boolean).join(' · ')
    const bodyHtml = renderBlockContentHtml(block, def)

    // Icon: first letter of title on colored bg
    const iconBg = `${accent}20`
    const iconColor = accent
    const iconLetter = title[0]?.toUpperCase() ?? '?'

    return `
      <div class="block-wrap" style="border-left-color:${accent};">
        <div class="block-head">
          <span class="block-type-icon" style="background:${iconBg};color:${iconColor};">${esc(iconLetter)}</span>
          <span class="block-name">${esc(title)}</span>
          ${block.is_pinned ? '<span class="block-pin">Pinned</span>' : ''}
          <span class="block-meta">${esc(meta)}</span>
        </div>
        ${bodyHtml}
      </div>`
  }).join('\n')

  const chartHtml   = includeChart && chart ? chartSectionHtml(patient, chart, nameFormat) : ''
  const exporterStr = exportedBy ? `<p>Exported by ${esc(exportedBy)}</p>` : ''

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${esc(encTitle)} — ${esc(patient.mrn)}</title>
  <style>${DOC_STYLES}</style>
</head>
<body>
<div class="wrap">
  <header class="masthead">
    <h1>${esc(encTitle)}</h1>
    <div class="meta">
      <div><strong>Patient</strong> — ${esc(fullName(patient, nameFormat))} &middot; MRN ${esc(patient.mrn)}</div>
      <div><strong>Encounter ID</strong> — ${esc(encounter.id)}</div>
      <div><strong>Exported</strong> — ${esc(formatDateTime(exportedAt.toISOString()))}</div>
      ${encounter.assigned_profile?.full_name ? `<div><strong>Assigned to</strong> — ${esc(encounter.assigned_profile.full_name)}</div>` : ''}
    </div>
    <span class="status-badge ${statusCls}">${esc(statusText)}</span>
  </header>

  ${chartHtml}

  <div class="timeline-card">
    <div class="timeline-card-title">
      <span style="width:3px;height:1rem;border-radius:2px;background:#0ea5e9;display:inline-block;"></span>
      Encounter Timeline
    </div>
    ${sorted.length === 0 ? '<p style="color:#94a3b8;font-style:italic;">No blocks in this encounter.</p>' : blockHtml}
  </div>

  <footer class="export-foot">
    ${exporterStr}
    <p>Attachments, time-series data, and file uploads are not included. This document is for reference only.</p>
  </footer>
</div>
</body>
</html>`
}

// ============================================================
// File download
// ============================================================

export function downloadHtmlFile(html: string, filename: string): void {
  const safe = filename.replace(/[/\\?%*:|"<>]/g, '-').slice(0, 180) || 'export.html'
  const blob = new Blob([html], { type: 'text/html;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = safe.endsWith('.html') ? safe : `${safe}.html`
  a.rel = 'noopener'
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}
