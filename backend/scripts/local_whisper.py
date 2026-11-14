#!/usr/bin/env python3
"""Free local speech-to-text (faster-whisper, CPU int8). Prints one JSON object to stdout.

Usage: local_whisper.py AUDIO [--model base] [--language en] [--prompt "names, jargon"]
The prompt is Whisper's initial_prompt: it biases decoding toward the meeting's vocabulary.
"""
import argparse
import json
import subprocess
import sys


def decode(path):
    """Decode any audio/video (browser .webm included) to 16 kHz mono float32 via system ffmpeg."""
    import numpy as np

    raw = subprocess.run(
        ["ffmpeg", "-nostdin", "-v", "error", "-i", path, "-f", "s16le", "-ac", "1", "-ar", "16000", "-"],
        capture_output=True, check=True,
    ).stdout
    return np.frombuffer(raw, np.int16).astype(np.float32) / 32768.0


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("audio")
    ap.add_argument("--model", default="base")
    ap.add_argument("--language", default=None)
    ap.add_argument("--prompt", default=None)
    ap.add_argument("--threads", type=int, default=0)
    a = ap.parse_args()

    from faster_whisper import WhisperModel

    model = WhisperModel(a.model, device="cpu", compute_type="int8", cpu_threads=a.threads)
    language = None if a.language in (None, "", "auto") else a.language.split("-")[0]
    segments, info = model.transcribe(
        decode(a.audio),
        language=language,
        initial_prompt=a.prompt or None,
        beam_size=5,
        vad_filter=True,                       # skip silence: fewer hallucinated lines
        vad_parameters={"min_silence_duration_ms": 500},
        condition_on_previous_text=False,      # avoids repetition loops on long audio
        temperature=[0.0, 0.2, 0.4],
    )
    out = []
    for i, s in enumerate(segments, 1):
        text = s.text.strip()
        if text:
            out.append({"id": i, "start": round(s.start, 2), "end": round(s.end, 2), "text": text})
    json.dump({"language": info.language, "text": " ".join(x["text"] for x in out), "segments": out}, sys.stdout)


if __name__ == "__main__":
    try:
        main()
    except Exception as e:  # surface a clean error to Node
        print(json.dumps({"error": str(e)}), file=sys.stdout)
        sys.exit(1)
