import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Icon, type IconName } from "./icons";
import { useApp, type BootError, type Route } from "./store";
import { Rail } from "./Rail";
import { Lesson, sfxState } from "./Lesson";
import { today } from "./progress";
import { goalsOf, metricTotals, reportDue } from "./goals";
import { ReportSheet } from "./GoalsCard";
import { nudgeDue, nudgeMessage } from "./nudge";
import { keepInBackground, notify } from "./notify";
import { takeOver, resetDataDir } from "./datadir";
import { isTauri, profileWordDays, speechMsDays } from "./db";
import { Chat, Story } from "./Talk";
import { Flashcards } from "./Flashcards";
import { TutorCall } from "./TutorCall";
import { ForkReleaseBanner } from "./ForkRelease";
import { findForkUpdate, UpdateSheet } from "./ForkUpdate";
import { ErrorBoundary } from "./ErrorBoundary";
import { parseTalkId, type CharacterId } from "./characters";
import { characterOf } from "./tutors";
import { parseStoryId, type Cefr } from "./course";
import { parseWriteId } from "./writing";
import { Writing } from "./Write";
import { Learn } from "./screens/Learn";
import { Garden } from "./screens/Garden";
import { Grammar } from "./screens/Grammar";
import { Notes } from "./screens/Notes";
import { Settings } from "./screens/Settings";
import { Avatar, ProfileGate, useLangName } from "./screens/Profiles";
import { Practice, League, Shop, Profile, Stories, Roleplay, Friends, Notifications, LiveButton } from "./screens/Screens";

const NAV: { id: Route; icon: IconName }[] = [
  { id: "learn", icon: "home" }, { id: "practice", icon: "dumbbell" }, { id: "league", icon: "trophy" },
  { id: "profile", icon: "user" },
];
const MORE: { id: Route; icon: IconName }[] = [
  { id: "shop", icon: "shop" }, { id: "grammar", icon: "book" }, { id: "notes", icon: "pen" },
  { id: "stories", icon: "story" }, { id: "roleplay", icon: "masks" }, { id: "friends", icon: "users" },
];
/** Not navigation targets of their own: the desktop profile menu and the mobile "More" sheet. */
const AUX: { id: Route; icon: IconName }[] = [
  { id: "notifications", icon: "bell" }, { id: "settings", icon: "gear" },
];
const SCREENS: Record<Route, () => React.ReactNode> = {
  learn: Learn, practice: Practice, league: League, shop: Shop, profile: Profile,
  stories: Stories, roleplay: Roleplay, friends: Friends, notifications: Notifications, settings: Settings,
  garden: Garden, grammar: Grammar, notes: Notes,
};

/** Text size (#34): the webview's own zoom in the app, so vh and px scale together. Zoom hotkeys stay off (tauri.conf default), so nothing fights it.
 *  ponytail: in a browser (phone, dev) CSS zoom on <html>; fine in Chromium, unchecked in mobile Safari. */
async function textSize(f: number) {
  if (isTauri) return (await import("@tauri-apps/api/webview")).getCurrentWebview().setZoom(f);
  document.documentElement.style.zoom = f === 1 ? "" : String(f);
}

function NavBtn({ id, icon, onGo }: { id: Route; icon: IconName; onGo?: () => void }) {
  const { route, go } = useApp();
  const { t } = useTranslation();
  const active = route === id;
  return (
    <button className={`nav-item ${active ? "active" : ""}`} onClick={() => { go(id); onGo?.(); }} aria-current={active ? "page" : undefined}>
      <Icon name={icon} /><span>{t(`nav.${id}`)}</span>
    </button>
  );
}

/** Phone bottom bar: the main tabs, then "…" opening the rest upwards. */
function BottomNav({ inert }: { inert: boolean }) {
  const { t } = useTranslation();
  const { route } = useApp();
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);
  const rest = [...MORE, ...AUX];
  const inMore = rest.some((n) => n.id === route);
  return (
    <>
      {open && <div className="more-backdrop" onClick={() => setOpen(false)} />}
      {open && <div className="more-menu" id="more-menu" inert={inert}>{rest.map((n) => <NavBtn key={n.id} {...n} onGo={() => setOpen(false)} />)}</div>}
      <nav className="bottom-nav" aria-label={t("nav.bottom")} inert={inert}>
        {NAV.map((n) => <NavBtn key={n.id} {...n} onGo={() => setOpen(false)} />)}
        <button className={`nav-item ${inMore || open ? "active" : ""}`} onClick={() => setOpen((o) => !o)}
          aria-expanded={open} aria-controls="more-menu">
          <Icon name="dots" /><span>{t("nav.more")}</span>
        </button>
      </nav>
    </>
  );
}

/** Desktop footer: the learner chip opens account actions (notifications, settings, switch profile). */
function ProfileMenu() {
  const { t } = useTranslation();
  const { profile, go, logout } = useApp();
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ left: number; bottom: number } | null>(null);
  const wrap = useRef<HTMLDivElement>(null);
  const btn = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);

  const close = (back = false) => {
    setOpen(false);
    if (back) requestAnimationFrame(() => btn.current?.focus({ preventScroll: true }));
  };
  const toggle = () => {
    if (open) return close();
    // The sidebar scrolls (large text, short windows), so a fixed popover sits above the chip instead of inside the scroll box.
    const r = btn.current!.getBoundingClientRect();
    setPos({ left: r.left, bottom: window.innerHeight - r.top + 8 });
    setOpen(true);
  };
  useEffect(() => {
    if (!open) return;
    menu.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") close(true); };
    const onDown = (e: PointerEvent) => { if (!wrap.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onDown);
    return () => { document.removeEventListener("keydown", onKey); document.removeEventListener("pointerdown", onDown); };
  }, [open]);
  const action = (f: () => void) => () => { f(); close(true); };
  if (!profile) return null;

  return (
    <div className="sidebar-foot" ref={wrap}>
      <button ref={btn} className="nav-item profile-switch" aria-haspopup="menu" aria-expanded={open}
        aria-controls={open ? "account-menu" : undefined} title={t("nav.account")} onClick={toggle}>
        <Avatar p={profile} size={30} /><span className="od-fill">{profile.name}</span><Icon name="dots" />
      </button>
      {open && pos && (
        <div className="account-menu" id="account-menu" role="menu" aria-label={t("nav.account")} ref={menu}
          style={{ left: pos.left, bottom: pos.bottom }}>
          {AUX.map((n) => (
            <button key={n.id} role="menuitem" className="nav-item" onClick={action(() => go(n.id))}>
              <Icon name={n.icon} /><span className="od-fill">{t(`nav.${n.id}`)}</span>
            </button>
          ))}
          <button role="menuitem" className="nav-item" onClick={action(logout)}>
            <Icon name="swap" /><span className="od-fill">{t("settings.logout")}</span>
          </button>
        </div>
      )}
    </div>
  );
}

function BootErrorScreen({ e }: { e: BootError }) {
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);
  const act = (f: () => Promise<void> | void) => async () => { setBusy(true); try { await f(); } catch (x) { console.error(x); setBusy(false); } };
  // Data folder / lock: retrying is a reload, the boot sequence checks everything again.
  const retry = <button className="btn btn-primary btn-block" disabled={busy} onClick={() => location.reload()}>{t("boot.retry")}</button>;
  if (e.kind === "unreachable" || e.kind === "locked") return (
    <div className="boot-error" role="alert">
      <div className="card od-stack" style={{ "--od-gap": "var(--s-4)" } as React.CSSProperties}>
        <h3>{t(e.kind === "locked" ? "boot.lockedTitle" : "boot.unreachableTitle", { device: e.detail })}</h3>
        <p className="muted">{t(e.kind === "locked" ? "boot.lockedDesc" : "boot.unreachableDesc")}</p>
        {e.kind === "unreachable" && <pre className="boot-detail">{e.detail}</pre>}
        {retry}
        {e.kind === "locked"
          ? <button className="btn btn-ghost btn-block" disabled={busy} onClick={act(takeOver)}>{t("boot.takeOver")}</button>
          : <button className="btn btn-ghost btn-block" disabled={busy} onClick={act(resetDataDir)}>{t("boot.useDefault")}</button>}
      </div>
    </div>
  );
  const future = e.kind === "future";
  return <FutureOrFailed e={e} future={future} />;
}

function FutureOrFailed({ e, future }: { e: BootError; future: boolean }) {
  const { t } = useTranslation();
  return (
    <div className="boot-error" role="alert">
      <div className="card">
        <h3>{t(future ? "boot.newerTitle" : "boot.failedTitle")}</h3>
        <p className="muted">{t(future ? "boot.newerDesc" : "boot.failedDesc")}</p>
        {!future && <pre className="boot-detail">{e.detail}</pre>}
      </div>
    </div>
  );
}

export default function App() {
  const { t, i18n } = useTranslation();
  const { ready, bootError, profile, route, sheet, openSheet, closeSheet, toastMsg, toastOn, lessonId, endLesson, s, setS, course, tutors } = useApp();
  const langName = useLangName();
  const Screen = SCREENS[route];
  const resolve = (id: CharacterId) => characterOf(id, tutors);
  const talk = lessonId && /^(chat|call|rehearse|drill):/.test(lessonId) ? parseTalkId(lessonId, resolve) : undefined;
  const talkCh = talk ? resolve(talk.who) : undefined;
  const callWho = lessonId?.startsWith("tutor:") ? (lessonId.slice(6) as CharacterId) : undefined;
  const callCh = callWho ? resolve(callWho) : undefined;
  const story = lessonId?.startsWith("story:") ? parseStoryId(lessonId) : undefined;
  const writing = lessonId?.startsWith("write:") ? parseWriteId(lessonId) : undefined;
  const badTalk = talk === null || story === null || writing === null || (!!callWho && !callCh);
  useEffect(() => { if (badTalk) endLesson(); }, [badTalk]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape" && sheet) closeSheet(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [sheet, closeSheet]);

  // Modal focus (#34): what's behind a sheet or lesson is inert; focus moves into it, and back to where it was once it closes.
  const sheetBox = useRef<HTMLDivElement>(null);
  const back = useRef<{ sheet?: HTMLElement; lesson?: HTMLElement }>({});
  const activeProfile = useRef(profile?.id); // async work checks this before writing to the profile
  useEffect(() => { activeProfile.current = profile?.id; }, [profile?.id]);
  const hasOverlay = useRef(false);
  hasOverlay.current = !!(sheet || lessonId);
  useEffect(() => {
    if (!profile?.id || !isTauri) return;
    let live = true;
    void findForkUpdate().then((update) => {
      if (live && update && !hasOverlay.current) openSheet(<UpdateSheet update={update} />);
    }).catch((err) => console.warn("fork update check", err));
    return () => { live = false; };
  }, [profile?.id]);
  useEffect(() => {
    // focusin for the keyboard; pointerdown too, because WebKit (the macOS app) doesn't focus a clicked button
    const f = (e: Event) => {
      const el = (e.target as HTMLElement).closest?.<HTMLElement>("button, a, input, select, textarea, [tabindex]");
      if (!el || el.closest(".sheet")) return;
      back.current.sheet = el;
      if (!el.closest(".lesson-overlay")) back.current.lesson = el;
    };
    document.addEventListener("focusin", f);
    document.addEventListener("pointerdown", f);
    return () => { document.removeEventListener("focusin", f); document.removeEventListener("pointerdown", f); };
  }, []);
  const restore = (to?: HTMLElement) => () => { requestAnimationFrame(() => { if (to?.isConnected) to.focus({ preventScroll: true }); }); };
  useEffect(() => { if (sheet) return restore(back.current.sheet); }, [!!sheet]);
  // Also when one sheet replaces another: the focused button went with the old one.
  useEffect(() => { if (sheet && !sheetBox.current!.contains(document.activeElement)) sheetBox.current!.focus(); }, [sheet]);
  // A sheet is named by its heading, kept current when the heading changes. ponytail: read from the DOM, so sheets need no id plumbing
  useEffect(() => {
    const box = sheetBox.current;
    if (!box) return; // not rendered until boot is done
    const name = () => { const h = box.querySelector("h2, h3")?.textContent; if (h) box.setAttribute("aria-label", h); else box.removeAttribute("aria-label"); };
    const m = new MutationObserver(name);
    m.observe(box, { childList: true, subtree: true, characterData: true });
    return () => m.disconnect();
  }, [ready, !!bootError]);
  useEffect(() => {
    if (!lessonId) return;
    requestAnimationFrame(() => {
      const box = document.querySelector<HTMLElement>(".lesson-overlay");
      if (box && !box.contains(document.activeElement)) box.focus();
    });
    return restore(back.current.lesson);
  }, [lessonId]);

  useEffect(() => {
    sfxState.on = s.soundOn;
    document.documentElement.dataset.motion = s.reduceMotion ? "reduce" : "full";
    document.documentElement.dataset.font = s.readableFont ? "readable" : "default";
    document.documentElement.dataset.contrast = s.highContrast ? "high" : "default";
  }, [s.soundOn, s.reduceMotion, s.readableFont, s.highContrast]);
  useEffect(() => { textSize(s.textSize).catch((e) => console.warn("text size", e)); }, [s.textSize]);

  // ponytail: a PIN-locked profile never auto-signs in, so its reminder only fires once someone signs in
  useEffect(() => { keepInBackground(!!profile && s.reminderOn); }, [profile?.id, s.reminderOn]);

  // Nudges (Settings → Reminders): up to 3 a day, checked every minute while the app runs, even in the background.
  useEffect(() => {
    if (!profile || !s.reminderOn || !course) return;
    const tick = () => {
      const slot = nudgeDue(s);
      if (slot === null) return;
      const day = today();
      setS((x) => ({ ...x, reminded: `${day}:${slot}` }));
      const { group, i } = nudgeMessage(slot, s.streak, day);
      const vars = { count: s.streak, lang: langName(course.iso) };
      notify(t(`nudges.${group}.${i}.t`, vars), t(`nudges.${group}.${i}.b`, vars));
    };
    tick();
    const h = setInterval(tick, 60_000);
    return () => clearInterval(h);
  }, [profile?.id, s.reminderOn, s.lastActive, s.reminded, s.streak, course?.iso, i18n.language]);

  // #43: the finished week's summary, once, on the first launch after a new week. A quiet week is marked seen without a sheet.
  const reported = useRef("");
  useEffect(() => {
    if (!ready || !profile) return; // the sheet box and its heading observer only exist once the app has rendered
    const week = reportDue(profile.stats.reportedWeek, today());
    if (!week) return;
    const key = `${profile.id}:${week}`;
    if (reported.current === key) return; // React StrictMode runs effects twice in development
    reported.current = key;
    const p = profile, id = p.id; // the queries may outlive the profile they belong to
    (async () => {
      const [words, speakMs] = await Promise.all([profileWordDays(id), speechMsDays(id)]);
      if (activeProfile.current !== id) { reported.current = ""; return; } // signed out or switched: nothing to mark
      const data = { xp: { [p.stats.day]: p.stats.todayXp, ...p.stats.xpDays }, words, speakMs };
      const cur = (m: "xp" | "words" | "speak") => metricTotals(m, "week", week, data).cur;
      setS((x) => ({ ...x, reportedWeek: week }));
      if (!cur("xp") && !cur("words") && !cur("speak")) return;
      notify(t("goals.notifyTitle"), t("goals.notifyBody", { n: cur("xp") }));
      openSheet(<ReportSheet period="week" start={week} goals={goalsOf(p.stats)} data={data} />);
    })().catch((e) => console.error("weekly report", e));
  }, [ready, profile?.id]);

  if (bootError) return <BootErrorScreen e={bootError} />;
  if (!ready) return null;
  return (
    <>
      {!profile ? <ProfileGate /> : <>
      <div className="app" inert={!!(lessonId || sheet)}>
        <aside className="sidebar" aria-label={t("nav.main")} inert={route === "garden"}>
          <div className="logo">sprigo</div>
          <nav>
            <LiveButton />
            {NAV.map((n) => <NavBtn key={n.id} {...n} />)}
            <div className="nav-group-label">
              {t("nav.more")}
            </div>
            {MORE.map((n) => <NavBtn key={n.id} {...n} />)}
          </nav>
          <ProfileMenu />
        </aside>
        <main className="main">
          <div className="main-inner">
          <div className="center" tabIndex={-1}><ForkReleaseBanner /><Screen /></div>
            <aside className="rail" aria-label={t("rail.label")} inert={route === "garden"}><Rail /></aside>
          </div>
        </main>
      </div>
      <BottomNav inert={!!(lessonId || sheet) || route === "garden"} />

      <div inert={!!sheet}>
      {lessonId && (lessonId.startsWith("story:") ? (story && <Story key={lessonId} {...story} />)
        : lessonId.startsWith("write:") ? (writing && <Writing key={lessonId} level={writing.level as Cefr} unit={writing.unit} />)
        : lessonId.startsWith("cards:") ? <Flashcards key={lessonId} deck={lessonId.slice(6)} />
        : lessonId.startsWith("tutor:") ? (callCh && <ErrorBoundary key={lessonId} scope="call"><TutorCall who={callWho!} ch={callCh} /></ErrorBoundary>)
        : /^(chat|call|rehearse|drill):/.test(lessonId) ? (talk && talkCh && <Chat key={lessonId} talk={talk} ch={talkCh} />) : <Lesson id={lessonId} />)}
      </div>
      </>}

      <div className={`sheet-scrim ${sheet ? "open" : ""}`} onClick={(e) => e.target === e.currentTarget && closeSheet()}>
        <div className="sheet" role="dialog" aria-modal="true" tabIndex={-1} ref={sheetBox}>{sheet}</div>
      </div>
      <div className={`toast ${toastOn ? "show" : ""}`} role="status">{toastMsg}</div>
    </>
  );
}
