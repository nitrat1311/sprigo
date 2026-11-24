#!/bin/sh
# Downloads the bundled speech models once (src-tauri/resources/README.md). Idempotent.
set -e
fetch() { # file, url, what
  f="src-tauri/resources/$1"
  [ -s "$f" ] && return 0
  echo "Fetching $3…"
  curl -fL --retry 3 -o "$f.part" "$2"
  mv "$f.part" "$f"
}
fetch ggml-base-q5_1.bin "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base-q5_1.bin" "Whisper model (~57 MB)"
fetch ggml-silero-v5.1.2.bin "https://huggingface.co/ggml-org/whisper-vad/resolve/main/ggml-silero-v5.1.2.bin" "speech detector (~0.9 MB)"
