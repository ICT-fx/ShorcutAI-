"""
Self-hosted faster-whisper transcription microservice (the FREE default path).

Exposes:
  GET  /health        -> {"status": "ok", "model": "<size>"}
  POST /transcribe    -> multipart file upload; returns segment- and word-level
                         timestamps that the app maps onto the edit timeline.

The model is loaded once on startup and reused. CPU int8 by default so it runs
on any machine; set WHISPER_DEVICE=cuda + WHISPER_COMPUTE_TYPE=float16 for GPU.
"""
import os
import tempfile

from fastapi import FastAPI, File, HTTPException, UploadFile
from faster_whisper import WhisperModel

MODEL_SIZE = os.environ.get("WHISPER_MODEL", "base")
DEVICE = os.environ.get("WHISPER_DEVICE", "cpu")
COMPUTE_TYPE = os.environ.get("WHISPER_COMPUTE_TYPE", "int8")

app = FastAPI(title="auto-video-editor transcription", version="1.0")

# Loaded lazily on first use so the process starts fast and /health is cheap.
_model: WhisperModel | None = None


def get_model() -> WhisperModel:
    global _model
    if _model is None:
        _model = WhisperModel(MODEL_SIZE, device=DEVICE, compute_type=COMPUTE_TYPE)
    return _model


@app.get("/health")
def health():
    return {"status": "ok", "model": MODEL_SIZE, "device": DEVICE}


@app.post("/transcribe")
async def transcribe(file: UploadFile = File(...)):
    suffix = os.path.splitext(file.filename or "")[1] or ".bin"
    try:
        data = await file.read()
    except Exception as exc:  # pragma: no cover
        raise HTTPException(status_code=400, detail=f"could not read upload: {exc}")

    with tempfile.NamedTemporaryFile(suffix=suffix, delete=True) as tmp:
        tmp.write(data)
        tmp.flush()

        model = get_model()
        # word_timestamps=True yields the word-level timings the editor needs.
        segments_iter, info = model.transcribe(
            tmp.name,
            word_timestamps=True,
            vad_filter=True,  # skip long silences -> better timing, lower cost
        )

        segments = []
        words = []
        for i, seg in enumerate(segments_iter):
            segments.append(
                {"id": i, "text": seg.text, "start": seg.start, "end": seg.end}
            )
            for w in seg.words or []:
                words.append({"word": w.word, "start": w.start, "end": w.end})

    return {
        "language": info.language,
        "duration": info.duration,
        "segments": segments,
        "words": words,
    }


if __name__ == "__main__":
    import uvicorn

    port = int(os.environ.get("PORT", "8001"))
    uvicorn.run(app, host="0.0.0.0", port=port)
