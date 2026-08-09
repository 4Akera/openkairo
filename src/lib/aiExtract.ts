/**
 * aiExtract — local-AI structured extraction for block forms (pilot: Vitals).
 *
 * PHI never leaves the machine: the model runs behind a LOCAL
 * OpenAI-compatible endpoint (Ollama by default — http://localhost:11434/v1).
 * The model is a config value, not a commitment: any server speaking
 * /chat/completions works (vLLM, LM Studio, llama.cpp, or MedGemma behind
 * Ollama). Override via localStorage key `openkairo.localAi`:
 *   {"baseUrl": "http://host:port/v1", "model": "name"}
 *
 * Extraction NEVER auto-saves — it fills the edit form and the clinician
 * reviews every field. Out-of-range values are dropped and reported, so a
 * garbled transcription can't put an impossible number in front of a tired
 * reviewer.
 */
import type { VitalsContent } from '../components/timeline/blocks/VitalsBlock'

// ─── Endpoint config ──────────────────────────────────────────────────────────

export interface LocalAiConfig {
  baseUrl: string
  model: string
}

export const DEFAULT_LOCAL_AI: LocalAiConfig = {
  baseUrl: 'http://localhost:11434/v1',
  model: 'gemma3:4b',
}

const CONFIG_KEY = 'openkairo.localAi'

export function loadLocalAiConfig(): LocalAiConfig {
  try {
    const raw = localStorage.getItem(CONFIG_KEY)
    if (!raw) return DEFAULT_LOCAL_AI
    const parsed = JSON.parse(raw) as Partial<LocalAiConfig>
    return {
      baseUrl: typeof parsed.baseUrl === 'string' && parsed.baseUrl ? parsed.baseUrl.replace(/\/$/, '') : DEFAULT_LOCAL_AI.baseUrl,
      model:   typeof parsed.model   === 'string' && parsed.model   ? parsed.model   : DEFAULT_LOCAL_AI.model,
    }
  } catch {
    return DEFAULT_LOCAL_AI
  }
}

// ─── Extraction result types ──────────────────────────────────────────────────

export interface ExtractedVitals {
  bp_systolic:  number | null
  bp_diastolic: number | null
  pulse_rate:   number | null
  resp_rate:    number | null
  temperature:  number | null
  temp_unit:    'C' | 'F' | null
  spo2:         number | null
  avpu:         'A' | 'V' | 'P' | 'U' | null
}

export interface VitalsExtraction {
  fields: ExtractedVitals
  /** Human-readable labels of what was filled, e.g. "BP 120/80" */
  filled: string[]
  /** Human-readable notes on values dropped by validation, e.g. "SpO₂ 350 (out of range)" */
  dropped: string[]
}

// ─── Prompt ───────────────────────────────────────────────────────────────────

export function vitalsMessages(text: string): { role: 'system' | 'user'; content: string }[] {
  return [
    {
      role: 'system',
      content:
        'You extract vital signs from clinical text. Reply with ONLY a JSON object, no prose, exactly these keys: ' +
        'bp_systolic, bp_diastolic, pulse_rate, resp_rate, temperature, temp_unit, spo2, avpu. ' +
        'Numbers as numbers. temp_unit is "C" or "F" (only when temperature is present; infer F when the value implies it, e.g. 98.6). ' +
        'avpu is "A", "V", "P" or "U" only when the level of consciousness is stated ("alert" → "A"). ' +
        'Use null for anything the text does not state — NEVER guess or fill in normal values. ' +
        'Example: "BP 130 over 85, pulse 72 irregular, sats 96 percent, afebrile at 36.8" → ' +
        '{"bp_systolic":130,"bp_diastolic":85,"pulse_rate":72,"resp_rate":null,"temperature":36.8,"temp_unit":"C","spo2":96,"avpu":null}',
    },
    { role: 'user', content: text },
  ]
}

// ─── Reply parsing + validation ───────────────────────────────────────────────

function asNum(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return v
  if (typeof v === 'string' && v.trim() !== '') {
    const n = Number(v)
    if (Number.isFinite(n)) return n
  }
  return null
}

function inRange(v: number, min: number, max: number): boolean {
  return v >= min && v <= max
}

/**
 * Parse a model reply into validated vitals. Tolerates code fences and
 * surrounding prose (first '{' to last '}'). Throws on unparseable replies.
 */
export function parseVitalsReply(raw: string): VitalsExtraction {
  const start = raw.indexOf('{')
  const end = raw.lastIndexOf('}')
  if (start === -1 || end === -1 || end <= start) {
    throw new Error('The model reply contained no JSON object')
  }
  let obj: Record<string, unknown>
  try {
    obj = JSON.parse(raw.slice(start, end + 1)) as Record<string, unknown>
  } catch {
    throw new Error('The model reply was not valid JSON')
  }

  const fields: ExtractedVitals = {
    bp_systolic: null, bp_diastolic: null, pulse_rate: null, resp_rate: null,
    temperature: null, temp_unit: null, spo2: null, avpu: null,
  }
  const filled: string[] = []
  const dropped: string[] = []

  const take = (key: keyof ExtractedVitals, min: number, max: number, label: string): number | null => {
    const v = asNum(obj[key])
    if (v === null) return null
    if (!inRange(v, min, max)) {
      dropped.push(`${label} ${v} (out of range)`)
      return null
    }
    return v
  }

  fields.bp_systolic  = take('bp_systolic',  40, 300, 'BP systolic')
  fields.bp_diastolic = take('bp_diastolic', 20, 200, 'BP diastolic')
  fields.pulse_rate   = take('pulse_rate',   20, 300, 'PR')
  fields.resp_rate    = take('resp_rate',     4,  80, 'RR')
  fields.spo2         = take('spo2',         50, 100, 'SpO₂')

  const unitRaw = typeof obj.temp_unit === 'string' ? obj.temp_unit.trim().toUpperCase() : null
  const unit: 'C' | 'F' = unitRaw === 'F' ? 'F' : 'C'
  const tempVal = asNum(obj.temperature)
  if (tempVal !== null) {
    const [min, max] = unit === 'F' ? [86, 113] : [30, 45]
    if (inRange(tempVal, min, max)) {
      fields.temperature = tempVal
      fields.temp_unit = unit
    } else {
      dropped.push(`Temp ${tempVal}°${unit} (out of range)`)
    }
  }

  const avpuRaw = typeof obj.avpu === 'string' ? obj.avpu.trim().toUpperCase() : null
  if (avpuRaw === 'A' || avpuRaw === 'V' || avpuRaw === 'P' || avpuRaw === 'U') {
    fields.avpu = avpuRaw
  }

  if (fields.bp_systolic !== null) {
    filled.push(`BP ${fields.bp_systolic}${fields.bp_diastolic !== null ? `/${fields.bp_diastolic}` : ''}`)
  }
  if (fields.pulse_rate  !== null) filled.push(`PR ${fields.pulse_rate}`)
  if (fields.resp_rate   !== null) filled.push(`RR ${fields.resp_rate}`)
  if (fields.temperature !== null) filled.push(`Temp ${fields.temperature}°${fields.temp_unit}`)
  if (fields.spo2        !== null) filled.push(`SpO₂ ${fields.spo2}%`)
  if (fields.avpu        !== null) filled.push(`AVPU ${fields.avpu}`)

  return { fields, filled, dropped }
}

/**
 * Merge extracted vitals into a form: non-null extracted values overwrite and
 * clear the field's 'unmeasured' flag; everything else is left untouched.
 */
export function mergeExtractedVitals(form: VitalsContent, x: ExtractedVitals): VitalsContent {
  const next = { ...form }
  const clearUnmeasured = (flags: string[]) => flags.filter(f => f !== 'unmeasured')

  if (x.bp_systolic !== null || x.bp_diastolic !== null) {
    if (x.bp_systolic  !== null) next.bp_systolic  = x.bp_systolic
    if (x.bp_diastolic !== null) next.bp_diastolic = x.bp_diastolic
    next.bp_flags = clearUnmeasured(next.bp_flags)
  }
  if (x.pulse_rate !== null) {
    next.pulse_rate = x.pulse_rate
    next.pr_flags = clearUnmeasured(next.pr_flags)
  }
  if (x.resp_rate !== null) {
    next.resp_rate = x.resp_rate
    next.rr_flags = clearUnmeasured(next.rr_flags)
  }
  if (x.temperature !== null) {
    next.temperature = x.temperature
    if (x.temp_unit !== null) next.temp_unit = x.temp_unit
    next.temp_flags = clearUnmeasured(next.temp_flags)
  }
  if (x.spo2 !== null) {
    next.spo2 = x.spo2
    next.spo2_flags = clearUnmeasured(next.spo2_flags)
  }
  if (x.avpu !== null) next.avpu = x.avpu

  return next
}

// ─── Endpoint call ────────────────────────────────────────────────────────────

export async function extractVitals(text: string, cfg?: LocalAiConfig): Promise<VitalsExtraction> {
  const { baseUrl, model } = cfg ?? loadLocalAiConfig()
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 30_000)

  let res: Response
  try {
    res = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({
        model,
        messages: vitalsMessages(text),
        temperature: 0,
        response_format: { type: 'json_object' },
      }),
    })
  } catch (e) {
    clearTimeout(timer)
    if (e instanceof DOMException && e.name === 'AbortError') {
      throw new Error('Local AI timed out after 30s — the model may still be loading')
    }
    throw new Error(`Local AI not reachable at ${baseUrl} — is Ollama running? (ollama serve)`)
  }
  clearTimeout(timer)

  if (!res.ok) {
    let detail = ''
    try {
      const body = (await res.json()) as { error?: { message?: string } | string }
      detail = typeof body.error === 'string' ? body.error : body.error?.message ?? ''
    } catch { /* non-JSON error body */ }
    if (res.status === 404 && !detail) detail = `model "${model}" may be missing — ollama pull ${model}`
    throw new Error(`Local AI error (${res.status})${detail ? `: ${detail}` : ''}`)
  }

  const data = (await res.json()) as { choices?: { message?: { content?: string } }[] }
  const content = data.choices?.[0]?.message?.content
  if (!content) throw new Error('Local AI returned an empty reply')
  return parseVitalsReply(content)
}
