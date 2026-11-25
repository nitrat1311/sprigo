import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Icon, type IconName } from "../icons";
import { useApp } from "../store";
import { useStartLesson } from "../Lesson";
import { LEGEND_PASS, LEGEND_PRICE, UNIT_TEST_PASS, loadGuide, unitGrammar, unitWords, type Guide } from "../lessons";
import { prewarm } from "../tts";
import { SpeakButton } from "../SpeakButton";
import { BookmarkButton } from "../BookmarkButton";
import { AiSheet } from "./Settings";
import { LiveButton } from "./Screens";
import { BIOMES, biomeScene, biomeVars } from "../biomes";
import { buildPath, checkpointId, levelsOf, unitRef, type Cefr, type PathNode, type PathUnit } from "../course";
import { cachedTitleTranslations, missingTitles, translateTitles } from "../titleTranslations";
import { searchCourse, type Guidebook, type SearchHit, type SearchKind } from "../search";
import * as db from "../db";

const CHEST_GEMS = 20;

const PATH_OFF = [0, -44, 44, -70, 0, 70, 44, -44]; // winding offsets

// Dashed winding connector between lesson nodes (same curve as the design).
// Measures its parent (.path); own ref is attached before this layout effect runs, the parent's is not.
function PathLines() {
  const svg = useRef<SVGSVGElement>(null);
  const [geo, setGeo] = useState<{ w: number; h: number; d: string } | null>(null);
  useLayoutEffect(() => {
    const el = svg.current!.parentElement!;
    const measure = () => {
      const btns = [...el.querySelectorAll(".node-btn")];
      if (btns.length < 2) return setGeo(null);
      const pr = el.getBoundingClientRect();
      const pts = btns.map((b) => { const r = b.getBoundingClientRect(); return [r.left - pr.left + r.width / 2, r.top - pr.top + r.height / 2]; });
      let d = `M ${pts[0][0]} ${pts[0][1]}`;
      for (let i = 1; i < pts.length; i++) {
        const [x0, y0] = pts[i - 1], [x1, y1] = pts[i], my = (y0 + y1) / 2;
        d += ` C ${x0} ${my}, ${x1} ${my}, ${x1} ${y1}`;
      }
      setGeo({ w: pr.width, h: pr.height, d });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return (
    <svg ref={svg} className="path-lines" width={geo?.w} height={geo?.h} viewBox={geo ? `0 0 ${geo.w} ${geo.h}` : undefined}>
      {geo && <path d={geo.d} fill="none" strokeWidth={6} strokeLinecap="round" strokeDasharray="1 14" />}
    </svg>
  );
}

// Pebble outline for lesson nodes (64×64): drawn twice for the 3D edge, once more as the current-lesson ring.
const PEBBLE = "M33 3C48 4 61 14 61 31C61 48 49 61 31 61C15 61 3 50 3 33C3 16 16 2 33 3Z";
const NodeShape = () => (
  <svg className="node-shape" viewBox="0 0 64 64" aria-hidden="true">
    <path className="sh" d={PEBBLE} /><path className="fc" d={PEBBLE} /><path className="ring" d={PEBBLE} />
  </svg>
);

const ICON: Record<PathNode["kind"], Record<PathNode["state"], IconName>> = {
  step: { done: "check", current: "star", locked: "lock" },
  chest: { done: "check", current: "basket", locked: "basket" },
  checkpoint: { done: "trophy", current: "trophy", locked: "trophy" },
};

function UnitSection({ u, level, subs, native }: { u: PathUnit; level: Cefr; subs: Record<string, string>; native?: string }) {
  const { t } = useTranslation();
  const { s, setS, completeStep, openSheet, closeSheet, legendary, ai, toast } = useApp();
  const start = useStartLesson();
  // Mastery costs a shop ticket, else LEGEND_PRICE gems (charged only when the lesson can actually start).
  const startLegend = (id: string) => {
    closeSheet();
    if (!ai) return start(`legend:${id}`); // shows the "set up AI" sheet
    if (!s.legendTickets && s.gems < LEGEND_PRICE) return toast(t("shop.notEnough"));
    setS((s) => s.legendTickets ? { ...s, legendTickets: s.legendTickets - 1 } : { ...s, gems: s.gems - LEGEND_PRICE });
    start(`legend:${id}`);
  };
  // Done steps: review, or the Mastery version (gold once passed).
  const doneStep = (n: PathNode) => openSheet(<>
    <h3>{n.title}</h3><p>{t(legendary.has(n.id) ? "learn.legendDone" : "learn.legendDesc", { score: LEGEND_PASS })}</p>
    <button className="btn btn-gold btn-block" onClick={() => startLegend(n.id)}>
      <Icon name="star" /> {t("learn.legendary")} · {s.legendTickets ? t("learn.legendTicket", { count: s.legendTickets }) : <><Icon name="gem" />{LEGEND_PRICE}</>}
    </button>
    <button className="btn btn-ghost btn-block" onClick={() => { closeSheet(); start(n.id); }}>{t("learn.review")}</button>
  </>);
  const openChest = async (id: string) => {
    await completeStep(id, 0);
    setS((s) => ({ ...s, gems: s.gems + CHEST_GEMS }));
    openSheet(<>
      <h3>{t("sheet.chestOpened")}</h3><p>{t("sheet.chestGems", { count: CHEST_GEMS })}</p>
      <button className="btn btn-primary btn-block" onClick={closeSheet}>{t("sheet.great")}</button>
    </>);
  };
  const here = u.nodes.some((n) => n.kind === "step" && n.state === "current"); // the unit being worked on
  const later = u.nodes.every((n) => n.state === "locked");
  return (
    <section className={`unit${later ? " later" : ""}`} aria-label={u.title} data-unit={u.id}>
      <div className="unit-head">
        <div className="uh-row">
          <div><span className="uh-kicker">{t("learn.kicker", { level, unit: u.index })}</span><h2>{u.title}</h2>
            {subs[u.title] && <p className="unit-sub" lang={native}>{subs[u.title]}</p>}</div>
          <div className="od-row" style={{ "--od-gap": "var(--s-3)" } as React.CSSProperties}>
            <BookmarkButton kind="unit" target={unitRef(level, u.id)} title={u.title} />
            <button className="guidebook" onClick={() => openSheet(<GuideSheet unitId={u.id} level={level} />)}><Icon name="book" /><span>{t("learn.guidebook")}</span></button>
          </div>
        </div>
        {here && <button className="unit-skip" onClick={() => start(`unit-test:${u.id}`)}><Icon name="bolt" />{t("learn.skipUnit", { score: UNIT_TEST_PASS })}</button>}
      </div>
      <div className="path">
        <PathLines />
        {u.nodes.map((n, ni) => {
          const off = PATH_OFF[((u.index - 1) * 3 + ni) % PATH_OFF.length];
          const gold = n.kind === "step" && legendary.has(n.id);
          const cls = n.kind === "step" ? `${n.state}${gold ? " legendary" : ""}` : `${n.kind} ${n.state}`;
          const name = n.kind === "chest" ? t("learn.chest") : n.title;
          const onClick =
            n.state === "locked" ? undefined
            : n.kind === "step" ? () => n.state === "done" ? doneStep(n) : start(n.id)
            : n.kind === "chest" ? (n.state === "current" ? () => openChest(n.id) : undefined)
            : () => start(n.id); // checkpoint: retake allowed once done
          return (
            <div className={`node ${cls}`} style={{ transform: `translateX(${off}px)` }} key={n.id}>
              <button
                className="node-btn" onClick={onClick} aria-label={name} aria-disabled={!onClick || undefined}
                title={n.state === "locked" ? t("learn.lockedDesc") : undefined}
              >
                <NodeShape />
                <Icon name={gold ? "star" : ICON[n.kind][n.state]} />
              </button>
              {n.state === "current" && n.kind === "step" && <span className="start-tag">{t("learn.start")}</span>}
              <span className="node-label">{name}{subs[n.title] && <span className="node-sub" lang={native}>{subs[n.title]}</span>}</span>
            </div>
          );
        })}
      </div>
    </section>
  );
}

export function GuideSheet({ unitId, level }: { unitId: string; level: Cefr }) {
  const { t } = useTranslation();
  const { course, enrollment, profile, ai, closeSheet } = useApp();
  const unit = course!.levels[level]!.units.find((u) => u.id === unitId)!;
  const lang = course!.iso;
  const [guide, setGuide] = useState<Guide | null>(null);
  const [err, setErr] = useState("");
  useEffect(() => { prewarm(lang).catch(() => {}); }, [lang]);
  useEffect(() => {
    if (ai) loadGuide(enrollment!.id, { course: course!, level, native: profile!.native_lang }, unit).then(setGuide, (e) => setErr((e as Error).message));
  }, [unitId, level]);
  // Until the AI answers (or without AI), the plain YAML lists are shown.
  const words = guide?.vocabulary ?? unitWords(unit).map((word) => ({ word, translation: "", example: "", example_translation: "" }));
  const grammar = guide?.grammar ?? unitGrammar(unit).map((pattern) => ({ pattern, explanation: "", example: "" }));
  return <div className="guide">
    <div className="od-row" style={{ "--od-gap": "var(--s-3)" } as React.CSSProperties}>
      <h3 className="od-fill">{t("learn.guidebook")} · {unit.title}</h3>
      <BookmarkButton kind="guide" target={unitRef(level, unitId)} title={`${t("learn.guidebook")} · ${unit.title}`} />
    </div>
    {!guide && (
      <div className={`guide-status ${err ? "bad" : ""}`} role={err ? "alert" : "status"}>
        <span className={`guide-status-ico ${ai && !err ? "gen-pulse" : ""}`}><Icon name={err ? "x" : "spark"} /></span>
        <span>
          <b>{!ai ? t("ai.needed") : err ? t("ai.failed") : t("learn.guideLoading")}</b>
          <small>{!ai ? t("learn.guideNoAi") : err || t("learn.guideLoadingDesc")}</small>
        </span>
      </div>
    )}
    <h4>{t("learn.guideWords")}</h4>
    <div className="guide-words">
      {words.map((w) => (
        <SpeakButton key={w.word} className="card guide-word" text={w.word} lang={lang}>
          <b lang={lang}><Icon name="headphones" /> {w.word}</b>{w.translation && <span className="muted">{w.translation}</span>}
          {w.example && <small lang={lang}>{w.example}</small>}{w.example_translation && <small className="muted">{w.example_translation}</small>}
        </SpeakButton>
      ))}
    </div>
    {grammar.length > 0 && <h4>{t("learn.guideGrammar")}</h4>}
    {grammar.map((g) => (
      <div key={g.pattern} className="card" style={{ marginBottom: "var(--s-4)" }}>
        <b lang={lang}>{g.pattern}</b>
        {g.explanation && <p className="small" style={{ margin: "var(--s-2) 0" }}>{g.explanation}</p>}
        {g.example && <SpeakButton className="prompt-word" text={g.example} lang={lang}><Icon name="headphones" /> {g.example}</SpeakButton>}
      </div>
    ))}
    <button className="btn btn-primary btn-block" style={{ marginTop: "var(--s-4)" }} onClick={closeSheet}>{t("lesson.gotIt")}</button>
  </div>;
}

function LevelSheet() {
  const { t } = useTranslation();
  const { course, enrollment, setViewLevel, closeSheet, toast } = useApp();
  const levels = levelsOf(course!);
  const cur = levels.indexOf(enrollment!.level);
  const name = (l: Cefr) => t(`levels.${l}`, { defaultValue: course!.levels[l]!.title });
  return <>
    <h3>{t("learn.levels")}</h3>
    <div className="od-stack" style={{ "--od-gap": "var(--s-4)", marginTop: "var(--s-4)" } as React.CSSProperties}>
      {levels.map((l, i) => (
        <button key={l} className="card row-item" onClick={() => {
          if (i > cur) return toast(t("learn.finishFirst", { level: name(enrollment!.level) }));
          setViewLevel(l); closeSheet();
        }}>
          <span className="biome-thumb" aria-hidden="true" dangerouslySetInnerHTML={{ __html: biomeScene(l, 80) }} />
          <span className="od-field od-fill"><b>{l} · {name(l)}</b>
            <span className="muted small">{t(`biome.${BIOMES[l].id}`)} · {t(i < cur ? "learn.levelDone" : i === cur ? "learn.levelCurrent" : "learn.levelLocked")}</span></span>
          <Icon name={i < cur ? "check" : i === cur ? "star" : "lock"} />
        </button>
      ))}
    </div>
  </>;
}

function LevelCard({ level, remaining, total }: { level: Cefr; remaining: number; total: number }) {
  const { t } = useTranslation();
  const { course, done } = useApp();
  const start = useStartLesson();
  const levels = levelsOf(course!);
  const next = levels[levels.indexOf(level) + 1];
  const name = (l: Cefr) => t(`levels.${l}`, { defaultValue: course!.levels[l]?.title ?? l });
  const hasExam = !!course!.levels[level]!.checkpoint;
  if (!next && (done.has(checkpointId(level)) || (!hasExam && remaining === 0))) return (
    <div className="card" style={{ margin: "var(--s-3) 0 var(--s-6)", textAlign: "center" }}>
      <h3 style={{ fontWeight: 900, fontSize: "var(--fs-20)" }}>{t("learn.courseDone", { level: name(level) })}</h3>
      <p className="muted small">{t("learn.courseDoneDesc")}</p>
    </div>
  );
  const title = remaining === 0 ? t("learn.checkpointNext", { level: name(next ?? level) })
    : next ? t("learn.lessonsLeft", { count: remaining, level: name(next) }) : t("learn.lessonsLeftFinish", { count: remaining, level: name(level) });
  return (
    <div className="card level-card">
      <div className="biome-band" aria-hidden="true" dangerouslySetInnerHTML={{ __html: biomeScene(level, 70) }} />
      <h3 style={{ fontWeight: 900, fontSize: "var(--fs-20)" }}>{title}</h3>
      <div className="progress-track" style={{ margin: "var(--s-4) 0 var(--s-4)" }}><div className="progress-fill green" style={{ width: `${((total - remaining) / total) * 100}%` }} /></div>
      {hasExam && remaining > 0 && <button className="btn btn-ghost btn-block" onClick={() => start(`${level}:test`)}>{t("learn.skipLevel", { level })}</button>}
    </div>
  );
}

/** "Back to my lesson", shown only while the current node is off screen. */
function ScrollButtons() {
  const { t } = useTranslation();
  const [here, setHere] = useState(false);
  useEffect(() => {
    const check = () => {
      const r = document.querySelector(".node.current")?.getBoundingClientRect();
      setHere(!!r && (r.bottom < 0 || r.top > innerHeight));
    };
    check();
    addEventListener("scroll", check, { passive: true }); addEventListener("resize", check);
    return () => { removeEventListener("scroll", check); removeEventListener("resize", check); };
  }, []);
  const toHere = () => document.querySelector(".node.current")?.scrollIntoView({ block: "center", behavior: "smooth" });
  return <div className="scroll-btns">
    {here && <button className="scroll-btn here" onClick={toHere} aria-label={t("learn.toHere")} data-tip={t("learn.toHere")}><Icon name="star" /></button>}
  </div>;
}

/** Only the head of the unit that holds the bottom edge of the viewport may pin. Left to CSS alone,
 *  every unit reaching below the fold drags its head up to the same spot and covers the right one. */
function usePinnedHeads() {
  useEffect(() => {
    let raf = 0;
    const check = () => {
      raf = 0;
      const fold = innerHeight;
      for (const u of document.querySelectorAll<HTMLElement>(".path-stack > .unit")) {
        const r = u.getBoundingClientRect();
        u.toggleAttribute("data-pinned", r.top < fold && r.bottom >= fold);
      }
    };
    const queue = () => { if (!raf) raf = requestAnimationFrame(check); };
    check();
    addEventListener("scroll", queue, { passive: true }); addEventListener("resize", queue);
    return () => {
      removeEventListener("scroll", queue); removeEventListener("resize", queue);
      cancelAnimationFrame(raf);
    };
  }, []);
}

let setupOffered = false;
/** A unit to open Learn on instead of the next lesson (Saved list, #45).
 *  ponytail: valid for a second rather than cleared on use, StrictMode runs the layout effect twice. */
export const jumpTo = { unit: "", until: 0 };

const SEARCH_ICON: Record<SearchKind, IconName> = {
  unit: "star", step: "story", vocabulary: "headphones", grammar: "pen", guide: "book",
};
const MAX_HITS = 25;

/** Search over the course's units, lessons, words and grammar, and the guidebooks already written (#44). */
function SearchBox() {
  const { t } = useTranslation();
  const { course, enrollment, openSheet, setViewLevel, toast } = useApp();
  const [q, setQ] = useState("");
  const [guides, setGuides] = useState<Guidebook[]>([]);
  const query = q.trim(), active = query.length >= 2;
  useEffect(() => {
    if (!enrollment || !active) return;
    // Loaded when the search starts, so a guidebook written since the screen opened is searched too.
    db.cachedGuidebooks<Guide>(enrollment.id).then(setGuides).catch((e) => console.warn("guide search", e));
  }, [enrollment?.id, active]);
  const hits = useMemo(() => course ? searchCourse(course, query, guides) : [], [course, query, guides]);
  if (!course || !enrollment) return null;
  const levels = levelsOf(course);
  const future = (h: SearchHit) => levels.indexOf(h.level) > levels.indexOf(enrollment.level);
  const open = (h: SearchHit) => {
    if (future(h)) return toast(t("learn.finishFirst", { level: enrollment.level }));
    setQ("");
    if (h.kind === "guide") return openSheet(<GuideSheet unitId={h.unitId} level={h.level} />);
    setViewLevel(h.level);
    // The next frame has rendered this level; then bring the unit's header into view (a whole unit is taller than the screen).
    requestAnimationFrame(() => document.querySelector(`[data-unit="${h.unitId}"] .unit-head`)?.scrollIntoView({ block: "center", behavior: "smooth" }));
  };
  return <div className="search-box" role="search">
    <input className="input" type="search" value={q} onChange={(e) => setQ(e.target.value)}
      placeholder={t("search.placeholder")} aria-label={t("search.label")} />
    <p className="search-status muted small" role="status">
      {active ? (hits.length ? t("search.count", { count: hits.length }) : t("search.none", { query })) : ""}
    </p>
    {active && <div className="search-results">
      {hits.length > 0 && <div className="od-stack" style={{ "--od-gap": "8px" } as React.CSSProperties}>
        {hits.slice(0, MAX_HITS).map((h) => (
          <button className="card row-item" key={`${h.level}:${h.unitId}:${h.kind}:${h.text}`} onClick={() => open(h)}>
            <span className="od-field od-fill">
              <b>{h.text}</b>
              <span className="muted small">
                {h.unitTitle} · {h.level} · {t(`search.${h.kind}`)}{future(h) ? ` · ${t("grammar.later")}` : ""}
              </span>
              {h.note && <span className="small">{h.note}</span>}
            </span>
            <Icon name={SEARCH_ICON[h.kind]} />
          </button>
        ))}
      </div>}
      {hits.length > MAX_HITS && <p className="muted small" style={{ margin: "8px 0 0" }}>{t("search.more", { count: MAX_HITS })}</p>}
    </div>}
  </div>;
}

export function Learn() {
  const { t } = useTranslation();
  const { course, enrollment, done, viewLevel, openSheet, courseErrors, ai, profile } = useApp();
  const shownLevel = viewLevel ?? enrollment?.level;
  usePinnedHeads();
  // The path grows upward, so open on the lesson to do next instead of the page top.
  useLayoutEffect(() => {
    const saved = Date.now() < jumpTo.until ? document.querySelector(`[data-unit="${jumpTo.unit}"]`) : null;
    const target = saved ?? document.querySelector(".node.current") ?? document.querySelector(".node.locked") ?? [...document.querySelectorAll(".node")].pop();
    target?.scrollIntoView({ block: "center" });
  }, [enrollment?.id, shownLevel, course, done]); // also after a profile switch, the async course load and a finished lesson
  // First run (DECISIONS C6): offer setup once per launch; the banner stays until a provider is saved.
  useEffect(() => { if (!ai && !setupOffered) { setupOffered = true; openSheet(<AiSheet />); } }, [ai]);
  // B: unit and step titles keep their English text; the native translation is fetched lazily, one batch per level,
  // and cached per (course, native language). Without AI, or while it is on its way, the path renders as before.
  const native = profile?.native_lang;
  const [subs, setSubs] = useState<Record<string, string>>({});
  // A translation identical to the title (names, "A1 Checkpoint") adds nothing: show it once.
  const shown = Object.fromEntries(Object.entries(subs).filter(([k, v]) => v.trim().toLowerCase() !== k.trim().toLowerCase()));
  useEffect(() => {
    if (!course || !native || native === "en" || native === course.iso) { setSubs({}); return; }
    let live = true;
    cachedTitleTranslations(course.iso, native).then((cached) => {
      if (!live) return;
      setSubs(cached);
      if (!ai) return;
      const def = shownLevel ? course.levels[shownLevel] : undefined;
      const titles = def ? [...def.units.flatMap((u) => [u.title, ...u.steps.map((s) => s.title)]), ...(def.checkpoint ? [def.checkpoint.title] : [])] : [];
      const missing = missingTitles(titles, cached);
      if (missing.length) translateTitles(course, native, missing).then((more) => { if (live) setSubs((s) => ({ ...s, ...more })); });
    });
    return () => { live = false; };
  }, [course, shownLevel, native, ai]);
  const setup = !ai && (
    <div className="soon-banner" role="status" style={{ borderColor: "var(--blue)" }}>
      <span className="od-field od-fill"><b>{t("ai.needed")}</b><span className="small">{t("ai.neededDesc")}</span></span>
      <button className="btn btn-blue" onClick={() => openSheet(<AiSheet />)}>{t("ai.setUp")}</button>
    </div>
  );
  const errors = courseErrors.length > 0 && (
    <div className="soon-banner" role="alert" style={{ borderColor: "var(--red)", alignItems: "flex-start" }}>
      <span className="od-field" style={{ minWidth: 0 }}><b>{t("learn.courseErrors")}</b>
        {courseErrors.map((e) => <pre key={e} className="small" style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere", font: "inherit" }}>{e}</pre>)}</span>
    </div>
  );
  if (!course || !enrollment) return <>{errors}<p className="muted" style={{ marginTop: "var(--s-6)" }}>{t("learn.noCourse")}</p></>;
  const level = viewLevel ?? enrollment.level;
  const { units, remaining } = buildPath(course.levels[level]!, level, done);
  const total = course.levels[level]!.units.reduce((a, u) => a + u.steps.length, 0);
  const levels = levelsOf(course);
  const nextLevel = levels[levels.indexOf(level) + 1]; // the goal at the top of this path
  const levelName = (l: Cefr) => t(`levels.${l}`, { defaultValue: course.levels[l]?.title ?? l });
  return (
    <>
      <LiveButton className="mobile-only" />
      {setup}{errors}
      <SearchBox />
      <button className="btn btn-ghost" style={{ marginTop: "var(--s-6)" }} onClick={() => openSheet(<LevelSheet />)} aria-haspopup="dialog">
        {level} · {levelName(level)} <Icon name="down" />
      </button>
      {level === enrollment.level && <LevelCard level={level} remaining={remaining} total={total} />}
      <div className="path-stack" style={biomeVars(level)}>
        <div className="biome-ground" aria-hidden="true" dangerouslySetInnerHTML={{ __html: biomeScene(level, 72) }} />
        {units.map((u) => <UnitSection u={u} level={level} subs={shown} native={native} key={u.id} />)}
        {/* The stack is column-reverse: last in DOM is the top of the path, past the highest unit. */}
        <p className="summit">
          <Icon name="summit" />
          <span>{nextLevel ? t("learn.summit", { level: levelName(nextLevel) }) : t("learn.summitEnd")}</span>
        </p>
      </div>
      <ScrollButtons />
    </>
  );
}
