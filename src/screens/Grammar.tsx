// Grammar reference (#29): every pattern in the course, level → unit, with an explanation and a short drill per pattern.
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Icon } from "../icons";
import { useApp } from "../store";
import { useStartLesson } from "../Lesson";
import { loadGuide, type Guide } from "../lessons";
import { cachedGuides } from "../db";
import { CEFR } from "../course";
import { SpeakButton } from "../SpeakButton";
import { filterGrammar, grammarIndex, type GrammarEntry } from "../grammar";

export function Grammar() {
  const { t } = useTranslation();
  const { course, enrollment, done, openSheet } = useApp();
  const [q, setQ] = useState("");
  const index = useMemo(() => course ? grammarIndex(course) : [], [course]);
  const shown = filterGrammar(index, q);
  const cur = enrollment ? CEFR.indexOf(enrollment.level) : 0;
  return (
    <>
      <h1 className="section-title">{t("grammar.title")}</h1>
      <p className="muted" style={{ marginBottom: "var(--s-5)" }}>{t("grammar.subtitle")}</p>
      <input className="input" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("grammar.search")} aria-label={t("grammar.search")} style={{ marginBottom: "var(--s-5)" }} />
      {!shown.length && <p className="muted">{t("grammar.none")}</p>}
      {shown.map((l) => (
        <section key={l.level} aria-label={`${l.level} · ${t(`levels.${l.level}`, { defaultValue: l.title })}`} style={{ marginBottom: "var(--s-6)" }}>
          <h2 className="section-title">{l.level} · {t(`levels.${l.level}`, { defaultValue: l.title })}</h2>
          {l.units.map((u) => {
            // Like Stories: earlier levels are open, and in the current level the first unit and every started one.
            const units = course!.levels[l.level]!.units, ui = units.findIndex((x) => x.id === u.id);
            const lv = CEFR.indexOf(l.level);
            const reached = lv < cur || (lv === cur && (ui === 0 || units[ui].steps.some((st) => done.has(st.id))));
            return (
              // Collapsed by default to keep the page short; a search opens every match.
              <details key={u.id} className="grammar-unit" open={q.trim() ? true : undefined}>
                <summary>
                  <h3 className="od-fill">{u.title} {!reached && <span className="muted small">· {t("grammar.later")}</span>}</h3>
                  <span className="muted small">{u.patterns.length}</span>
                  <Icon name="down" />
                </summary>
                <div className="od-stack" style={{ "--od-gap": "var(--s-3)" } as React.CSSProperties}>
                  {u.patterns.map((e) => (
                    <button key={e.pattern} className="card row-item" lang={course!.iso} onClick={() => openSheet(<GrammarSheet entry={e} />)}>
                      <span className="od-fill"><b>{e.pattern}</b></span><Icon name="book" />
                    </button>
                  ))}
                </div>
              </details>
            );
          })}
        </section>
      ))}
    </>
  );
}

type Explained = Guide["grammar"][number];

function GrammarSheet({ entry }: { entry: GrammarEntry }) {
  const { t } = useTranslation();
  const { course, enrollment, profile, ai, closeSheet } = useApp();
  const start = useStartLesson();
  const lang = course!.iso, first = entry.units[0];
  const [g, setG] = useState<Explained | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const pick = (guides: Guide[]) => guides.flatMap((x) => x.grammar).find((x) => x.pattern === entry.pattern && x.explanation) ?? null;
  useEffect(() => { cachedGuides<Guide>(enrollment!.id, first.level).then((gs) => setG(pick(gs))).catch(console.warn); }, [entry.pattern, first.level, enrollment?.id]);
  const generate = () => {
    const unit = course!.levels[first.level]!.units.find((u) => u.id === first.id)!;
    setBusy(true); setErr("");
    loadGuide(enrollment!.id, { course: course!, level: first.level, native: profile!.native_lang }, unit)
      .then((guide) => { const hit = pick([guide]); hit ? setG(hit) : setErr(t("grammar.notInGuide")); }, (e) => setErr((e as Error).message))
      .finally(() => setBusy(false));
  };
  return <div className="guide">
    <h3 lang={lang}>{entry.pattern}</h3>
    <p className="muted small">{t("grammar.from", { level: first.level, unit: first.title })}</p>
    {g ? (
      <div className="card" style={{ marginBottom: "var(--s-4)" }}>
        <p className="small" style={{ margin: "0 0 var(--s-3)" }}>{g.explanation}</p>
        {g.example && <SpeakButton className="prompt-word" text={g.example} lang={lang}><Icon name="headphones" /> {g.example}</SpeakButton>}
      </div>
    ) : !ai ? <p className="small">{t("learn.guideNoAi")}</p> : (
      <>
        {err && <p className="small" role="alert">{t("grammar.failed")} {err}</p>}
        <button className="btn btn-ghost btn-block" disabled={busy} onClick={generate}>{t(busy ? "grammar.explaining" : "grammar.explain")}</button>
      </>
    )}
    {entry.units.length > 1 && <p className="muted small">{t("grammar.alsoIn", { units: entry.units.slice(1).map((u) => `${u.level} ${u.title}`).join(", ") })}</p>}
    <button className="btn btn-primary btn-block" style={{ marginTop: "var(--s-4)" }} onClick={() => { closeSheet(); start(`grammar:${entry.pattern}`); }}>{t("grammar.practise")}</button>
    <button className="btn btn-ghost btn-block" onClick={closeSheet}>{t("sheet.close")}</button>
  </div>;
}
