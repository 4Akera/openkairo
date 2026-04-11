// Shared imaging study catalog for radiology_request / radiology_result blocks

export interface RadiologyStudyDef {
  id:        string
  label:     string
  modality:  string
}

export const RADIOLOGY_STUDIES: RadiologyStudyDef[] = [
  { id: 'cxr_pa',        label: 'Chest X-ray (PA)',           modality: 'XR' },
  { id: 'cxr_portable',  label: 'Chest X-ray (portable)',     modality: 'XR' },
  { id: 'ct_head_wo',    label: 'CT head (non-contrast)',     modality: 'CT' },
  { id: 'ct_chest',      label: 'CT chest',                   modality: 'CT' },
  { id: 'ct_pe',         label: 'CT pulmonary angiogram',     modality: 'CT' },
  { id: 'ct_abd_pelvis', label: 'CT abdomen & pelvis',        modality: 'CT' },
  { id: 'us_abdomen',    label: 'Ultrasound abdomen',         modality: 'US' },
  { id: 'us_dvt_le',     label: 'US DVT lower limb',          modality: 'US' },
  { id: 'mri_brain',     label: 'MRI brain',                  modality: 'MRI' },
  { id: 'mri_spine_ls',  label: 'MRI lumbar spine',           modality: 'MRI' },
  { id: 'mammo_bilateral', label: 'Mammography (bilateral)', modality: 'MG' },
  { id: 'bone_scan',     label: 'Bone scan',                  modality: 'NM' },
  { id: 'pet_ct',        label: 'PET-CT',                     modality: 'PET' },
]

export const RADIOLOGY_STUDY_MAP: Record<string, RadiologyStudyDef> = Object.fromEntries(
  RADIOLOGY_STUDIES.map(s => [s.id, s]),
)

/** Sentinel for “other modality” in the request UI (not stored on studies). */
export const RADIOLOGY_OTHER_MODALITY_KEY = '__other__' as const

/** Modality keys in UI order; labels are clinician-facing. */
export const RADIOLOGY_MODALITY_OPTS: { key: string; label: string }[] = [
  { key: 'XR',  label: 'X-ray' },
  { key: 'CT',  label: 'CT' },
  { key: 'US',  label: 'Ultrasound (U/S)' },
  { key: 'MRI', label: 'MRI' },
  { key: 'MG',  label: 'Mammography' },
  { key: 'NM',  label: 'Nuclear medicine' },
  { key: 'PET', label: 'PET-CT' },
]

export function radiologyStudiesForModality(modalityKey: string): RadiologyStudyDef[] {
  return RADIOLOGY_STUDIES.filter(s => s.modality === modalityKey)
}

const RADIOLOGY_MODALITY_LABEL_BY_KEY: Record<string, string> = Object.fromEntries(
  RADIOLOGY_MODALITY_OPTS.map(m => [m.key, m.label]),
)

/** Pretty label for request/result chips (maps XR → X-ray; unknown keys stay as-is). */
export function formatRadiologyCustomLabel(row: { name: string; modality?: string }): string {
  const n = row.name.trim()
  if (!n) return ''
  const m = row.modality?.trim()
  if (!m) return n
  const friendly = RADIOLOGY_MODALITY_LABEL_BY_KEY[m] ?? m
  return `${friendly} · ${n}`
}
