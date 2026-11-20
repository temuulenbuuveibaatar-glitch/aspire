"""Эмээ товч speech engine: Whisper (listening) + OmniVoice (speaking).

Runs on a GPU machine (AWS). The Vercel app calls it with a shared secret.

  POST /stt   multipart "audio"           -> {"text", "language", "probs"}
  POST /tts   json {"text", "lang", "speed"?} -> audio/wav (24 kHz)
  GET  /health
"""

from __future__ import annotations

import io
import os
import tempfile
import threading
from pathlib import Path

import numpy as np
import soundfile as sf
import torch
from fastapi import Depends, FastAPI, File, Header, HTTPException, UploadFile
from fastapi.responses import Response
from faster_whisper import WhisperModel
from omnivoice import OmniVoice
from pydantic import BaseModel, Field

SUPPORTED = ("mn", "zh", "en", "ru", "de")
SAMPLE_RATE = 24_000

TOKEN = os.environ.get("SPEECH_TOKEN", "")
DEVICE = os.environ.get("DEVICE", "cuda" if torch.cuda.is_available() else "cpu")
STT_MODEL = os.environ.get("STT_MODEL", "large-v3-turbo" if DEVICE == "cuda" else "small")
TTS_MODEL = os.environ.get("TTS_MODEL", "k2-fsa/OmniVoice")
TTS_STEPS = int(os.environ.get("TTS_STEPS", "16"))  # 32 = best quality, 16 = faster
SPEED = float(os.environ.get("TTS_SPEED", "0.92"))  # a little slower for elders
DATA = Path(os.environ.get("DATA_DIR", "/data"))
PERSONA_AUDIO = DATA / "persona.wav"
PERSONA_TEXT = DATA / "persona.txt"
# Used once to *design* the persona voice when no recording of a real (consenting)
# person is provided. Voice design works best in English/Chinese, so we design in
# English and then clone that voice for every language -> same voice everywhere.
PERSONA_INSTRUCT = os.environ.get("PERSONA_INSTRUCT", "female, young adult, moderate pitch")
PERSONA_SEED_TEXT = "Hello! I am here to help you. Take your time, I am listening."

app = FastAPI(title="Emee speech engine")
gpu_lock = threading.Lock()

stt = WhisperModel(
    STT_MODEL,
    device=DEVICE,
    compute_type="float16" if DEVICE == "cuda" else "int8",
)
tts = OmniVoice.from_pretrained(
    TTS_MODEL,
    device_map="cuda:0" if DEVICE == "cuda" else "cpu",
    dtype=torch.float16 if DEVICE == "cuda" else torch.float32,
)


def _persona_prompt():
    """One consistent voice for all 5 languages (voice cloning prompt)."""
    DATA.mkdir(parents=True, exist_ok=True)
    if not PERSONA_AUDIO.exists():
        audio = tts.generate(text=PERSONA_SEED_TEXT, language="en", instruct=PERSONA_INSTRUCT, num_step=32)[0]
        sf.write(PERSONA_AUDIO, audio, SAMPLE_RATE)
        PERSONA_TEXT.write_text(PERSONA_SEED_TEXT, encoding="utf-8")
    ref_text = PERSONA_TEXT.read_text(encoding="utf-8") if PERSONA_TEXT.exists() else None
    return tts.create_voice_clone_prompt(ref_audio=str(PERSONA_AUDIO), ref_text=ref_text)


persona = _persona_prompt()


def require_token(authorization: str | None = Header(default=None)) -> None:
    if TOKEN and authorization != f"Bearer {TOKEN}":
        raise HTTPException(status_code=401, detail="unauthorized")


@app.get("/health")
def health():
    return {"ok": True, "device": DEVICE, "stt": STT_MODEL, "tts": TTS_MODEL}


@app.post("/stt", dependencies=[Depends(require_token)])
def speech_to_text(audio: UploadFile = File(...)):
    data = audio.file.read()
    if not data:
        raise HTTPException(status_code=400, detail="empty audio")
    if len(data) > 5_000_000:
        raise HTTPException(status_code=413, detail="audio too long")

    with tempfile.NamedTemporaryFile(suffix=Path(audio.filename or "a.webm").suffix) as f:
        f.write(data)
        f.flush()
        with gpu_lock:
            segments, info = stt.transcribe(f.name, language=None, beam_size=5, vad_filter=True)
            text = " ".join(s.text.strip() for s in segments).strip()
            all_probs = dict(info.all_language_probs or [])
            probs = {lang: float(all_probs.get(lang, 0.0)) for lang in SUPPORTED}
            language = info.language
            # Detected something we don't support (e.g. Kazakh for Mongolian speech):
            # transcribe again in the most likely supported language.
            if language not in SUPPORTED:
                language = max(probs, key=probs.get)
                segments, _ = stt.transcribe(f.name, language=language, beam_size=5, vad_filter=True)
                text = " ".join(s.text.strip() for s in segments).strip()

    return {"text": text, "language": language, "probs": probs}


class TtsRequest(BaseModel):
    text: str = Field(min_length=1, max_length=600)
    lang: str
    speed: float | None = Field(default=None, ge=0.6, le=1.4)


@app.post("/tts", dependencies=[Depends(require_token)])
def text_to_speech(req: TtsRequest):
    if req.lang not in SUPPORTED:
        raise HTTPException(status_code=400, detail=f"lang must be one of {SUPPORTED}")
    with gpu_lock:
        audio = tts.generate(
            text=req.text,
            language=req.lang,
            voice_clone_prompt=persona,
            speed=req.speed or SPEED,
            num_step=TTS_STEPS,
        )[0]
    buf = io.BytesIO()
    sf.write(buf, np.asarray(audio, dtype=np.float32), SAMPLE_RATE, format="WAV", subtype="PCM_16")
    return Response(content=buf.getvalue(), media_type="audio/wav", headers={"Cache-Control": "no-store"})
