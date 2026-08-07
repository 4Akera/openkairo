/**
 * useDictation — voice typing via the Web Speech API.
 *
 * Browser support is feature-detected: where SpeechRecognition is missing
 * (Firefox, some WebViews) `supported` is false and callers simply don't
 * render their mic button. Only FINAL results are emitted — no interim
 * flicker — and recognition restarts survive the browser's silence timeouts
 * while listening is on.
 */
import { useCallback, useEffect, useRef, useState } from 'react'

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

export function useDictation(onText: (text: string) => void) {
  const [supported] = useState(() => typeof window !== 'undefined' && getRecognitionCtor() !== null)
  const [listening, setListening] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const recRef = useRef<SpeechRecognitionLike | null>(null)
  const onTextRef = useRef(onText)
  const wantListeningRef = useRef(false)
  useEffect(() => { onTextRef.current = onText }, [onText])

  const stop = useCallback(() => {
    wantListeningRef.current = false
    recRef.current?.stop()
    setListening(false)
  }, [])

  const start = useCallback(() => {
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

  const toggle = useCallback(() => {
    if (wantListeningRef.current) stop()
    else start()
  }, [start, stop])

  // Stop cleanly when the editing component unmounts
  useEffect(() => stop, [stop])

  return { supported, listening, error, toggle }
}

/** Append a dictated fragment to existing text with sane spacing. */
export function appendDictation(existing: string, fragment: string): string {
  const frag = fragment.trim()
  if (!frag) return existing
  if (!existing) return frag
  const needsSpace = !/\s$/.test(existing)
  return existing + (needsSpace ? ' ' : '') + frag
}
