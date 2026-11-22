// Speech-to-text (DECISIONS D2): microphone in the webview, bundled whisper.cpp in Rust (src-tauri/src/lib.rs).
import { mark } from "./latency";
import { Channel, invoke } from "@tauri-apps/api/core";
import { fetch as tauriFetch } from "@tauri-apps/plugin-http";
import { isTauri, isCompanion, getSetting } from "./db";
import { VAD, VAD_IDLE, concat, cutTo, resample, rms, vadStep, type VadEvent } from "./audio";
import { wav16 } from "./wav";
import { speechMetrics, type Utterance } from "./speech";

export type SttProvider = "whisper" | "deepgram";
export const sttProvider = async (): Promise<SttProvider> => ((await getSetting("stt")) === "deepgram" ? "deepgram" : "whisper");

// ponytail: the dev browser preview has no keychain, so it keeps the key in localStorage. Never used in the app.
const DEV_KEY = "sprigo.devkey.deepgram";
export const getDeepgramKey = () => (isTauri ? invoke<string | null>("secret_get", { key: "stt-key.deepgram" }) : Promise.resolve(localStorage.getItem(DEV_KEY)));
export async function setDeepgramKey(value: string | null) {
  if (isTauri) return invoke("secret_set", { key: "stt-key.deepgram", value });
  value ? localStorage.setItem(DEV_KEY, value) : localStorage.removeItem(DEV_KEY);
}

const http = (isTauri ? tauriFetch : window.fetch.bind(window)) as typeof fetch;
/** Deepgram nova-3 transcript of a 16 kHz WAV; throws with the server's message on HTTP errors. */
export async function deepgramTranscribe(wav: Uint8Array, lang: string, key?: string | null): Promise<string> {
  key ??= await getDeepgramKey();
  if (!key) throw new Error("No Deepgram key");
  const r = await http(`https://api.deepgram.com/v1/listen?model=nova-3&smart_format=true&language=${encodeURIComponent(lang.slice(0, 2))}`, {
    method: "POST", headers: { Authorization: `Token ${key}`, "Content-Type": "audio/wav" }, body: wav as BodyInit,
  });
  if (!r.ok) throw new Error(`${r.status} ${(await r.text()).slice(0, 200)}`);
  return (await r.json()).results?.channels?.[0]?.alternatives?.[0]?.transcript ?? "";
}

/** Whisper model sizes (src-tauri/src/lib.rs `stt_file`): "base" ships with the app, the others are downloaded on demand. */
export type WhisperModel = "base" | "small" | "turbo";
/** [model in use, downloaded models] */
export const whisperModels = () => invoke<[WhisperModel, WhisperModel[]]>("stt_models");
export const pickWhisper = (name: WhisperModel) => invoke("stt_use", { name });
export const removeWhisper = (name: WhisperModel) => invoke("stt_remove", { name });
export function downloadWhisper(name: WhisperModel, onProgress: (p: number) => void) {
  const progress = new Channel<number>();
  progress.onmessage = onProgress;
  return invoke("stt_download", { name, progress });
}

let ready: Promise<boolean> | undefined;
/** Speaking available? Deepgram: key present. Whisper: model present in this build (always false in the browser preview). */
export const sttReady = () => (ready ??= (async () => {
  if ((await sttProvider()) === "deepgram") return !!(await getDeepgramKey().catch(() => null));
  return isTauri ? invoke<boolean>("stt_ready").catch(() => false) : isCompanion;
})());
/** Call after the provider or the key changes. */
export const resetSttReady = () => { ready = undefined; };

export const MAX_RECORD_S = 15;

/** An open microphone. A screen with a mic button opens it once, when it appears, and closes it when it goes away: a
 *  freshly opened mic is not usable straight away (measured in the macOS webview: ~0.7 s of digital silence, and up to
 *  ~4 s at -30 dB without voice processing), so opening it on each tap cut off the start of what the learner said. */
export type Mic = { rate: number; alive(): boolean; start(): void; take(): Float32Array; close(): Promise<void> };
/** Resolves once the mic delivers anything but digital silence (at most ~1.5 s), so a take started after it has no
 *  dead opening. */
export async function openMic(): Promise<Mic> {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: { ideal: 1 }, echoCancellation: true, noiseSuppression: true } });
  let ctx: AudioContext;
  try { ctx = new AudioContext(); }
  catch (e) { stream.getTracks().forEach((t) => t.stop()); throw e; } // don't leave the mic on
  // Created after an await (and when the screen opens, not in a tap), so it may start suspended; iOS Safari only
  // resumes it from a tap, which ends in pointerup / touchend.
  const wake = () => void ctx.resume().catch(() => {});
  const taps = ["pointerup", "touchend"] as const;
  wake();
  taps.forEach((k) => document.addEventListener(k, wake));
  const src = ctx.createMediaStreamSource(stream);
  // ponytail: ScriptProcessor is deprecated but works everywhere without a worklet file
  const proc = ctx.createScriptProcessor(4096, 1, 1);
  // `last`: the newest buffer from before the tap (~85 ms at 48 kHz). The learner often starts speaking as they tap,
  // so a take starts with it, the way listen() keeps its `pre` buffers; the detector trims what isn't speech.
  let chunks: Float32Array[] | null = null, last: Float32Array | undefined, live!: () => void;
  const sounding = new Promise<void>((r) => (live = r));
  proc.onaudioprocess = (e) => {
    const d = new Float32Array(e.inputBuffer.getChannelData(0));
    if (d.some((x) => x !== 0)) live();
    if (chunks) chunks.push(d);
    else last = d;
  };
  src.connect(proc);
  proc.connect(ctx.destination);
  let timer: ReturnType<typeof setTimeout> | undefined;
  await Promise.race([sounding, new Promise((r) => (timer = setTimeout(r, 1500)))]);
  clearTimeout(timer);
  let closed = false;
  return {
    rate: ctx.sampleRate,
    /** False once the device is gone (unplugged, switched, the OS took it): the caller opens a new one. */
    alive: () => !closed && ctx.state !== "closed" && stream.getAudioTracks().some((t) => t.readyState === "live"),
    start() { wake(); chunks = last ? [last] : []; },
    take() { const all = concat(chunks ?? []); chunks = null; return all; },
    async close() {
      if (closed) return;
      closed = true;
      taps.forEach((k) => document.removeEventListener(k, wake));
      proc.disconnect(); src.disconnect();
      stream.getTracks().forEach((t) => t.stop());
      await ctx.close();
    },
  };
}

const SILENT = 1e-4; // -80 dBFS: below any real mic, even in a quiet room (measured: -44 dBFS peak for a silent take)

/** Where the learner spoke in 16 kHz `x` (seconds), by the speech detector in Rust (Silero, through whisper.cpp): null
 *  when it heard no speech, undefined when there is no detector (browser preview, phone companion, model missing). */
async function speechSpan(x: Float32Array): Promise<[number, number] | null | undefined> {
  if (!isTauri || isCompanion) return undefined;
  return invoke<[number, number] | null>("speech_span", { samples: Array.from(x) }).catch(() => undefined);
}

/** Starts a take on an open `mic`; `stop()` returns the transcript (`stop(false)` just drops the take). Auto-stops after
 *  MAX_RECORD_S (onAutoStop fires). With `native` the transcript also gets its speech signals; there is no tutor turn
 *  to time, so `latencyMs` is null. */
export function startRecording(mic: Mic, lang: string, onAutoStop?: () => void, native?: string) {
  mic.start();
  const timer = setTimeout(() => onAutoStop?.(), MAX_RECORD_S * 1000);
  let stopped = false;
  return {
    async stop(transcribe = true): Promise<{ text: string; m?: Utterance }> {
      if (stopped) return { text: "" };
      stopped = true;
      clearTimeout(timer);
      const raw = mic.take();
      if (!transcribe) return { text: "" };
      // Only the speech, plus a margin: drops the taps on the button and the silence around them. No speech at all
      // (silence, a tap, a disconnected mic): nothing was said, and whisper is not asked to make words out of it.
      const x = resample(raw, mic.rate);
      // Digital silence (no mic connected: the webview delivers zeros) is nothing said, with or without the detector.
      if (!x.some((v) => Math.abs(v) > SILENT)) return { text: "" };
      const span = await speechSpan(x);
      if (span === null) return { text: "" };
      const all = cutTo(x, 16000, span ?? null);
      const text = await transcribeSamples(all, 16000, lang);
      return { text, m: native && text ? speechMetrics(all, 16000, text, { latencyMs: null }, native, lang) : undefined };
    },
  };
}
export type Recording = ReturnType<typeof startRecording>;

/** Transcript of raw mic samples at `rate` Hz; under 0.3 s counts as nothing said. */
async function transcribeSamples(all: Float32Array, rate: number, lang: string): Promise<string> {
  if (all.length < rate * 0.3) return "";
  if ((await sttProvider()) === "deepgram") return deepgramTranscribe(wav16(resample(all, rate)), lang);
  if (isCompanion) { // phone: the desktop's whisper (src-tauri/src/companion.rs), raw f32 samples
    const r = await fetch(`/transcribe?lang=${encodeURIComponent(lang)}`, { method: "POST", headers: { "X-Sprigo": "1" }, body: resample(all, rate) as BodyInit });
    if (!r.ok) throw new Error(await r.text());
    return r.text();
  }
  // ponytail: samples go over IPC as JSON numbers (~1 MB for 15 s); raw bytes if it ever feels slow
  return invoke<string>("transcribe", { samples: Array.from(resample(all, rate)), lang });
}

/** `pause(true)`: the tutor is talking but the learner may cut in (SPR-17); only clearly louder, longer speech counts. */
export type Listener = { pause(bargeIn?: boolean): void; resume(): void; stop(): Promise<void> };
// ponytail: 3× threshold, 300 ms start, guessed; raise if the tutor's own voice through the speakers still cuts her off
const STRICT = { ...VAD, threshold: VAD.threshold * 3, startMs: 300 };

/** Hands-free listening (tutor call): the voice detector cuts the mic stream into utterances and each one is transcribed.
 *  With `native` each utterance also gets its speech signals (SPR-25), measured here so the phone companion gets them too. */
export async function listen(lang: string, on: { utterance: (text: string, m?: Utterance) => void; speech?: () => void; level?: (rms: number) => void; error?: (e: Error) => void }, native?: string): Promise<Listener> {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: { ideal: 1 }, echoCancellation: true, noiseSuppression: true } });
  const ctx = new AudioContext();
  void ctx.resume(); // created after an await, so it may start suspended
  const src = ctx.createMediaStreamSource(stream);
  const proc = ctx.createScriptProcessor(4096, 1, 1); // ponytail: same deprecated node as startRecording
  let v = VAD_IDLE, e: VadEvent, paused = false, strict = false, stopped = false, pre: Float32Array[] = [], chunks: Float32Array[] = [];
  // When the mic re-opened after the tutor spoke; the first utterance after it gets the reply latency.
  // ponytail: measured from resume(), which TutorCall delays 400 ms past the tutor's last word, so it reads ~400 ms short.
  let armed: number | null = null, latency: number | null = null;
  const reset = () => { v = VAD_IDLE; pre = []; chunks = []; };
  proc.onaudioprocess = (ev) => {
    if (paused) return;
    const d = new Float32Array(ev.inputBuffer.getChannelData(0));
    const r = rms(d);
    on.level?.(r);
    [v, e] = vadStep(v, r, (d.length / ctx.sampleRate) * 1000, strict ? STRICT : VAD);
    if (e === "start") {
      chunks = [...pre]; on.speech?.();
      latency = armed === null ? null : Math.max(0, performance.now() - armed - VAD.startMs); armed = null;
    }
    if (v.speaking || e === "end") chunks.push(d);
    else { pre.push(d); if (pre.length > 3) pre.shift(); } // ~250 ms before the detector fired, so the first syllable is kept
    if (e !== "end") return;
    mark("vad");
    const all = concat(chunks), rate = ctx.sampleRate, timing = { latencyMs: latency };
    reset();
    transcribeSamples(all, rate, lang).then(
      (x) => { mark("stt"); if (!stopped) on.utterance(x.trim(), native ? speechMetrics(all, rate, x, timing, native, lang) : undefined); }, // empty too: the caller re-arms its silence timer
      (x) => { if (!stopped) on.error?.(x instanceof Error ? x : new Error(String(x))); }, // Tauri invoke rejects with strings
    );
  };
  src.connect(proc);
  proc.connect(ctx.destination);
  return {
    pause(bargeIn = false) { armed = null; if (bargeIn) { strict = true; return; } paused = true; reset(); on.level?.(0); },
    resume() { paused = strict = false; armed = performance.now(); },
    async stop() {
      if (stopped) return;
      stopped = paused = true;
      proc.disconnect(); src.disconnect();
      stream.getTracks().forEach((x) => x.stop());
      await ctx.close();
    },
  };
}
