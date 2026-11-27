import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { getSetting, isTauri, setSetting } from "./db";
import { useApp } from "./store";

const VERSION = "1.15.0";
const SEEN = "fork.seenRelease";
const NOTES = {
  ru: [
    "Вход в OpenRouter через браузер и выбор облачной модели для уроков.",
    "Румынский A1 и B1, мини-миссии и резервные упражнения этой ветки.",
    "Обновления устанавливаются из сборок вашего форка.",
  ],
  en: [
    "Sign in to OpenRouter in your browser and pick a cloud model for lessons.",
    "Romanian A1 and B1, mini-missions and built-in practice from this fork.",
    "Install updates from your fork’s builds.",
  ],
};

export const forkReleaseTitle = (lang?: string) => lang === "ru" ? "Что нового" : "What’s new";

function ReleaseNotes() {
  const { i18n } = useTranslation();
  const lang = i18n.resolvedLanguage === "ru" ? "ru" : "en";
  return <>
    <h3>{forkReleaseTitle(lang)} · {VERSION}</h3>
    <ul>{NOTES[lang].map((note) => <li key={note}>{note}</li>)}</ul>
  </>;
}

export function ForkReleaseSheet() {
  const { t } = useTranslation();
  const { closeSheet } = useApp();
  return <div className="od-stack sheet-wide" style={{ textAlign: "left" }}>
    <ReleaseNotes />
    <button className="btn btn-primary" onClick={closeSheet}>{t("sheet.close")}</button>
  </div>;
}

/** The notes are bundled with the fork and can be opened again in Settings. */
export function ForkReleaseBanner() {
  const { t } = useTranslation();
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    if (!isTauri) return;
    let live = true;
    void Promise.all([import("@tauri-apps/api/app").then((app) => app.getVersion()), getSetting(SEEN)])
      .then(([version, seen]) => {
        if (!live || version !== VERSION || seen === version) return;
        setVisible(true);
        return setSetting(SEEN, version);
      }).catch(console.warn);
    return () => { live = false; };
  }, []);
  if (!visible) return null;
  return <section className="card od-stack" style={{ marginBottom: "var(--s-4)" }}>
    <ReleaseNotes />
    <button className="btn btn-ghost" onClick={() => setVisible(false)}>{t("sheet.close")}</button>
  </section>;
}
