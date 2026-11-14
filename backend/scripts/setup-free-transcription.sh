#!/usr/bin/env bash
# One-time setup for free, local speech-to-text (no API key). Needs python3 + ffmpeg.
set -euo pipefail
cd "$(dirname "$0")/.."
command -v ffmpeg >/dev/null || { echo "Install ffmpeg first (e.g. sudo dnf install ffmpeg / sudo apt install ffmpeg)"; exit 1; }
python3 -m venv .venv-whisper
.venv-whisper/bin/pip install -q faster-whisper
echo "Downloading the '${LOCAL_WHISPER_MODEL:-base}' model (one time)..."
.venv-whisper/bin/python -c "from faster_whisper import WhisperModel; WhisperModel('${LOCAL_WHISPER_MODEL:-base}', device='cpu', compute_type='int8')"
echo "Done. Recordings are now transcribed locally for free."
echo "Optional polish: install Ollama (https://ollama.com) and run 'ollama pull qwen2.5:3b'."
