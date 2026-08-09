/**
 * useDictation — voice typing for text-heavy block editors, two backends:
 *
 * 1. LOCAL server (when `asrUrl` is configured in the openkairo.localAi
 *    localStorage config): records the mic with MediaRecorder and sends the
 *    clip to a local /v1/audio/transcriptions endpoint (e.g. MedASR via
 *    scripts/medasr-server.py). Audio never leaves the machine. Text arrives
 *    once, after tap-to-finish; `busy` is true while transcribing.
 * 2. Web Speech API fallback (default): browser support is feature-detected —
 *    where SpeechRecognition is missing (Firefox, some WebViews) `supported`
 *    is false and callers simply don't render their mic button. Only FINAL
 *    results are emitted, and recognition restarts survive the browser's
 *    silence timeouts while listening is on. NOTE: most Chrome setups process
 *    this audio on Google's servers — the local backend exists to avoid that.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { loadLocalAiConfig, transcribeAudio } from '../lib/aiExtract'

// TS lib.dom has no SpeechRecognition types — declare the minimal surface.
interface SpeechRecognitionLike {
  lang: string
  continuous: boolean
  interimResults: boolean
  start: () => void
  stop: () => void
  onresult: ((e: { resultIndex: number; results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }> }) => void) | null
  onend: (() => void) | null
  onerror: ((e: { error: string }) => void) | null
}

function getRecognitionCtor(): (new () => SpeechRecognitionLike) | null {
  const w = window as unknown as Record<string, unknown>
  return (w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null) as (new () => SpeechRecognitionLike) | null
}

function canRecord(): boolean {
  return typeof window !== 'undefined'
    && typeof MediaRecorder !== 'undefined'
    && !!navigator.mediaDevices?.getUserMedia
}

export function useDictation(onText: (text: string) => void) {
  // Backend is picked per mount; the config is a dev/localStorage knob.
  const [asrUrl] = useState<string | null>(() => loadLocalAiConfig().asrUrl)
  const [supported] = useState(() =>
    typeof window !== 'undefined' && (asrUrl ? canRecord() : getRecognitionCtor() !== null),
  )
  const [listening, setListening] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const recRef = useRef<SpeechRecognitionLike | null>(null)
  const recorderRef = useRef<MediaRecorder | null>(null)
  const onTextRef = useRef(onText)
  const wantListeningRef = useRef(false)
  useEffect(() => { onTextRef.current = onText }, [onText])

  // ── Local-server backend ──
  const startRecorder = useCallback(async () => {
    setError(null)
    let stream: MediaStream
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    } catch {
      setError('Microphone access was blocked — allow it in the browser to dictate.')
      return
    }
    const recorder = new MediaRecorder(stream)
    const chunks: Blob[] = []
    recorder.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data) }
    recorder.onstop = async () => {
      stream.getTracks().forEach(t => t.stop())
      setListening(false)
      const blob = new Blob(chunks, { type: recorder.mimeType || 'audio/webm' })
      if (blob.size === 0) return
      setBusy(true)
      try {
        const text = await transcribeAudio(blob)
        if (text) onTextRef.current(text)
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Transcription failed')
      } finally {
        setBusy(false)
      }
    }
    recorderRef.current = recorder
    recorder.start()
    setListening(true)
  }, [])

  const stopRecorder = useCallback(() => {
    const r = recorderRef.current
    if (r && r.state !== 'inactive') r.stop()
    else setListening(false)
  }, [])

  // ── Web Speech backend ──
  const stopSpeech = useCallback(() => {
    wantListeningRef.current = false
    recRef.current?.stop()
    setListening(false)
  }, [])

  const startSpeech = useCallback(() => {
    const Ctor = getRecognitionCtor()
    if (!Ctor) return
    setError(null)
    const rec = new Ctor()
    rec.lang = navigator.language || 'en-US'
    rec.continuous = true
    rec.interimResults = false
    rec.onresult = (e) => {
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i]
        if (r.isFinal) onTextRef.current(r[0].transcript)
      }
    }
    rec.onend = () => {
      // Browsers stop on silence; restart quietly while the user wants to dictate
      if (wantListeningRef.current) {
        try { rec.start() } catch { setListening(false) }
      } else {
        setListening(false)
      }
    }
    rec.onerror = (e) => {
      if (e.error === 'not-allowed' || e.error === 'service-not-allowed') {
        setError('Microphone access was blocked — allow it in the browser to dictate.')
        wantListeningRef.current = false
        setListening(false)
      }
      // 'no-speech' and 'aborted' are routine; onend handles restart
    }
    recRef.current = rec
    wantListeningRef.current = true
    rec.start()
    setListening(true)
  }, [])

  const stop = useCallback(() => {
    if (asrUrl) stopRecorder()
    else stopSpeech()
  }, [asrUrl, stopRecorder, stopSpeech])

  const start = useCallback(() => {
    if (asrUrl) void startRecorder()
    else startSpeech()
  }, [asrUrl, startRecorder, startSpeech])

  const toggle = useCallback(() => {
    if (listening || wantListeningRef.current) stop()
    else start()
  }, [listening, start, stop])

  // Stop cleanly when the editing component unmounts
  useEffect(() => stop, [stop])

  return { supported, listening, busy, error, toggle }
}

/** Append a dictated fragment to existing text with sane spacing. */
export function appendDictation(existing: string, fragment: string): string {
  const frag = fragment.trim()
  if (!frag) return existing
  if (!existing) return frag
  const needsSpace = !/\s$/.test(existing)
  return existing + (needsSpace ? ' ' : '') + frag
}
