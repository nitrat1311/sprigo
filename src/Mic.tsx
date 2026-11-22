import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Icon } from "./icons";
import { openMic, startRecording, sttReady, type Mic, type Recording } from "./stt";
import { useApp } from "./store";
import { type Utterance } from "./speech";
import { HelpButton } from "./Help";

/** Why speaking is unavailable (i18n key), or null when it can be used: needs the bundled model and the Settings switch. */
export function useSpeakBlock() {
  const { s } = useApp();
  const [ready, setReady] = useState<boolean | null>(null);
  useEffect(() => { sttReady().then(setReady); }, []);
  return ready === false ? "stt.unavailable" : !s.speakOn ? "stt.off" : null;
}

/** Tap to talk, tap again to stop (design: round blue button + status line). Calls `onText` with the transcript.
 *  The mic opens when the button appears and closes when it goes away (see `openMic`), so a take has no dead start. */
export function MicButton({ lang, onText, disabled, trigger = 0, native }: { lang: string; onText: (text: string, m?: Utterance) => void; disabled?: boolean; trigger?: number; native?: string }) {
  const { t } = useTranslation();
  const [state, setState] = useState<"idle" | "starting" | "rec" | "busy">("idle");
  const [err, setErr] = useState("");
  const mic = useRef<Promise<Mic> | undefined>(undefined);
  const gone = useRef(false);
  const rec = useRef<Recording | undefined>(undefined);
  /** The open mic, opened on first need; a failed open is forgotten so the next tap asks again. */
  const getMic = () => {
    if (mic.current) return mic.current;
    const p: Promise<Mic> = openMic().catch((e) => { if (mic.current === p) mic.current = undefined; throw e; });
    return (mic.current = p);
  };
  useEffect(() => {
    gone.current = false;
    getMic().catch(() => {}); // early, so it has settled by the first tap; a refusal shows on that tap
    return () => {
      gone.current = true;
      rec.current?.stop(false); rec.current = undefined;
      void mic.current?.then((m) => m.close(), () => {});
      mic.current = undefined;
    };
  }, []);

  const stop = async () => {
    const r = rec.current;
    if (!r) return;
    rec.current = undefined;
    setState("busy");
    try { const r2 = await r.stop(); if (!gone.current) onText(r2.text, r2.m); }
    catch (e) { if (!gone.current) setErr(`${t("stt.failed")}: ${(e as Error).message ?? e}`); }
    finally { if (!gone.current) setState("idle"); }
  };
  const toggle = async () => {
    if (state === "rec") return stop();
    if (state !== "idle") return;
    setErr("");
    setState("starting");
    try {
      let m = await getMic();
      if (!m.alive()) { void m.close(); mic.current = undefined; m = await getMic(); } // e.g. the mic was unplugged
      if (gone.current) return;
      rec.current = startRecording(m, lang, stop, native);
      setState("rec");
    }
    catch { if (!gone.current) { setErr(t("stt.noMic")); setState("idle"); } }
  };
  // Keyboard: each bump of `trigger` presses the button.
  // Starts at the mount value so a leftover count from an earlier speak item does not press it on mount.
  const seen = useRef(trigger);
  useEffect(() => { if (trigger !== seen.current) { seen.current = trigger; if (!disabled) toggle(); } }, [trigger]);

  return (
    <div className="mic-wrap">
      <button className={`mic-btn ${state}`} onClick={toggle} disabled={disabled || state === "busy" || state === "starting"} aria-pressed={state === "rec"}
        aria-label={t(state === "rec" ? "stt.stop" : "stt.record")}><Icon name="mic" /></button>
      <p className="muted small" role="status" style={{ textAlign: "center", color: err ? "var(--red)" : undefined }}>{err || t(`stt.${state}`)}</p>
      {err && <div style={{ display: "flex", justifyContent: "center" }}><HelpButton topic="mic" /></div>}
    </div>
  );
}
