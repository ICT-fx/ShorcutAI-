# Transcription microservice (faster-whisper)

Free, self-hosted, word-level transcription. The Next app calls this over HTTP
(`WHISPER_SERVICE_URL`, default `http://127.0.0.1:8001`). If it's unreachable,
the app falls back to Groq Whisper (only if `GROQ_API_KEY` is set).

## Run

```bash
cd services/transcription
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python app.py            # serves on :8001
```

First run downloads the model weights (cached afterwards under `~/.cache`).

## Configuration (env)

| Var                   | Default | Notes                                              |
| --------------------- | ------- | -------------------------------------------------- |
| `WHISPER_MODEL`       | `base`  | `tiny` / `base` / `small` / `medium` / `large-v3`  |
| `WHISPER_DEVICE`      | `cpu`   | `cuda` for GPU                                      |
| `WHISPER_COMPUTE_TYPE`| `int8`  | `float16` on GPU                                   |
| `PORT`                | `8001`  | Must match `WHISPER_SERVICE_URL` in the app's .env |

Bigger models = better accuracy, slower + more RAM. `base` is a good free default.

## ⚠️ Python version note

`faster-whisper` pulls in `ctranslate2` / `onnxruntime`, which may not yet
publish wheels for the very newest Python (e.g. 3.14). If `pip install` fails to
build, use Python **3.11 or 3.12** for this venv:

```bash
python3.12 -m venv .venv
```

This does NOT affect the Node app — only this isolated service. If you can't run
it at all, the app still works: it uses the script-based caption fallback, or
set `GROQ_API_KEY` to use the paid Groq Whisper provider instead.

## API

`POST /transcribe` (multipart, field `file`) →

```json
{
  "language": "en",
  "duration": 42.3,
  "segments": [{ "id": 0, "text": "...", "start": 0.0, "end": 3.2 }],
  "words":    [{ "word": "Hello", "start": 0.0, "end": 0.4 }]
}
```
