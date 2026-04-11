/**
 * Per-block static HTML renderers for the encounter export.
 * Each function returns an HTML string fragment with no JSON, no raw keys —
 * only the clinical content a reader needs.
 */

import type {
  Block,
  BlockDefinition,
  ConsultationContent,
  DCNoteContent,
  FieldDef,
  HxPhysicalContent,
  LabOrderContent,
  LabResultContent,
  MedItem,
  MedsContent,
  NoteContent,
  NurseNoteContent,
  PharmacyFulfillmentContent,
  PlanContent,
  RadiologyRequestContent,
  RadiologyResultContent,
} from '@/types'
import { PANELS, PANEL_MAP, autoFlag } from '../components/timeline/blocks/labShared.tsx'
import {
  RADIOLOGY_STUDY_MAP,
  formatRadiologyCustomLabel,
} from '../components/timeline/blocks/radiologyShared'
import { ROS_DEFS, EXAM_DEFS } from '../components/timeline/blocks/HxPhysicalBlock'
import { computeNews2, emptyVitals, type VitalsContent } from '../components/timeline/blocks/VitalsBlock'
import type { ScoreContent } from '../components/timeline/blocks/ScoreBlock'
import type { TourContent } from '../components/timeline/blocks/TourBlock'
import type { ProcedureNoteContent } from '../components/timeline/blocks/ProcedureNoteBlock'
import type { AnaestheticContent } from '../components/timeline/blocks/AnaestheticNoteBlock'
import type { PainAssessmentContent } from '../components/timeline/blocks/PainAssessmentBlock'
import type { WoundCareContent } from '../components/timeline/blocks/WoundCareBlock'
import { formatDateTime } from './utils'

// ============================================================
// Inline style constants
// ============================================================

const S = {
  // --- base section labels ---
  sectionLabel: 'font-size:0.7rem;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;color:#64748b;margin:0.9rem 0 0.35rem;',
  // --- prose text ---
  prose: 'font-size:0.9rem;line-height:1.65;white-space:pre-wrap;color:#0f172a;margin:0;',
  // --- emphasis ---
  muted: 'color:#94a3b8;font-style:italic;font-size:0.88rem;',
  // --- badge families ---
  badgeEmerald: 'display:inline-block;padding:0.1rem 0.55rem;border-radius:20px;border:1px solid #6ee7b7;background:#d1fae5;color:#065f46;font-size:0.7rem;font-weight:700;',
  badgeAmber: 'display:inline-block;padding:0.1rem 0.55rem;border-radius:20px;border:1px solid #fcd34d;background:#fef3c7;color:#92400e;font-size:0.7rem;font-weight:700;',
  badgeRose: 'display:inline-block;padding:0.1rem 0.55rem;border-radius:20px;border:1px solid #fca5a5;background:#fee2e2;color:#991b1b;font-size:0.7rem;font-weight:700;',
  badgeSlate: 'display:inline-block;padding:0.1rem 0.55rem;border-radius:20px;border:1px solid #cbd5e1;background:#f1f5f9;color:#475569;font-size:0.7rem;font-weight:700;',
  badgeBlue: 'display:inline-block;padding:0.1rem 0.55rem;border-radius:20px;border:1px solid #93c5fd;background:#dbeafe;color:#1e40af;font-size:0.7rem;font-weight:700;',
  badgeRed: 'display:inline-block;padding:0.1rem 0.55rem;border-radius:20px;border:1px solid #fca5a5;background:#fee2e2;color:#7f1d1d;font-size:0.7rem;font-weight:700;font-style:normal;',
  badgePurple: 'display:inline-block;padding:0.1rem 0.55rem;border-radius:20px;border:1px solid #c084fc;background:#f3e8ff;color:#6b21a8;font-size:0.7rem;font-weight:700;',
  badgeChip: 'display:inline-block;padding:0.1rem 0.5rem;border-radius:6px;border:1px solid #e2e8f0;background:#f8fafc;color:#475569;font-size:0.72rem;margin-right:0.3rem;margin-bottom:0.3rem;',
  // --- panel cards (vitals) ---
  vitalCardNormal: 'border:1px solid #e2e8f0;border-radius:8px;padding:0.5rem 0.7rem;background:#ffffff;',
  vitalCardAmber: 'border:1px solid #fcd34d;border-radius:8px;padding:0.5rem 0.7rem;background:#fffbeb;',
  vitalCardRed: 'border:1px solid #fca5a5;border-radius:8px;padding:0.5rem 0.7rem;background:#fff1f2;',
  vitalCardMuted: 'border:1px solid #e2e8f0;border-radius:8px;padding:0.5rem 0.7rem;background:#f8fafc;',
  // --- lab table flags ---
  flagHH: 'color:#b91c1c;font-weight:700;',
  flagH: 'color:#d97706;font-weight:600;',
  flagLL: 'color:#b91c1c;font-weight:700;',
  flagL: 'color:#d97706;font-weight:600;',
  rowBgHH: 'background:#fff1f2;',
  rowBgH: 'background:#fffbeb;',
} as const

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

function secLabel(text: string): string {
  return `<p style="${S.sectionLabel}">${esc(text)}</p>`
}

function prosePara(text: string | null | undefined): string {
  const t = (text ?? '').trim()
  if (!t) return ''
  return `<p style="${S.prose}">${esc(t)}</p>`
}

function labeledProse(label: string, text: string | null | undefined): string {
  const t = (text ?? '').trim()
  if (!t) return ''
  return `${secLabel(label)}<p style="${S.prose}">${esc(t)}</p>`
}

function emptyState(msg: string): string {
  return `<p style="${S.muted}">${esc(msg)}</p>`
}

function badge(text: string, style: string): string {
  return `<span style="${style}">${esc(text)}</span>`
}

function chip(text: string): string {
  return `<span style="${S.badgeChip}">${esc(text)}</span>`
}

function chipRow(items: string[]): string {
  if (!items.length) return ''
  return `<div style="margin:0.4rem 0;">${items.map(chip).join('')}</div>`
}

// ============================================================
// Vitals
// ============================================================

function vitalCardStyle(score: number, unmeasured: boolean): string {
  if (unmeasured) return S.vitalCardMuted
  if (score >= 3) return S.vitalCardRed
  if (score >= 1) return S.vitalCardAmber
  return S.vitalCardNormal
}

function vitalValueStyle(score: number): string {
  if (score >= 3) return 'color:#b91c1c;font-weight:700;font-size:1.05rem;'
  if (score >= 1) return 'color:#d97706;font-weight:700;font-size:1.05rem;'
  return 'color:#0f172a;font-weight:700;font-size:1.05rem;'
}

function vcard(label: string, value: string | null, unit: string, score: number, flags: string[]): string {
  const unmeasured = flags.includes('unmeasured')
  const cardStyle = vitalCardStyle(score, unmeasured)
  const valueStyle = vitalValueStyle(score)
  const visibleFlags = flags.filter(f => !['unmeasured', 'room_air'].includes(f))
    .map(f => {
      const map: Record<string, string> = {
        irregular: 'Irregular', undetected: 'Undetected', cant_measure: "Can't measure",
        on_pressor: 'On pressor', weak: 'Weak / thready', agonal: 'Agonal', assisted: 'Assisted',
        antipyretic: 'On antipyretic', nasal_cannula: 'Nasal cannula', simple_mask: 'Simple mask',
        nrb_mask: 'NRB mask', cpap_bipap: 'CPAP / BiPAP', intubated: 'Intubated',
      }
      return map[f] ?? f
    })
  return `
    <div style="${cardStyle}">
      <div style="font-size:0.65rem;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:0.05em;">${esc(label)}</div>
      ${unmeasured
        ? `<div style="color:#94a3b8;font-size:0.85rem;">—</div>`
        : `<div style="${valueStyle}">${esc(value ?? '—')}<span style="font-size:0.7rem;font-weight:400;color:#64748b;margin-left:2px;">${esc(unit)}</span></div>
           ${visibleFlags.length ? `<div style="font-size:0.65rem;color:#94a3b8;font-style:italic;">${visibleFlags.map(esc).join(', ')}</div>` : ''}`
      }
    </div>`
}

function renderVitals(c: VitalsContent): string {
  const news2 = computeNews2(c)

  const bpStr = (!c.bp_flags.includes('unmeasured') && c.bp_systolic !== null && c.bp_diastolic !== null)
    ? `${c.bp_systolic}/${c.bp_diastolic}`
    : (!c.bp_flags.includes('unmeasured') && c.bp_systolic !== null) ? `${c.bp_systolic}` : null
  const avpuLabels: Record<string, string> = { A: 'Alert', V: 'Voice', P: 'Pain', U: 'Unresponsive' }
  const avpuLabel = c.avpu ? (avpuLabels[c.avpu] ?? c.avpu) : null
  const avpuScore = news2.breakdown.avpu ?? 0
  const avpuUnmeasured = c.avpu === null

  const news2Colors: Record<string, { bg: string; text: string }> = {
    Low:    { bg: '#d1fae5', text: '#065f46' },
    Medium: { bg: '#fef3c7', text: '#92400e' },
    High:   { bg: '#fee2e2', text: '#7f1d1d' },
  }
  const riskLabel = news2.total <= 4 ? 'Low' : news2.total <= 6 ? 'Medium' : 'High'
  const riskColors = news2Colors[riskLabel]

  return `
    <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:0.5rem;margin-bottom:0.6rem;">
      ${vcard('BP', bpStr, 'mmHg', news2.breakdown.bp, c.bp_flags)}
      ${vcard('PR', c.pulse_rate !== null ? String(c.pulse_rate) : null, 'bpm', news2.breakdown.pr, c.pr_flags)}
      ${vcard('RR', c.resp_rate !== null ? String(c.resp_rate) : null, '/min', news2.breakdown.rr, c.rr_flags)}
      ${vcard('Temp', c.temperature !== null ? String(c.temperature) : null, `°${c.temp_unit}`, news2.breakdown.temp, c.temp_flags)}
      ${vcard('SpO₂', c.spo2 !== null ? `${c.spo2}%` : null, '', news2.breakdown.spo2 + (news2.breakdown.o2 ?? 0), c.spo2_flags)}
      <div style="${avpuUnmeasured ? S.vitalCardMuted : vitalCardStyle(avpuScore, avpuUnmeasured)}">
        <div style="font-size:0.65rem;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:0.05em;">AVPU</div>
        ${avpuUnmeasured ? `<div style="color:#94a3b8;font-size:0.85rem;">—</div>`
          : `<div style="${vitalValueStyle(avpuScore)}">${esc(avpuLabel ?? '—')}</div>`}
      </div>
    </div>
    ${news2.anyMeasured ? `
    <div style="border-radius:8px;border:1px solid ${riskColors.bg === '#fee2e2' ? '#fca5a5' : riskColors.bg === '#fef3c7' ? '#fcd34d' : '#6ee7b7'};background:${riskColors.bg};padding:0.6rem 0.9rem;display:flex;justify-content:space-between;align-items:center;">
      <div style="font-size:0.8rem;font-weight:700;color:${riskColors.text};">NEWS2</div>
      <div style="display:flex;align-items:center;gap:0.75rem;">
        <span style="font-size:1.6rem;font-weight:800;color:${riskColors.text};">${news2.total}</span>
        <span style="font-size:0.7rem;font-weight:700;color:${riskColors.text};border:1px solid currentColor;border-radius:4px;padding:0.1rem 0.4rem;">${riskLabel} Risk</span>
      </div>
    </div>` : ''}
  `
}

// ============================================================
// Note
// ============================================================

function renderNote(c: NoteContent): string {
  const body = (c.body ?? '').trim()
  if (!body) return emptyState('No note text.')
  return prosePara(body)
}

// ============================================================
// H&P
// ============================================================

function renderHxPhysical(c: HxPhysicalContent): string {
  const parts: string[] = []
  if (c.chief_complaint) {
    parts.push(`${secLabel('Chief Complaint')}<p style="font-weight:600;font-size:0.95rem;margin:0;">${esc(c.chief_complaint)}</p>`)
  }
  if (c.hpi?.trim()) {
    parts.push(labeledProse('History of Present Illness', c.hpi))
  }
  const ros = c.ros ?? {}
  const rosSystems = Object.entries(ROS_DEFS).filter(([key]) => {
    const sys = ros[key]; if (!sys) return false
    return Object.keys(sys.items).length > 0 || sys.notes
  })
  if (rosSystems.length > 0 || c.ros_notes) {
    const rosItems = rosSystems.map(([key, def]) => {
      const sys = ros[key]!
      const positives = def.items.filter(i => sys.items[i] === 'positive')
      const denied = def.items.filter(i => sys.items[i] === 'denied')
      const rows: string[] = []
      if (positives.length) {
        rows.push(`<div style="margin-top:0.25rem;flex-wrap:wrap;display:flex;gap:0.25rem;">${positives.map(i => `<span style="${S.badgeAmber}">${esc(i)}</span>`).join('')}</div>`)
      }
      if (denied.length) {
        rows.push(`<p style="font-size:0.78rem;color:#64748b;margin:0.2rem 0 0;"><span style="font-weight:600;">Denied:</span> ${esc(denied.join(', '))}</p>`)
      }
      if (sys.notes) {
        rows.push(`<p style="font-size:0.78rem;color:#64748b;font-style:italic;margin:0.2rem 0 0;">${esc(sys.notes)}</p>`)
      }
      return `<div style="border:1px solid #e2e8f0;border-radius:6px;padding:0.5rem 0.7rem;margin-bottom:0.4rem;">
        <span style="font-weight:600;font-size:0.82rem;">${esc(def.label)}</span>
        ${rows.join('')}
      </div>`
    }).join('')
    parts.push(`${secLabel(`Review of Systems (${rosSystems.length} system${rosSystems.length !== 1 ? 's' : ''})`)}<div>${rosItems}</div>`)
    if (c.ros_notes?.trim()) {
      parts.push(`<div style="border:1px solid #e2e8f0;border-radius:6px;padding:0.5rem 0.7rem;background:#f8fafc;margin-top:0.4rem;">
        <p style="${S.sectionLabel}">Additional ROS Notes</p>
        <p style="font-size:0.82rem;white-space:pre-wrap;margin:0;">${esc(c.ros_notes)}</p>
      </div>`)
    }
  }
  const exam = c.exam ?? {}
  const EXAM_NORMALS: Record<string, string[]> = {
    general:     ['No acute distress', 'Appears well', 'Alert and oriented'],
    heent:       ['Normocephalic / Atraumatic', 'PERRL', 'Trachea midline'],
    cardiac:     ['Regular rate and rhythm', 'S1 S2 normal', 'Peripheral pulses intact', 'Capillary refill < 2s'],
    respiratory: ['Clear to auscultation bilaterally'],
    abdomen:     ['Soft', 'Non-tender', 'Non-distended', 'Bowel sounds present'],
    obgyn_renal: [],
    neuro:       ['Alert and oriented x3', 'CN II–XII grossly intact', 'Motor strength 5/5', 'Sensory intact', 'DTRs 2+ symmetric', 'Gait normal', 'Cerebellar intact', 'Babinski negative'],
    other:       ['Skin warm and dry', 'No rash'],
  }
  const examSystems = Object.entries(EXAM_DEFS).filter(([key]) => {
    const sys = exam[key]; if (!sys) return false
    return Object.keys(sys.items).length > 0 || sys.notes
  })
  if (examSystems.length > 0 || c.exam_notes) {
    const examItems = examSystems.map(([key, def]) => {
      const sys = exam[key]!
      const normals = EXAM_NORMALS[key] ?? []
      const present = def.items.filter(i => sys.items[i] === 'present')
      const absent = def.items.filter(i => sys.items[i] === 'absent')
      const presentNormal = present.filter(i => normals.includes(i))
      const presentAbnormal = present.filter(i => !normals.includes(i))
      const parts2: string[] = []
      if (presentNormal.length) parts2.push(`<span style="color:#065f46;">${esc(presentNormal.join(', '))}</span>`)
      if (presentAbnormal.length) parts2.push(`<span style="color:#92400e;font-weight:600;">${esc(presentAbnormal.join(', '))}</span>`)
      if (absent.length) parts2.push(`<span style="color:#64748b;"><span style="font-weight:600;">Absent:</span> ${esc(absent.join(', '))}</span>`)
      if (sys.notes) parts2.push(`<span style="color:#64748b;font-style:italic;">${esc(sys.notes)}</span>`)
      return `<div style="border:1px solid #e2e8f0;border-radius:6px;padding:0.5rem 0.7rem;margin-bottom:0.4rem;font-size:0.82rem;">
        <span style="font-weight:600;">${esc(def.label)}: </span>${parts2.join('<span style="color:#94a3b8;"> · </span>')}
      </div>`
    }).join('')
    parts.push(`${secLabel(`Physical Examination (${examSystems.length} system${examSystems.length !== 1 ? 's' : ''})`)}<div>${examItems}</div>`)
    if (c.exam_notes?.trim()) {
      parts.push(`<div style="border:1px solid #e2e8f0;border-radius:6px;padding:0.5rem 0.7rem;background:#f8fafc;margin-top:0.4rem;">
        <p style="${S.sectionLabel}">Additional Exam Notes</p>
        <p style="font-size:0.82rem;white-space:pre-wrap;margin:0;">${esc(c.exam_notes)}</p>
      </div>`)
    }
  }
  if (!parts.length) return emptyState('No history and physical documented.')
  return parts.join('\n')
}

// ============================================================
// Assessment & Plan
// ============================================================

const IMPORTANCE_BADGE: Record<string, string> = {
  high:   S.badgeRose,
  medium: S.badgeAmber,
  low:    S.badgeSlate,
}

function renderPlan(c: PlanContent): string {
  const assessment = (c.assessment ?? '').trim()
  const problems = c.problems ?? []
  const followup = (c.followup ?? '').trim()
  if (!assessment && !problems.length && !followup) return emptyState('No assessment and plan documented.')
  const parts: string[] = []
  if (assessment) parts.push(labeledProse('Assessment / Impression', assessment))
  if (problems.length) {
    const items = problems.map((p, i) => `
      <li style="display:flex;gap:0.65rem;margin-bottom:0.75rem;">
        <span style="display:flex;align-items:center;justify-content:center;min-width:1.4rem;height:1.4rem;border-radius:50%;background:#eff6ff;color:#2563eb;font-size:0.72rem;font-weight:700;flex-shrink:0;margin-top:0.1rem;">${i + 1}</span>
        <div>
          <div style="display:flex;align-items:center;gap:0.4rem;flex-wrap:wrap;">
            <span style="font-weight:600;font-size:0.9rem;">${esc(p.problem || '—')}</span>
            ${p.importance ? `<span style="${IMPORTANCE_BADGE[p.importance] ?? S.badgeSlate}">${esc(p.importance)}</span>` : ''}
          </div>
          ${p.plan?.trim() ? `<p style="font-size:0.82rem;color:#475569;margin:0.2rem 0 0;white-space:pre-wrap;line-height:1.55;">${esc(p.plan)}</p>` : ''}
        </div>
      </li>`).join('')
    parts.push(`${secLabel(`Problem-based Plan (${problems.length})`)}
      <ol style="margin:0;padding:0;list-style:none;">${items}</ol>`)
  }
  if (followup) parts.push(labeledProse('Disposition / Follow-up', followup))
  return parts.join('\n')
}

// ============================================================
// Medications
// ============================================================

function renderMedItem(m: MedItem): string {
  const meta = [m.dose, m.route, m.freq, m.duration].filter(Boolean).join(' · ')
  const statusBadge: Record<MedItem['status'], string> = {
    active: '',
    held: `<span style="${S.badgeAmber}">HELD</span>`,
    discontinued: `<span style="${S.badgeSlate}">DISCONTINUED</span>`,
  }
  const nameStyle = m.status === 'discontinued'
    ? 'font-weight:600;text-decoration:line-through;color:#94a3b8;'
    : 'font-weight:600;color:#0f172a;'
  return `<div style="display:flex;align-items:baseline;gap:0.5rem;padding:0.25rem 0;border-bottom:1px solid #f1f5f9;flex-wrap:wrap;">
    <span style="${nameStyle}">${esc(m.name)}</span>
    ${meta ? `<span style="font-size:0.78rem;color:#64748b;">${esc(meta)}</span>` : ''}
    ${m.indication ? `<span style="font-size:0.72rem;color:#94a3b8;font-style:italic;">(${esc(m.indication)})</span>` : ''}
    ${statusBadge[m.status] ?? ''}
  </div>`
}

function renderMeds(c: MedsContent): string {
  const meds = (c.meds ?? []).filter(m => m.name.trim())
  if (!meds.length) return emptyState('No medications recorded.')
  const active = meds.filter(m => m.status === 'active')
  const held = meds.filter(m => m.status === 'held')
  const disc = meds.filter(m => m.status === 'discontinued')
  const parts: string[] = []
  if (active.length) parts.push(active.map(renderMedItem).join(''))
  if (held.length) {
    parts.push(`${secLabel('Held')}${held.map(renderMedItem).join('')}`)
  }
  if (disc.length) {
    parts.push(`${secLabel('Discontinued')}${disc.map(renderMedItem).join('')}`)
  }
  return parts.join('\n')
}

// ============================================================
// Nurse Note
// ============================================================

function renderNurseNote(c: NurseNoteContent): string {
  const entries = [...(c.entries ?? [])].sort(
    (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
  )
  if (!entries.length) return emptyState('No entries yet.')
  return `<div style="position:relative;">${entries.map((e, i) => {
    const isLast = i === entries.length - 1
    const d = new Date(e.timestamp)
    const time = d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
    return `<div style="position:relative;padding-left:1.4rem;${isLast ? '' : 'padding-bottom:1rem;'}">
      ${!isLast ? `<div style="position:absolute;left:6px;top:14px;bottom:0;width:1px;background:#e2e8f0;"></div>` : ''}
      <div style="position:absolute;left:0;top:4px;width:13px;height:13px;border-radius:50%;border:2px solid #93c5fd;background:#fff;"></div>
      <div style="display:flex;align-items:center;gap:0.5rem;margin-bottom:0.25rem;">
        <span style="font-size:0.78rem;font-weight:700;color:#0f172a;">${esc(time)}</span>
        ${e.author ? `<span style="font-size:0.72rem;color:#94a3b8;">· ${esc(e.author)}</span>` : ''}
      </div>
      <p style="${S.prose}">${esc(e.text)}</p>
    </div>`
  }).join('')}</div>`
}

// ============================================================
// Ward Round (SOAP / Tour)
// ============================================================

function renderTour(c: TourContent): string {
  const sections = [
    { label: 'S — Subjective', value: c.subjective },
    { label: 'O — Objective', value: c.objective },
    { label: 'A — Assessment', value: c.assessment },
    { label: 'P — Plan', value: c.plan },
  ].filter(s => s.value?.trim())
  const tasks = c.tasks ?? []
  if (!sections.length && !tasks.length) return emptyState('No ward round note documented.')
  const colors: Record<string, string> = {
    'S — Subjective': '#3b82f6',
    'O — Objective': '#8b5cf6',
    'A — Assessment': '#f59e0b',
    'P — Plan': '#10b981',
  }
  const sectionHtml = sections.map(s => {
    const accent = colors[s.label] ?? '#64748b'
    return `<div style="border-left:3px solid ${accent};padding-left:0.75rem;margin-bottom:0.75rem;">
      <p style="font-size:0.7rem;font-weight:700;text-transform:uppercase;letter-spacing:0.05em;color:${accent};margin:0 0 0.25rem;">${esc(s.label)}</p>
      <p style="${S.prose}">${esc(s.value!)}</p>
    </div>`
  }).join('')
  const done = tasks.filter(t => t.done).length
  const pending = tasks.filter(t => !t.done).length
  const taskHtml = tasks.length ? `
    ${secLabel(`Tasks${done > 0 ? ` · ${done} done` : ''}${pending > 0 ? ` · ${pending} pending` : ''}`)}
    <ul style="margin:0;padding:0;list-style:none;">${tasks.map(t => `
      <li style="display:flex;gap:0.5rem;align-items:flex-start;margin-bottom:0.3rem;font-size:0.85rem;${t.done ? 'color:#94a3b8;text-decoration:line-through;' : ''}">
        <span style="font-size:0.9rem;flex-shrink:0;">${t.done ? '✓' : '○'}</span>
        ${esc(t.text)}
      </li>`).join('')}
    </ul>` : ''
  return sectionHtml + taskHtml
}

// ============================================================
// Consultation
// ============================================================

function renderConsultation(c: ConsultationContent): string {
  if (!c.service && !c.reason && !c.question) return emptyState('No consultation details.')
  const statusBadge: Record<string, string> = {
    requested:    S.badgeAmber,
    acknowledged: S.badgeBlue,
    answered:     S.badgeEmerald,
  }
  const urgencyBadge: Record<string, string> = {
    routine: S.badgeSlate,
    urgent:  S.badgeAmber,
    stat:    S.badgeRose,
  }
  const parts: string[] = []
  parts.push(`<div style="display:flex;flex-wrap:wrap;gap:0.4rem;align-items:center;margin-bottom:0.5rem;">
    ${c.service ? `<span style="font-weight:700;font-size:0.95rem;">${esc(c.service)}</span>` : ''}
    ${c.urgency ? `<span style="${urgencyBadge[c.urgency] ?? S.badgeSlate}">${esc(c.urgency.toUpperCase())}</span>` : ''}
    <span style="${statusBadge[c.status] ?? S.badgeSlate}">${esc(c.status)}</span>
  </div>`)
  if (c.reason?.trim()) parts.push(labeledProse('Reason', c.reason))
  if (c.clinical_summary?.trim()) parts.push(labeledProse('Clinical summary', c.clinical_summary))
  if (c.question?.trim()) parts.push(labeledProse('Question', c.question))
  if (c.status === 'answered' && c.answer?.trim()) {
    parts.push(`<div style="border:1px solid #6ee7b7;border-radius:8px;padding:0.75rem;background:#f0fdf4;margin-top:0.5rem;">
      ${secLabel('Response')}
      <p style="${S.prose}">${esc(c.answer)}</p>
      ${c.answered_by ? `<p style="font-size:0.75rem;color:#065f46;margin:0.3rem 0 0;">— ${esc(c.answered_by)}${c.answered_at ? `, ${formatDateTime(c.answered_at)}` : ''}</p>` : ''}
    </div>`)
  }
  return parts.join('\n')
}

// ============================================================
// Discharge Note
// ============================================================

function renderDCNote(c: DCNoteContent): string {
  const primaries = c.diagnoses.filter(d => d.primary)
  const secondaries = c.diagnoses.filter(d => !d.primary)
  const activeMeds = c.discharge_meds.filter(m => m.name.trim())
  if (!primaries.length && !c.admission_reason && !c.hospital_course) return emptyState('No discharge note documented.')

  const conditionBadge: Record<string, string> = {
    improved: S.badgeEmerald,
    stable:   S.badgeBlue,
    critical: S.badgeRose,
    deceased: S.badgeSlate,
  }
  const parts: string[] = []
  if (c.diagnoses.length || c.condition) {
    parts.push(`${secLabel('Diagnoses')}
      ${c.condition ? `<span style="${conditionBadge[c.condition] ?? S.badgeSlate};margin-bottom:0.35rem;display:inline-block;">${esc(c.condition.charAt(0).toUpperCase() + c.condition.slice(1))}</span>` : ''}
      ${primaries.map(d => `<div style="font-size:0.9rem;font-weight:600;margin-bottom:0.2rem;">${esc(d.text)}</div>`).join('')}
      ${secondaries.length ? `<div style="font-size:0.82rem;color:#475569;margin-top:0.3rem;">${secondaries.map(d => esc(d.text)).join(', ')}</div>` : ''}`)
  }
  if (c.admission_reason?.trim()) parts.push(labeledProse('Admission reason', c.admission_reason))
  if (c.hospital_course?.trim()) parts.push(labeledProse('Hospital course', c.hospital_course))
  if (activeMeds.length) {
    const medRows = activeMeds.map(m => {
      const meta = [m.dose, m.route, m.freq].filter(Boolean).join(' ')
      return `<tr>
        <td style="padding:0.3rem 0.5rem;font-weight:600;font-size:0.82rem;">${esc(m.name)}</td>
        <td style="padding:0.3rem 0.5rem;font-size:0.8rem;color:#475569;">${esc(meta)}</td>
        <td style="padding:0.3rem 0.5rem;font-size:0.78rem;color:#94a3b8;">${esc(m.notes)}</td>
      </tr>`
    }).join('')
    parts.push(`${secLabel('Discharge medications')}
      <table style="width:100%;border-collapse:collapse;border:1px solid #e2e8f0;border-radius:6px;overflow:hidden;">
        <thead><tr style="background:#f8fafc;">
          <th style="text-align:left;padding:0.35rem 0.5rem;font-size:0.72rem;color:#64748b;text-transform:uppercase;letter-spacing:0.04em;">Medication</th>
          <th style="text-align:left;padding:0.35rem 0.5rem;font-size:0.72rem;color:#64748b;text-transform:uppercase;letter-spacing:0.04em;">Dose / Route</th>
          <th style="text-align:left;padding:0.35rem 0.5rem;font-size:0.72rem;color:#64748b;text-transform:uppercase;letter-spacing:0.04em;">Notes</th>
        </tr></thead>
        <tbody>${medRows}</tbody>
      </table>`)
  }
  if (c.instructions?.trim()) parts.push(labeledProse('Instructions', c.instructions))
  if (c.followup?.trim()) parts.push(labeledProse('Follow-up', c.followup))
  if (c.pending?.trim()) parts.push(labeledProse('Pending results', c.pending))
  return parts.join('\n')
}

// ============================================================
// Clinical Score
// ============================================================

const SCORE_LABELS: Record<string, string> = {
  gcs: 'GCS — Glasgow Coma Scale',
  curb65: 'CURB-65',
  wells_dvt: "Wells' DVT Score",
  wells_pe: "Wells' PE Score",
  heart: 'HEART Score',
}

function renderScore(c: ScoreContent): string {
  if (c.score == null || !c.score_type) return emptyState('No score calculated.')
  const scoreName = SCORE_LABELS[c.score_type] ?? c.score_type
  const severityColors: Record<string, { bg: string; border: string; text: string }> = {
    Low: { bg: '#d1fae5', border: '#6ee7b7', text: '#065f46' },
    Mild: { bg: '#d1fae5', border: '#6ee7b7', text: '#065f46' },
    Moderate: { bg: '#fef3c7', border: '#fcd34d', text: '#92400e' },
    Medium: { bg: '#fef3c7', border: '#fcd34d', text: '#92400e' },
    High: { bg: '#fee2e2', border: '#fca5a5', text: '#7f1d1d' },
    Severe: { bg: '#fee2e2', border: '#fca5a5', text: '#7f1d1d' },
  }
  const sev = c.severity ?? ''
  const col = severityColors[sev] ?? { bg: '#f8fafc', border: '#e2e8f0', text: '#0f172a' }
  const inputs = c.inputs ?? {}
  const inputRows = Object.entries(inputs).filter(([, v]) => v !== '' && v !== false).map(([k, v]) => {
    const label = k.replace(/_/g, ' ').replace(/\b\w/g, ch => ch.toUpperCase())
    const val = typeof v === 'boolean' ? (v ? 'Yes' : 'No') : String(v)
    return `<tr>
      <td style="padding:0.25rem 0.5rem;font-size:0.8rem;color:#64748b;">${esc(label)}</td>
      <td style="padding:0.25rem 0.5rem;font-size:0.8rem;font-weight:600;text-align:right;">${esc(val)}</td>
    </tr>`
  }).join('')
  return `
    <div style="border:1px solid ${col.border};border-radius:10px;background:${col.bg};padding:0.75rem 1rem;display:flex;align-items:center;gap:1rem;margin-bottom:0.5rem;">
      <div style="text-align:center;min-width:4rem;">
        <div style="font-size:2.2rem;font-weight:800;color:${col.text};">${esc(String(c.score))}</div>
        <div style="font-size:0.65rem;text-transform:uppercase;letter-spacing:0.05em;color:${col.text};opacity:0.75;">score</div>
      </div>
      <div>
        <div style="font-weight:700;font-size:0.9rem;">${esc(scoreName)}</div>
        ${sev ? `<div style="font-size:0.82rem;font-weight:600;color:${col.text};margin-top:0.15rem;">${esc(sev)}</div>` : ''}
        ${c.calculated_at ? `<div style="font-size:0.72rem;color:#64748b;margin-top:0.2rem;">${esc(formatDateTime(c.calculated_at))}</div>` : ''}
      </div>
    </div>
    ${inputRows ? `<table style="width:100%;border-collapse:collapse;border:1px solid #e2e8f0;border-radius:6px;overflow:hidden;font-size:0.82rem;">
      <thead><tr style="background:#f8fafc;">
        <th style="text-align:left;padding:0.3rem 0.5rem;font-size:0.7rem;color:#64748b;text-transform:uppercase;">Input</th>
        <th style="text-align:right;padding:0.3rem 0.5rem;font-size:0.7rem;color:#64748b;text-transform:uppercase;">Value</th>
      </tr></thead>
      <tbody>${inputRows}</tbody>
    </table>` : ''}
  `
}

// ============================================================
// Lab Order
// ============================================================

function renderLabOrder(c: LabOrderContent): string {
  const panelLabels = (c.panels ?? []).map(id => PANEL_MAP[id]?.label ?? id)
  const customLabels = (c.custom ?? []).filter(cu => cu.name.trim()).map(cu => cu.name)
  const all = [...panelLabels, ...customLabels]
  if (!all.length) return emptyState('No panels selected.')
  const meta = [c.specimen, c.indication].filter(Boolean).join(' · ')
  return `${meta ? `<p style="font-size:0.82rem;color:#64748b;margin:0 0 0.4rem;font-style:italic;">${esc(meta)}</p>` : ''}
    ${chipRow(all)}`
}

// ============================================================
// Lab Result
// ============================================================

function flagValueStyle(flag: string): string {
  if (flag === 'HH' || flag === 'LL') return S.flagHH
  if (flag === 'H' || flag === 'L') return S.flagH
  return ''
}
function flagRowStyle(flag: string): string {
  if (flag === 'HH' || flag === 'LL') return S.rowBgHH
  if (flag === 'H' || flag === 'L') return S.rowBgH
  return ''
}
function flagBadge(flag: string): string {
  if (!flag) return ''
  const style = (flag === 'HH' || flag === 'LL')
    ? 'display:inline-block;padding:0 0.3rem;border-radius:4px;border:1px solid #fca5a5;background:#fee2e2;color:#7f1d1d;font-size:0.65rem;font-weight:700;'
    : 'display:inline-block;padding:0 0.3rem;border-radius:4px;border:1px solid #fcd34d;background:#fef3c7;color:#92400e;font-size:0.65rem;font-weight:700;'
  return `<span style="${style}">${esc(flag)}</span>`
}

function renderLabResult(c: LabResultContent): string {
  const hasAny = (c.panels ?? []).some(pid =>
    (PANEL_MAP[pid]?.tests ?? []).some(t => c.results[`${pid}.${t.id}`]?.value?.trim()),
  ) || (c.custom_results ?? []).some(r => r.value?.trim())
  if (!hasAny) {
    const label =
      c.status === 'collected' ? 'Specimen collected — results pending.' :
      c.status === 'processing' ? 'Analysis in progress — results pending.' :
      'No results recorded.'
    return emptyState(label)
  }
  const panels = (c.panels ?? []).filter(pid =>
    (PANEL_MAP[pid]?.tests ?? []).some(t => c.results[`${pid}.${t.id}`]?.value?.trim()),
  )
  const tableStyle = 'width:100%;border-collapse:collapse;margin-bottom:0.75rem;font-size:0.82rem;'
  const thStyle = 'text-align:left;padding:0.3rem 0.5rem;background:#f8fafc;font-size:0.7rem;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:0.04em;border-bottom:2px solid #e2e8f0;'
  const panelTables = panels.map(pid => {
    const panel = PANEL_MAP[pid]!
    const rows = panel.tests.map(test => {
      const key = `${pid}.${test.id}`
      const r = c.results[key]
      if (!r?.value?.trim()) return ''
      const effectiveFlag = r.flag || autoFlag(r.value, test.ref_low, test.ref_high)
      const ref = test.ref_low !== null && test.ref_high !== null
        ? `${test.ref_low}–${test.ref_high}`
        : test.ref_high !== null ? `≤ ${test.ref_high}` : '—'
      return `<tr style="${flagRowStyle(effectiveFlag)}">
        <td style="padding:0.3rem 0.5rem;color:#475569;">${esc(test.name)}</td>
        <td style="padding:0.3rem 0.5rem;text-align:right;${flagValueStyle(effectiveFlag)}">${esc(r.value)}</td>
        <td style="padding:0.3rem 0.5rem;color:#94a3b8;">${esc(test.unit)}</td>
        <td style="padding:0.3rem 0.5rem;color:#94a3b8;">${esc(ref)}</td>
        <td style="padding:0.3rem 0.5rem;">${flagBadge(effectiveFlag)}</td>
      </tr>`
    }).join('')
    return `<div style="margin-bottom:0.75rem;">
      <p style="${S.sectionLabel}">${esc(panel.label)}</p>
      <table style="${tableStyle}">
        <thead><tr>
          <th style="${thStyle}">Test</th>
          <th style="${thStyle};text-align:right;">Result</th>
          <th style="${thStyle}">Unit</th>
          <th style="${thStyle}">Ref range</th>
          <th style="${thStyle};width:2rem;"></th>
        </tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`
  }).join('')
  const customDefs = c.custom_defs ?? []
  const customResults = c.custom_results ?? []
  const customHasAny = customResults.some(r => r.value?.trim())
  const customTable = customHasAny ? `
    <p style="${S.sectionLabel}">Custom Tests</p>
    <table style="${tableStyle}">
      <thead><tr>
        <th style="${thStyle}">Test</th><th style="${thStyle};text-align:right;">Result</th>
        <th style="${thStyle}">Unit</th><th style="${thStyle}">Ref range</th>
        <th style="${thStyle};width:2rem;"></th>
      </tr></thead>
      <tbody>${customDefs.map((def, i) => {
        const r = customResults[i]
        if (!r?.value?.trim()) return ''
        const effectiveFlag = r.flag || autoFlag(r.value, parseFloat(def.ref_low ?? '') || null, parseFloat(def.ref_high ?? '') || null)
        const ref = def.ref_low && def.ref_high ? `${def.ref_low}–${def.ref_high}` : def.ref_high ? `≤ ${def.ref_high}` : '—'
        return `<tr style="${flagRowStyle(effectiveFlag)}">
          <td style="padding:0.3rem 0.5rem;color:#475569;">${esc(def.name)}</td>
          <td style="padding:0.3rem 0.5rem;text-align:right;${flagValueStyle(effectiveFlag)}">${esc(r.value)}</td>
          <td style="padding:0.3rem 0.5rem;color:#94a3b8;">${esc(def.unit)}</td>
          <td style="padding:0.3rem 0.5rem;color:#94a3b8;">${esc(ref)}</td>
          <td style="padding:0.3rem 0.5rem;">${flagBadge(effectiveFlag)}</td>
        </tr>`
      }).join('')}</tbody>
    </table>` : ''
  const notes = c.notes?.trim() ? labeledProse('Notes', c.notes) : ''
  return panelTables + customTable + notes
}

// ============================================================
// Radiology Request
// ============================================================

function renderRadiologyRequest(c: RadiologyRequestContent): string {
  const labels = (c.studies ?? []).map(id => RADIOLOGY_STUDY_MAP[id]?.label ?? id)
  const customLabels = (c.custom ?? []).map(formatRadiologyCustomLabel).filter(Boolean)
  const all = [...labels, ...customLabels]
  if (!all.length && !c.indication?.trim()) return emptyState('No imaging studies selected.')
  const parts: string[] = []
  if (c.indication?.trim()) parts.push(`<p style="font-size:0.85rem;color:#475569;font-style:italic;margin:0 0 0.4rem;">${esc(c.indication)}</p>`)
  if (all.length) parts.push(chipRow(all))
  if (c.contrast_note?.trim()) parts.push(`<p style="font-size:0.82rem;margin:0.3rem 0;"><span style="font-weight:600;">Contrast / allergy:</span> ${esc(c.contrast_note)}</p>`)
  if (c.notes_clinical?.trim()) parts.push(labeledProse('Clinical context', c.notes_clinical))
  if (c.notes_coordination?.trim()) parts.push(labeledProse('Coordination notes', c.notes_coordination))
  return parts.join('\n')
}

// ============================================================
// Radiology Result
// ============================================================

function renderRadiologyResult(c: RadiologyResultContent): string {
  const labels = (c.studies ?? []).map(id => RADIOLOGY_STUDY_MAP[id]?.label ?? id)
  const customLabels = (c.custom_defs ?? []).map(formatRadiologyCustomLabel).filter(Boolean)
  const all = [...labels, ...customLabels]
  const hasContent = !!(c.findings?.trim() || c.impression?.trim() || c.recommendations?.trim() || c.technique?.trim())
  if (!hasContent && !all.length) return emptyState('No report text entered.')
  const parts: string[] = []
  if (all.length) parts.push(chipRow(all))
  if (c.technique?.trim()) parts.push(labeledProse('Technique', c.technique))
  if (c.findings?.trim()) parts.push(labeledProse('Findings', c.findings))
  if (c.impression?.trim()) {
    parts.push(`<div style="border-left:3px solid #6366f1;padding-left:0.75rem;margin:0.6rem 0;">
      <p style="${S.sectionLabel};color:#6366f1;">Impression</p>
      <p style="${S.prose}">${esc(c.impression)}</p>
    </div>`)
  }
  if (c.recommendations?.trim()) parts.push(labeledProse('Recommendations', c.recommendations))
  return parts.join('\n')
}

// ============================================================
// Procedure Note
// ============================================================

function renderProcedureNote(c: ProcedureNoteContent): string {
  if (!c.procedure_name?.trim()) return emptyState('No procedure note documented.')
  const meta = [
    c.operator && `Operator: ${c.operator}`,
    c.assistant && `Assistant: ${c.assistant}`,
    c.consent && `Consent: ${c.consent}`,
    c.laterality && c.laterality !== 'na' && `Side: ${c.laterality}`,
  ].filter(Boolean) as string[]
  const sections = [
    { label: 'Indication', value: c.indication },
    { label: 'Site', value: c.site },
    { label: 'Technique', value: c.technique },
    { label: 'Findings', value: c.findings },
    { label: 'Specimens sent', value: c.specimens },
    { label: 'Complications', value: c.complications },
    { label: 'Condition after', value: c.condition_after },
  ].filter(s => s.value?.trim())
  return `
    <p style="font-weight:700;font-size:1rem;margin:0 0 0.2rem;">${esc(c.procedure_name)}</p>
    ${meta.length ? `<p style="font-size:0.8rem;color:#64748b;margin:0 0 0.5rem;">${esc(meta.join(' · '))}</p>` : ''}
    ${sections.map(s => labeledProse(s.label, s.value!)).join('\n')}
  `
}

// ============================================================
// Anaesthetic Note
// ============================================================

function renderAnaesthetic(c: AnaestheticContent): string {
  if (!c.type && !c.induction?.trim()) return emptyState('No anaesthetic note documented.')
  const airwayColor: Record<string, string> = {
    easy: `border:1px solid #6ee7b7;background:#d1fae5;color:#065f46;`,
    difficult: `border:1px solid #fcd34d;background:#fef3c7;color:#92400e;`,
    failed: `border:1px solid #fca5a5;background:#fee2e2;color:#7f1d1d;`,
  }
  const typeLabels: Record<string, string> = {
    GA: 'General Anaesthesia', spinal: 'Spinal', epidural: 'Epidural',
    regional: 'Regional', sedation: 'Sedation', local: 'Local',
  }
  const parts: string[] = []
  const badges: string[] = []
  if (c.type) badges.push(`<span style="${S.badgeSlate}">${esc(typeLabels[c.type] ?? c.type)}</span>`)
  if (c.asa_grade) badges.push(`<span style="${S.badgeSlate}">ASA ${esc(c.asa_grade)}</span>`)
  if (c.airway && airwayColor[c.airway]) badges.push(`<span style="display:inline-block;padding:0.1rem 0.55rem;border-radius:20px;font-size:0.7rem;font-weight:700;${airwayColor[c.airway]}">${esc(c.airway.charAt(0).toUpperCase() + c.airway.slice(1))} airway</span>`)
  if (c.duration_min) badges.push(`<span style="${S.badgeSlate}">${esc(c.duration_min)} min</span>`)
  if (badges.length) parts.push(`<div style="display:flex;flex-wrap:wrap;gap:0.35rem;margin-bottom:0.5rem;">${badges.join('')}</div>`)
  if (c.fluids || c.blood_loss_ml || c.urine_output_ml) {
    const stats = [
      c.fluids && `<span><strong>Fluids:</strong> ${esc(c.fluids)}</span>`,
      c.blood_loss_ml && `<span><strong>EBL:</strong> ${esc(c.blood_loss_ml)} mL</span>`,
      c.urine_output_ml && `<span><strong>UO:</strong> ${esc(c.urine_output_ml)} mL</span>`,
    ].filter(Boolean)
    parts.push(`<div style="display:flex;gap:1.5rem;font-size:0.82rem;color:#475569;flex-wrap:wrap;margin-bottom:0.4rem;">${stats.join('')}</div>`)
  }
  const prose = [
    { label: 'Intubation / airway device', value: c.intubation },
    { label: 'Induction agents', value: c.induction },
    { label: 'Maintenance', value: c.maintenance },
    { label: 'Reversal', value: c.reversal },
    { label: 'Complications', value: c.complications },
    { label: 'Recovery notes', value: c.recovery_notes },
  ].filter(s => s.value?.trim())
  prose.forEach(s => parts.push(labeledProse(s.label, s.value!)))
  return parts.join('\n')
}

// ============================================================
// Pain Assessment
// ============================================================

function renderPainAssessment(c: PainAssessmentContent): string {
  if (c.score == null && !c.location?.trim()) return emptyState('No pain assessment documented.')
  const scoreColors = (s: number | null) => {
    if (s == null) return { bg: '#f8fafc', border: '#e2e8f0', text: '#0f172a' }
    if (s <= 3) return { bg: '#d1fae5', border: '#6ee7b7', text: '#065f46' }
    if (s <= 6) return { bg: '#fef3c7', border: '#fcd34d', text: '#92400e' }
    return { bg: '#fee2e2', border: '#fca5a5', text: '#7f1d1d' }
  }
  const scoreLabel = (s: number | null) => {
    if (s == null) return 'Not assessed'
    if (s === 0) return 'Pain-free'
    if (s <= 3) return 'Mild'
    if (s <= 6) return 'Moderate'
    if (s <= 8) return 'Severe'
    return 'Excruciating'
  }
  const col = scoreColors(c.score ?? null)
  const parts: string[] = []
  const scoreBadges: string[] = []
  scoreBadges.push(`<div style="border:1px solid ${col.border};border-radius:10px;background:${col.bg};padding:0.6rem 1rem;display:inline-flex;align-items:center;gap:0.75rem;">
    <span style="font-size:2.5rem;font-weight:800;color:${col.text};">${c.score ?? '—'}</span>
    <div>
      <div style="font-size:0.72rem;color:${col.text};">/10</div>
      <div style="font-size:0.8rem;font-weight:700;color:${col.text};">${esc(scoreLabel(c.score ?? null))}</div>
    </div>
  </div>`)
  if (c.reassessment_score != null) {
    const rc = scoreColors(c.reassessment_score)
    scoreBadges.push(`<div style="border:1px solid ${rc.border};border-radius:10px;background:${rc.bg};padding:0.6rem 1rem;display:inline-flex;align-items:center;gap:0.75rem;">
      <div style="text-align:center;">
        <div style="font-size:0.7rem;color:${rc.text};">Re-assessment</div>
        <div style="font-size:2rem;font-weight:800;color:${rc.text};">${c.reassessment_score}</div>
      </div>
      ${c.reassessment_time ? `<span style="font-size:0.78rem;color:${rc.text};">${esc(c.reassessment_time)}</span>` : ''}
    </div>`)
  }
  parts.push(`<div style="display:flex;flex-wrap:wrap;gap:0.5rem;margin-bottom:0.5rem;">${scoreBadges.join('')}</div>`)
  if (c.character?.length) {
    parts.push(`<div style="margin:0.4rem 0;">${c.character.map(ch => `<span style="${S.badgeSlate}">${esc(ch)}</span>`).join(' ')}</div>`)
  }
  const details = [
    { label: 'Location', value: c.location },
    { label: 'Radiation', value: c.radiation },
    { label: 'Onset', value: c.onset },
    { label: 'Duration', value: c.duration },
    { label: 'Aggravating factors', value: c.aggravating },
    { label: 'Relieving factors', value: c.relieving },
    { label: 'Functional impact', value: c.functional_impact },
    { label: 'Intervention / management', value: c.intervention },
  ].filter(s => s.value?.trim())
  details.forEach(s => parts.push(labeledProse(s.label, s.value!)))
  return parts.join('\n')
}

// ============================================================
// Wound Care
// ============================================================

function renderWoundCare(c: WoundCareContent): string {
  if (!c.site?.trim()) return emptyState('No wound care documented.')
  const appColors: Record<string, string> = {
    Granulating:     S.badgeEmerald,
    Epithelialising: `display:inline-block;padding:0.1rem 0.55rem;border-radius:20px;border:1px solid #7dd3fc;background:#e0f2fe;color:#0369a1;font-size:0.7rem;font-weight:700;`,
    Sloughy:         S.badgeAmber,
    Necrotic:        `display:inline-block;padding:0.1rem 0.55rem;border-radius:20px;border:1px solid #a8a29e;background:#f5f5f4;color:#57534e;font-size:0.7rem;font-weight:700;`,
    Infected:        S.badgeRose,
    Healthy:         S.badgeEmerald,
    Haemorrhagic:    S.badgeRose,
    Fibrinous:       S.badgeAmber,
  }
  const parts: string[] = []
  parts.push(`<p style="font-weight:700;font-size:0.95rem;margin:0 0 0.2rem;">${esc(c.site)}</p>`)
  const meta: string[] = []
  if (c.wound_type) meta.push(c.wound_type.charAt(0).toUpperCase() + c.wound_type.slice(1))
  if (c.stage) meta.push(`Stage: ${c.stage}`)
  if (c.size) meta.push(`Size: ${c.size}`)
  if (meta.length) parts.push(`<p style="font-size:0.82rem;color:#64748b;margin:0 0 0.4rem;">${meta.map(esc).join(' · ')}</p>`)
  if (c.appearance?.length) {
    parts.push(`<div style="margin:0.3rem 0;">${c.appearance.map(a => `<span style="${appColors[a] ?? S.badgeSlate}">${esc(a)}</span>`).join(' ')}</div>`)
  }
  const details = [
    { label: 'Exudate', value: [c.exudate, c.exudate_type].filter(Boolean).join(', ') },
    { label: 'Periwound', value: c.periwound },
    { label: 'Dressing used', value: c.dressing_used },
    { label: 'Next change', value: c.next_change },
    { label: 'Notes', value: c.notes },
  ].filter(s => s.value?.trim())
  details.forEach(s => parts.push(labeledProse(s.label, s.value!)))
  return parts.join('\n')
}

// ============================================================
// Pharmacy Fulfillment
// ============================================================

function renderPharmacyFulfillment(c: PharmacyFulfillmentContent): string {
  const items = c.items ?? []
  if (!items.length) return emptyState('No items recorded.')
  const allDispensed = items.length > 0 && items.every(i => i.dispensed)
  const hasOOS = items.some(i => i.out_of_stock)
  const rows = items.map(item => `
    <tr style="${item.out_of_stock ? 'background:#fffbeb;' : ''}">
      <td style="padding:0.3rem 0.6rem;font-weight:600;font-size:0.82rem;">
        ${esc(item.name)}
        ${item.note ? `<div style="font-size:0.72rem;color:#94a3b8;font-weight:400;">${esc(item.note)}</div>` : ''}
      </td>
      <td style="padding:0.3rem 0.6rem;font-size:0.8rem;color:#475569;">${esc(item.quantity || '—')}</td>
      <td style="padding:0.3rem 0.6rem;font-size:0.78rem;">
        ${item.out_of_stock
          ? `<span style="${S.badgeAmber}">Out of stock</span>`
          : item.dispensed
          ? `<span style="${S.badgeEmerald}">Dispensed</span>`
          : `<span style="color:#94a3b8;">Pending</span>`}
      </td>
    </tr>`).join('')
  return `
    ${allDispensed && !hasOOS ? `<div style="margin-bottom:0.5rem;"><span style="${S.badgeEmerald}">✓ Fully dispensed</span></div>` : ''}
    ${hasOOS ? `<div style="margin-bottom:0.5rem;"><span style="${S.badgeAmber}">⚠ Partial — items out of stock</span></div>` : ''}
    <table style="width:100%;border-collapse:collapse;border:1px solid #e2e8f0;border-radius:6px;overflow:hidden;">
      <thead><tr style="background:#f8fafc;">
        <th style="text-align:left;padding:0.3rem 0.6rem;font-size:0.72rem;color:#64748b;text-transform:uppercase;letter-spacing:0.04em;border-bottom:1px solid #e2e8f0;">Medication / Item</th>
        <th style="text-align:left;padding:0.3rem 0.6rem;font-size:0.72rem;color:#64748b;text-transform:uppercase;letter-spacing:0.04em;border-bottom:1px solid #e2e8f0;width:6rem;">Qty</th>
        <th style="text-align:left;padding:0.3rem 0.6rem;font-size:0.72rem;color:#64748b;text-transform:uppercase;letter-spacing:0.04em;border-bottom:1px solid #e2e8f0;width:8rem;">Status</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>
    ${c.notes?.trim() ? labeledProse('Notes', c.notes) : ''}`
}

// ============================================================
// Dynamic (field-definition-based) fallback
// ============================================================

function formatDynamicFieldValue(field: FieldDef, value: unknown): string {
  if (value === null || value === undefined || value === '') return '—'
  if (field.type === 'checkbox') return value === true ? 'Yes' : 'No'
  if (field.type === 'multiselect') {
    const arr = Array.isArray(value) ? value : []
    if (!arr.length) return '—'
    return arr.map(v => {
      const s = String(v)
      return field.options?.find(o => o.value === s)?.label ?? s
    }).join(', ')
  }
  if (field.type === 'select') {
    const s = String(value)
    return field.options?.find(o => o.value === s)?.label ?? s
  }
  if (field.type === 'number') {
    const n = typeof value === 'number' ? value : Number(value)
    if (Number.isNaN(n)) return String(value)
    return `${n}${field.unit ? ` ${field.unit}` : ''}`
  }
  return String(value).trim() || '—'
}

function renderDynamic(content: Record<string, unknown>, def: BlockDefinition): string {
  const usedKeys = new Set<string>()
  const parts: string[] = []
  for (const field of def.fields ?? []) {
    if (field.type === 'section_header') {
      parts.push(`<p style="${S.sectionLabel}">${esc(field.label)}</p>`)
      continue
    }
    usedKeys.add(field.id)
    const raw = content[field.id]
    const formatted = formatDynamicFieldValue(field, raw)
    const isEmpty = formatted === '—' && (raw === undefined || raw === '' || raw === null)
    const isLong = typeof raw === 'string' && raw.length > 80
    if (isLong) {
      parts.push(`<div style="margin-bottom:0.5rem;">
        <p style="${S.sectionLabel}">${esc(field.label)}</p>
        <p style="${S.prose}">${esc(formatted)}</p>
      </div>`)
    } else {
      parts.push(`<div style="display:grid;grid-template-columns:minmax(140px,30%) 1fr;gap:0.4rem 0.8rem;margin-bottom:0.35rem;font-size:0.88rem;">
        <span style="color:#64748b;">${esc(field.label)}</span>
        <span style="${isEmpty ? 'color:#94a3b8;' : ''}${formatted === '—' ? '' : ''}">${esc(formatted)}</span>
      </div>`)
    }
  }
  return parts.join('\n') || emptyState('No content.')
}

// ============================================================
// Main dispatch
// ============================================================

export function renderBlockContentHtml(
  block: Block,
  def: BlockDefinition | null,
): string {
  if (block.state === 'masked') {
    return `<p style="${S.muted}">This block is restricted and its content is not included in this export.</p>`
  }
  const content = block.content as Record<string, unknown>

  // Use registry_slug if available, otherwise slug/type
  const renderKey = def?.registry_slug?.trim() || def?.slug || block.type

  switch (renderKey) {
    case 'vitals':
      return renderVitals({ ...emptyVitals(), ...content } as VitalsContent)
    case 'note':
      return renderNote(content as NoteContent)
    case 'hx_physical':
      return renderHxPhysical(content as HxPhysicalContent)
    case 'plan':
      return renderPlan(content as PlanContent)
    case 'meds':
      return renderMeds(content as MedsContent)
    case 'nurse_note':
      return renderNurseNote(content as NurseNoteContent)
    case 'tour':
      return renderTour(content as TourContent)
    case 'consultation':
      return renderConsultation(content as ConsultationContent)
    case 'dc_note':
      return renderDCNote(content as DCNoteContent)
    case 'score':
      return renderScore(content as ScoreContent)
    case 'lab_order':
      return renderLabOrder(content as LabOrderContent)
    case 'lab_result':
      return renderLabResult(content as LabResultContent)
    case 'radiology_request':
      return renderRadiologyRequest(content as RadiologyRequestContent)
    case 'radiology_result':
      return renderRadiologyResult(content as RadiologyResultContent)
    case 'procedure_note':
      return renderProcedureNote(content as ProcedureNoteContent)
    case 'anaesthetic_note':
      return renderAnaesthetic(content as AnaestheticContent)
    case 'pain_assessment':
      return renderPainAssessment(content as PainAssessmentContent)
    case 'wound_care':
      return renderWoundCare(content as WoundCareContent)
    case 'pharmacy_fulfillment':
      return renderPharmacyFulfillment(content as PharmacyFulfillmentContent)
    case 'media':
      return `<p style="${S.muted}">Attachments are not included in the HTML export.</p>`
    default:
      if (def?.fields?.length) return renderDynamic(content, def)
      return `<p style="${S.muted}">No content.</p>`
  }
}
