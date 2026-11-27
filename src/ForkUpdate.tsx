import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { Update } from "@tauri-apps/plugin-updater";
import { isTauri } from "./db";
import { useApp } from "./store";

export async function findForkUpdate(): Promise<Update | null> {
  return isTauri ? (await import("@tauri-apps/plugin-updater")).check({ timeout: 10_000 }) : null;
}

/** Shows download progress and lets the learner confirm a fork update. */
export function UpdateSheet({ update }: { update: Update }) {
  const { t } = useTranslation();
  const { closeSheet } = useApp();
  const [pct, setPct] = useState<number | null>(null);
  const [err, setErr] = useState("");
  const install = async () => {
    setPct(0); setErr("");
    let total = 0, got = 0;
    try {
      await update.downloadAndInstall((e) => {
        if (e.event === "Started") total = e.data.contentLength ?? 0;
        else if (e.event === "Progress" && total) setPct(Math.round(((got += e.data.chunkLength) / total) * 100));
      });
      await (await import("@tauri-apps/plugin-process")).relaunch();
    } catch (e) { setErr((e as Error).message ?? String(e)); setPct(null); }
  };
  return (
    <div className="od-stack" style={{ "--od-gap": "var(--s-5)", textAlign: "left" } as React.CSSProperties}>
      <h3 className="od-center">{t("update.title", { version: update.version })}</h3>
      {update.body && <p className="small" style={{ whiteSpace: "pre-wrap" }}>{update.body}</p>}
      {pct !== null && <>
        <div className="progress-track"><div className="progress-fill green" style={{ width: `${pct}%` }} /></div>
        <span className="muted small" role="status">{t("update.downloading", { pct })}</span>
      </>}
      {err && <p className="small" role="alert" style={{ color: "var(--red)", overflowWrap: "anywhere" }}>{err}</p>}
      <button className="btn btn-primary btn-block" disabled={pct !== null} onClick={install}>{t("update.install")}</button>
      <button className="btn btn-ghost btn-block" disabled={pct !== null} onClick={closeSheet}>{t("update.later")}</button>
    </div>
  );
}
