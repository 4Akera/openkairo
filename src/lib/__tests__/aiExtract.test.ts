import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import {
  parseVitalsReply, mergeExtractedVitals, extractTranscriptText,
  loadLocalAiConfig, DEFAULT_LOCAL_AI, type ExtractedVitals,
} from '../aiExtract'
import { emptyVitals } from '../../components/timeline/blocks/VitalsBlock'

const noneExtracted = (): ExtractedVitals => ({
  bp_systolic: null, bp_diastolic: null, pulse_rate: null, resp_rate: null,
  temperature: null, temp_unit: null, spo2: null, avpu: null,
})

describe('parseVitalsReply', () => {
  it('parses a full clean reply', () => {
    const r = parseVitalsReply(JSON.stringify({
      bp_systolic: 120, bp_diastolic: 80, pulse_rate: 72, resp_rate: 16,
      temperature: 37.2, temp_unit: 'C', spo2: 98, avpu: 'A',
    }))
    expect(r.fields).toEqual({
      bp_systolic: 120, bp_diastolic: 80, pulse_rate: 72, resp_rate: 16,
      temperature: 37.2, temp_unit: 'C', spo2: 98, avpu: 'A',
    })
    expect(r.filled).toEqual(['BP 120/80', 'PR 72', 'RR 16', 'Temp 37.2°C', 'SpO₂ 98%', 'AVPU A'])
    expect(r.dropped).toEqual([])
  })

  it('tolerates code fences and prose around the JSON', () => {
    const r = parseVitalsReply('Here you go:\n```json\n{"pulse_rate": 88}\n```')
    expect(r.fields.pulse_rate).toBe(88)
    expect(r.filled).toEqual(['PR 88'])
  })

  it('coerces string numbers', () => {
    const r = parseVitalsReply('{"spo2": "97", "pulse_rate": "72"}')
    expect(r.fields.spo2).toBe(97)
    expect(r.fields.pulse_rate).toBe(72)
  })

  it('drops out-of-range values and reports them', () => {
    const r = parseVitalsReply('{"spo2": 350, "pulse_rate": 72}')
    expect(r.fields.spo2).toBeNull()
    expect(r.fields.pulse_rate).toBe(72)
    expect(r.dropped).toEqual(['SpO₂ 350 (out of range)'])
  })

  it('validates temperature against its unit', () => {
    // 98.6 as Celsius is impossible → dropped
    const c = parseVitalsReply('{"temperature": 98.6, "temp_unit": "C"}')
    expect(c.fields.temperature).toBeNull()
    expect(c.dropped).toEqual(['Temp 98.6°C (out of range)'])
    // 98.6 as Fahrenheit is normal → kept
    const f = parseVitalsReply('{"temperature": 98.6, "temp_unit": "F"}')
    expect(f.fields.temperature).toBe(98.6)
    expect(f.fields.temp_unit).toBe('F')
  })

  it('defaults a missing unit to Celsius', () => {
    const r = parseVitalsReply('{"temperature": 36.8}')
    expect(r.fields.temp_unit).toBe('C')
  })

  it('rejects unknown AVPU values, keeps case-insensitive valid ones', () => {
    expect(parseVitalsReply('{"avpu": "alert"}').fields.avpu).toBeNull()
    expect(parseVitalsReply('{"avpu": "a"}').fields.avpu).toBe('A')
  })

  it('ignores unknown keys and null everything → empty result', () => {
    const r = parseVitalsReply('{"weight": 80, "bp_systolic": null}')
    expect(r.fields).toEqual(noneExtracted())
    expect(r.filled).toEqual([])
  })

  it('throws on replies with no JSON object', () => {
    expect(() => parseVitalsReply('I could not find any vitals.')).toThrow(/no JSON/)
    expect(() => parseVitalsReply('{broken')).toThrow()
  })
})

describe('mergeExtractedVitals', () => {
  it('overwrites extracted fields and clears their unmeasured flags', () => {
    const merged = mergeExtractedVitals(emptyVitals(), {
      ...noneExtracted(), bp_systolic: 120, bp_diastolic: 80, spo2: 97,
    })
    expect(merged.bp_systolic).toBe(120)
    expect(merged.bp_diastolic).toBe(80)
    expect(merged.bp_flags).toEqual([])
    expect(merged.spo2).toBe(97)
    expect(merged.spo2_flags).toEqual([])
    // Untouched vitals keep their unmeasured state
    expect(merged.pulse_rate).toBeNull()
    expect(merged.pr_flags).toEqual(['unmeasured'])
  })

  it('keeps manually entered values not present in the extraction', () => {
    const form = { ...emptyVitals(), pulse_rate: 65, pr_flags: ['irregular'] }
    const merged = mergeExtractedVitals(form, { ...noneExtracted(), resp_rate: 18 })
    expect(merged.pulse_rate).toBe(65)
    expect(merged.pr_flags).toEqual(['irregular'])
    expect(merged.resp_rate).toBe(18)
    expect(merged.rr_flags).toEqual([])
  })

  it('applies temp_unit only alongside a temperature', () => {
    const merged = mergeExtractedVitals(emptyVitals(), {
      ...noneExtracted(), temperature: 99.1, temp_unit: 'F',
    })
    expect(merged.temperature).toBe(99.1)
    expect(merged.temp_unit).toBe('F')
    const untouched = mergeExtractedVitals(emptyVitals(), noneExtracted())
    expect(untouched.temp_unit).toBe('C')
    expect(untouched).toEqual(emptyVitals())
  })

  it('sets AVPU when extracted', () => {
    const merged = mergeExtractedVitals(emptyVitals(), { ...noneExtracted(), avpu: 'V' })
    expect(merged.avpu).toBe('V')
  })
})

describe('extractTranscriptText', () => {
  it('returns the trimmed text field', () => {
    expect(extractTranscriptText({ text: '  BP 120 over 80 ' })).toBe('BP 120 over 80')
  })

  it('throws when text is missing or not a string', () => {
    expect(() => extractTranscriptText({})).toThrow(/no text/)
    expect(() => extractTranscriptText({ text: 42 })).toThrow(/no text/)
    expect(() => extractTranscriptText(null)).toThrow(/no text/)
  })
})

describe('loadLocalAiConfig', () => {
  // Tests run under node — shim the minimal localStorage surface the lib touches.
  const store = new Map<string, string>()
  const globals = globalThis as { localStorage?: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> }

  beforeAll(() => {
    globals.localStorage = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => { store.set(k, v) },
      removeItem: (k: string) => { store.delete(k) },
    }
  })
  afterAll(() => { delete globals.localStorage })

  it('defaults asrUrl to null and reads an override', () => {
    store.clear()
    expect(loadLocalAiConfig()).toEqual(DEFAULT_LOCAL_AI)
    expect(DEFAULT_LOCAL_AI.asrUrl).toBeNull()

    store.set('openkairo.localAi', JSON.stringify({
      asrUrl: 'http://localhost:8035/v1/audio/transcriptions',
    }))
    const cfg = loadLocalAiConfig()
    expect(cfg.asrUrl).toBe('http://localhost:8035/v1/audio/transcriptions')
    expect(cfg.baseUrl).toBe(DEFAULT_LOCAL_AI.baseUrl)
  })

  it('survives malformed JSON', () => {
    store.set('openkairo.localAi', '{not json')
    expect(loadLocalAiConfig()).toEqual(DEFAULT_LOCAL_AI)
    store.clear()
  })
})
