Bundled into the app (tauri.conf.json `bundle.resources`).

`ggml-base-q5_1.bin` — Whisper speech model (~57 MB, multilingual) used for speaking exercises and voice calls.
Not in git; fetch it with `pnpm fetch-model` (also run automatically before `tauri build`).
Without it the app works, speaking exercises are just hidden.

`ggml-silero-v5.1.2.bin`: Silero speech detector (~0.9 MB, whisper.cpp's ggml port). It finds where the learner
spoke in a take, so the taps on the mic button and the silence around them are cut before transcription,
and a take with no speech in it is not transcribed at all.
Fetched by the same script. Without it each take is used whole.
