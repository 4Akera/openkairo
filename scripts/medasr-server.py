#!/usr/bin/env python3
"""
medasr-server — local medical speech-to-text for OpenKairo dictation.

Serves google/medasr (Google Health AI's open medical ASR, English) behind a
tiny OpenAI-compatible endpoint the app's dictation hook can call:

    POST /v1/audio/transcriptions   (multipart: file=<audio>)  ->  {"text": "..."}

Audio never leaves this machine.

One-time setup:
  1. ffmpeg on PATH (brew install ffmpeg) — converts browser webm to 16k wav.
  2. A Hugging Face account that has ACCEPTED the Health AI Developer
     Foundations terms on https://huggingface.co/google/medasr, and a login:
         pip install -U "huggingface_hub[cli]" && hf auth login
  3. Python deps (MedASR needs transformers >= 5):
         python3 -m venv .venv && source .venv/bin/activate
         pip install "transformers>=5.0.0" torch librosa soundfile

Run:
    python3 scripts/medasr-server.py          # listens on http://localhost:8035

Point the app at it (browser devtools console, once):
    localStorage.setItem('openkairo.localAi', JSON.stringify({
      asrUrl: 'http://localhost:8035/v1/audio/transcriptions',
    }))

The first request downloads the model (~few hundred MB) into the HF cache;
after that it loads from disk. 105M params — CPU realtime is fine.
"""
import json
import subprocess
import sys
import tempfile
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

PORT = 8035
MODEL_ID = "google/medasr"

print(f"Loading {MODEL_ID} (first run downloads it to the HF cache)…", flush=True)
try:
    from transformers import pipeline
    PIPE = pipeline("automatic-speech-recognition", model=MODEL_ID)
except Exception as exc:  # noqa: BLE001 — surface the real cause and stop
    sys.exit(
        f"Could not load {MODEL_ID}: {exc}\n"
        "Checklist: transformers>=5 installed? HF terms accepted on the model "
        "page? `hf auth login` done?"
    )
print(f"Model ready — listening on http://localhost:{PORT}", flush=True)


def _extract_file_part(body: bytes, content_type: str) -> bytes:
    """Pull the first file part out of a multipart/form-data body."""
    boundary = None
    for token in content_type.split(";"):
        token = token.strip()
        if token.startswith("boundary="):
            boundary = token[len("boundary="):].strip('"')
    if not boundary:
        raise ValueError("multipart body without a boundary")
    delimiter = b"--" + boundary.encode()
    for part in body.split(delimiter):
        if b"\r\n\r\n" not in part:
            continue
        headers, payload = part.split(b"\r\n\r\n", 1)
        if b'name="file"' in headers:
            return payload.rstrip(b"\r\n-")
    raise ValueError("no file field in form data")


def _to_wav_16k(audio: bytes) -> Path:
    """Browser sends webm/opus; MedASR wants 16 kHz mono wav — ffmpeg bridges."""
    src = tempfile.NamedTemporaryFile(suffix=".webm", delete=False)
    src.write(audio)
    src.close()
    dst = Path(src.name).with_suffix(".wav")
    proc = subprocess.run(
        ["ffmpeg", "-y", "-i", src.name, "-ar", "16000", "-ac", "1", str(dst)],
        capture_output=True,
    )
    Path(src.name).unlink(missing_ok=True)
    if proc.returncode != 0:
        raise ValueError(f"ffmpeg failed: {proc.stderr[-300:].decode(errors='replace')}")
    return dst


class Handler(BaseHTTPRequestHandler):
    def _send(self, status: int, payload: dict) -> None:
        raw = json.dumps(payload).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.send_header("Access-Control-Allow-Methods", "POST, OPTIONS")
        self.send_header("Content-Length", str(len(raw)))
        self.end_headers()
        self.wfile.write(raw)

    def do_OPTIONS(self) -> None:  # CORS preflight
        self._send(204, {})

    def do_POST(self) -> None:
        if self.path != "/v1/audio/transcriptions":
            self._send(404, {"error": "unknown path"})
            return
        try:
            body = self.rfile.read(int(self.headers.get("Content-Length", "0")))
            audio = _extract_file_part(body, self.headers.get("Content-Type", ""))
            wav = _to_wav_16k(audio)
            try:
                result = PIPE(str(wav), chunk_length_s=20, stride_length_s=2)
            finally:
                wav.unlink(missing_ok=True)
            text = (result.get("text") or "").strip() if isinstance(result, dict) else ""
            self._send(200, {"text": text})
        except Exception as exc:  # noqa: BLE001 — report, keep serving
            self._send(500, {"error": str(exc)})

    def log_message(self, fmt: str, *args) -> None:
        print(f"{self.address_string()} — {fmt % args}", flush=True)


if __name__ == "__main__":
    ThreadingHTTPServer(("127.0.0.1", PORT), Handler).serve_forever()
